[CmdletBinding()]
param(
    [switch]$NoLaunch,
    [switch]$CheckOnly,
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\CodexResetDashboard'),
    [ValidateRange(0, 1800)][int]$LoginTimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:Repository = 'zzy2670/codex-reset-forecast-dashboard'
$script:ExecutableName = 'Codex Reset Dashboard.exe'

function Invoke-Download {
    param([string]$Uri, [string]$OutFile)
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing -TimeoutSec 300 -Headers @{ 'User-Agent' = 'Codex-Reset-Forecast-Dashboard-Installer' } | Out-Null
            return
        } catch {
            if ($attempt -eq 3) { throw }
            Start-Sleep -Seconds ($attempt * 2)
        }
    }
}

function Get-Release {
    param([string]$WorkDir)
    $metadataPath = Join-Path $WorkDir 'release.json'
    Invoke-Download -Uri "https://api.github.com/repos/$script:Repository/releases/latest" -OutFile $metadataPath
    $release = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    if ($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^v(\d+\.\d+\.\d+)$') { throw 'No stable release was returned.' }
    $version = $Matches[1]
    $names = @("Codex-Reset-Forecast-Dashboard-Setup-$version-x64.exe", 'SHA256SUMS.txt', 'LICENSE')
    $assets = @{}
    foreach ($name in $names) {
        $found = @($release.assets | Where-Object { $_.name -ceq $name })
        if ($found.Count -ne 1) { throw "Missing or duplicate release asset: $name" }
        $uri = [Uri]$found[0].browser_download_url
        $prefix = "/$script:Repository/releases/download/$($release.tag_name)/"
        if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'github.com' -or -not $uri.AbsolutePath.StartsWith($prefix, [StringComparison]::Ordinal)) { throw 'Unexpected release asset URL.' }
        $assets[$name] = $uri.AbsoluteUri
    }
    return @{ Version = $version; Assets = $assets; Installer = $names[0] }
}

function Get-Sha256 {
    param([string]$Path)
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}

function Test-Installer {
    param([string]$InstallerPath, [string]$SumsPath)
    $name = [IO.Path]::GetFileName($InstallerPath)
    $pattern = '^(?<hash>[a-fA-F0-9]{64})\s+\*?' + [Regex]::Escape($name) + '$'
    $hashes = @(foreach ($line in Get-Content -LiteralPath $SumsPath) {
        if ($line -match $pattern) { $Matches['hash'].ToLowerInvariant() }
    })
    if ($hashes.Count -ne 1) { throw 'Installer checksum is missing or duplicated.' }
    $actual = Get-Sha256 -Path $InstallerPath
    if ($actual -cne $hashes[0]) { throw 'Installer SHA-256 checksum mismatch.' }
    $stream = [IO.File]::OpenRead($InstallerPath)
    try {
        if ($stream.ReadByte() -ne 77 -or $stream.ReadByte() -ne 90) { throw 'Installer is not a Windows executable.' }
    } finally { $stream.Dispose() }
}

function Get-DeploymentCheck {
    param([string]$ExecutablePath, [string]$WorkDir)
    if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
        return @{ version = ''; status = 'error'; quotaConnected = $false; reasonCode = 'not_installed' }
    }
    $resultPath = Join-Path $WorkDir ('check-' + [Guid]::NewGuid().ToString('N') + '.json')
    $arguments = '--deployment-check "--deployment-result=' + $resultPath + '"'
    $process = Start-Process -FilePath $ExecutablePath -ArgumentList $arguments -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(90000)) {
        $process.Kill()
        throw 'Quota deployment check timed out.'
    }
    if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) { throw 'Quota deployment check did not produce a result.' }
    $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
    $safeReason = ($null -eq $result.reasonCode -and $result.status -eq 'ready') -or
        ($result.reasonCode -is [string] -and $result.reasonCode -cmatch '^[A-Za-z0-9_]{1,80}$')
    if ($result.status -notin @('ready', 'login_required', 'error') -or
        $result.quotaConnected -isnot [bool] -or
        $result.version -notmatch '^\d+\.\d+\.\d+$' -or
        -not $safeReason) { throw 'Invalid quota deployment result.' }
    if (($result.status -eq 'ready') -ne $result.quotaConnected) { throw 'Quota connection was not verified.' }
    return @{ version = $result.version; status = $result.status; quotaConnected = $result.quotaConnected; reasonCode = $result.reasonCode }
}

function Install-Release {
    param([hashtable]$Release, [string]$TargetDir, [string]$WorkDir)
    foreach ($name in @($Release.Installer, 'SHA256SUMS.txt', 'LICENSE')) {
        Invoke-Download -Uri $Release.Assets[$name] -OutFile (Join-Path $WorkDir $name)
    }
    $installer = Join-Path $WorkDir $Release.Installer
    Test-Installer -InstallerPath $installer -SumsPath (Join-Path $WorkDir 'SHA256SUMS.txt')
    # NSIS requires /D to be the final argument, without quotes around its value.
    $arguments = '/S /currentuser /D=' + $TargetDir
    $process = Start-Process -FilePath $installer -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)." }
}

function Invoke-Deployment {
    param([string]$TargetDir, [string]$WorkDir, [switch]$OnlyCheck, [switch]$SkipLaunch, [int]$WaitSeconds = 300)
    $executable = Join-Path $TargetDir $script:ExecutableName
    if ($OnlyCheck) { return Get-DeploymentCheck -ExecutablePath $executable -WorkDir $WorkDir }
    $release = Get-Release -WorkDir $WorkDir
    $installedVersion = ''
    if (Test-Path -LiteralPath $executable -PathType Leaf) {
        $productVersion = (Get-Item -LiteralPath $executable).VersionInfo.ProductVersion
        if ($productVersion -match '^(\d+\.\d+\.\d+)(?:\.|$)') { $installedVersion = $Matches[1] }
    }
    if ($installedVersion -eq $release.Version) {
        $check = Get-DeploymentCheck -ExecutablePath $executable -WorkDir $WorkDir
    } else {
        Install-Release -Release $release -TargetDir $TargetDir -WorkDir $WorkDir
        $check = Get-DeploymentCheck -ExecutablePath $executable -WorkDir $WorkDir
        if ($check.version -ne $release.Version) { throw 'Installed version does not match the release.' }
    }
    if (-not $SkipLaunch -and $check.status -ne 'error') {
        if ($check.status -eq 'login_required') { Start-Process -FilePath $executable -ArgumentList '--connect-quota' -WindowStyle Hidden | Out-Null } else { Start-Process -FilePath $executable -WindowStyle Hidden | Out-Null }
        if ($check.status -eq 'login_required') {
            $deadline = [DateTime]::UtcNow.AddSeconds($WaitSeconds)
            while ([DateTime]::UtcNow -lt $deadline) {
                Start-Sleep -Seconds 15
                $check = Get-DeploymentCheck -ExecutablePath $executable -WorkDir $WorkDir
                if ($check.status -ne 'login_required') { break }
            }
        }
    }
    return $check
}

if ($MyInvocation.InvocationName -ne '.') {
    $workDir = $null
    try {
        if (-not [Environment]::Is64BitOperatingSystem -or $env:OS -ne 'Windows_NT') { throw 'Windows 10 or 11 x64 is required.' }
        if (-not [IO.Path]::IsPathRooted($InstallDir) -or $InstallDir.Contains('"') -or $InstallDir.Contains("`n") -or $InstallDir.Contains("`r")) { throw 'InstallDir must be an absolute Windows directory.' }
        $targetDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
        if ($targetDir -eq [IO.Path]::GetPathRoot($targetDir).TrimEnd('\')) { throw 'InstallDir cannot be a drive root.' }
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        $workDir = Join-Path $tempRoot ('codex-dashboard-install-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $workDir | Out-Null
        $result = Invoke-Deployment -TargetDir $targetDir -WorkDir $workDir -OnlyCheck:$CheckOnly -SkipLaunch:$NoLaunch -WaitSeconds $LoginTimeoutSeconds
        $result | ConvertTo-Json -Compress
        if ($result.status -eq 'ready') { exit 0 }
        if ($result.status -eq 'login_required') { exit 2 }
        exit 1
    } catch {
        @{ status = 'error'; quotaConnected = $false; reasonCode = 'deployment_failed' } | ConvertTo-Json -Compress
        Write-Error $_ -ErrorAction Continue
        exit 1
    } finally {
        if ($workDir -and (Test-Path -LiteralPath $workDir)) {
            $resolved = [IO.Path]::GetFullPath($workDir)
            if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolved) -match '^codex-dashboard-install-[a-f0-9]{32}$') {
                Remove-Item -LiteralPath $resolved -Recurse -Force
            }
        }
    }
}
