'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const script = path.resolve(__dirname, '../scripts/install.ps1');
const psQuote = value => "'" + value.replaceAll("'", "''") + "'";
function run(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-install-test-'));
  try {
    const harness = path.join(dir, 'harness.ps1');
    fs.writeFileSync(harness, "\ufeff$ErrorActionPreference='Stop'\n. " + psQuote(script) + '\n$testDir = ' + psQuote(dir) + '\n' + body);
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', harness], {encoding:'utf8', timeout:30000});
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return result.stdout.trim();
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
const windows = {skip:process.platform !== 'win32'};

test('deployment entry parses in Windows PowerShell without external modules', windows, () => {
  assert.equal(run(`$tokens=$null; $errors=$null
[System.Management.Automation.Language.Parser]::ParseFile(${psQuote(script)}, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count) { throw ($errors | Out-String) }
'ok'`), 'ok');
});

test('release metadata selects the exact stable installer and rejects foreign assets', windows, () => {
  assert.equal(run(`$script:foreign = $false
function Invoke-Download {
 param($Uri,$OutFile)
 $base='https://github.com/zzy2670/codex-reset-forecast-dashboard/releases/download/v2.0.4/'
 if ($script:foreign) { $base='https://example.com/releases/download/v2.0.4/' }
 $assets=@('Codex-Reset-Forecast-Dashboard-Setup-2.0.4-x64.exe','SHA256SUMS.txt','LICENSE') | ForEach-Object { @{name=$_;browser_download_url=($base+$_)} }
 @{draft=$false;prerelease=$false;tag_name='v2.0.4';assets=$assets} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutFile
}
$r=Get-Release -WorkDir $testDir
if ($r.Version -ne '2.0.4' -or $r.Assets.Count -ne 3) { throw 'release mismatch' }
$script:foreign=$true
try { Get-Release -WorkDir $testDir; throw 'foreign URL accepted' } catch { if ($_.Exception.Message -ne 'Unexpected release asset URL.') { throw } }
'ok'`), 'ok');
});

test('installer requires matching SHA-256, a unique manifest entry and MZ bytes', windows, () => {
  assert.equal(run(`$exe=Join-Path $testDir 'Setup app.exe'; $sums=Join-Path $testDir 'SHA256SUMS.txt'
[IO.File]::WriteAllBytes($exe,[byte[]](77,90,0,1))
$hash=(Get-Sha256 $exe)
"$hash  Setup app.exe" | Set-Content -LiteralPath $sums
Test-Installer $exe $sums
[IO.File]::WriteAllBytes($exe,[byte[]](77,90,0,2))
try { Test-Installer $exe $sums; throw 'bad hash accepted' } catch { if ($_.Exception.Message -ne 'Installer SHA-256 checksum mismatch.') { throw } }
[IO.File]::WriteAllBytes($exe,[byte[]](0,0,0,1))
$hash=(Get-Sha256 $exe)
"$hash  Setup app.exe" | Set-Content -LiteralPath $sums
try { Test-Installer $exe $sums; throw 'bad exe accepted' } catch { if ($_.Exception.Message -ne 'Installer is not a Windows executable.') { throw } }
@("$hash  Setup app.exe","$hash  Setup app.exe") | Set-Content -LiteralPath $sums
try { Test-Installer $exe $sums; throw 'duplicate accepted' } catch { if ($_.Exception.Message -ne 'Installer checksum is missing or duplicated.') { throw } }
'ok'`), 'ok');
});

test('download retries are bounded and retain the actual final error', windows, () => {
  assert.equal(run(`$script:attempts=0; $script:failAlways=$false
function Start-Sleep { param($Seconds) }
function Invoke-WebRequest { param($Uri,$OutFile,[switch]$UseBasicParsing,$TimeoutSec,$Headers)
 $script:attempts++
 if ($script:failAlways -or $script:attempts -lt 3) { throw 'network-test-error' }
 [IO.File]::WriteAllText($OutFile,'ok')
}
Invoke-Download 'https://github.com/test' (Join-Path $testDir 'download')
if ($script:attempts -ne 3) { throw 'retry count mismatch' }
$script:attempts=0; $script:failAlways=$true
try { Invoke-Download 'https://github.com/test' (Join-Path $testDir 'download'); throw 'failure ignored' } catch { if ($_.Exception.Message -ne 'network-test-error') { throw } }
if ($script:attempts -ne 3) { throw 'retry unbounded' }
'ok'`), 'ok');
});

test('quota probe accepts a real ready result, preserves login_required and rejects false success', windows, () => {
  assert.equal(run(`$exe=Join-Path $testDir 'Codex Reset Dashboard.exe'; [IO.File]::WriteAllText($exe,'fake')
$script:mode='ready'
function Start-Process { param($FilePath,$ArgumentList,$WindowStyle,[switch]$PassThru)
 if ($ArgumentList -notmatch '--deployment-result=(.+)"$') { throw 'missing result argument' }
 $dest=$Matches[1]
 @{version='2.0.4'; status=$script:mode;quotaConnected=($script:mode -ne 'login_required');reasonCode='checked'} | ConvertTo-Json | Set-Content -LiteralPath $dest
 $proc=[pscustomobject]@{}
 $proc | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { param($timeout) return $true }
 return $proc
}
$r=Get-DeploymentCheck $exe $testDir
if ($r.status -ne 'ready' -or -not $r.quotaConnected) { throw 'ready lost' }
$script:mode='login_required'; $r=Get-DeploymentCheck $exe $testDir
if ($r.status -ne 'login_required' -or $r.quotaConnected) { throw 'login falsely ready' }
$script:mode='error'
try { Get-DeploymentCheck $exe $testDir; throw 'false quota accepted' } catch { if ($_.Exception.Message -ne 'Quota connection was not verified.') { throw } }
'ok'`), 'ok');
});

test('NSIS destination with spaces remains the final unquoted /D argument', windows, () => {
  assert.equal(run(`$script:argsSeen=''
function Invoke-Download { param($Uri,$OutFile) [IO.File]::WriteAllText($OutFile,'fake') }
function Test-Installer { param($InstallerPath,$SumsPath) }
function Start-Process { param($FilePath,$ArgumentList,$WindowStyle,[switch]$Wait,[switch]$PassThru)
 $script:argsSeen=$ArgumentList
 return [pscustomobject]@{ExitCode=0}
}
$r=@{Installer='Setup.exe';Assets=@{'Setup.exe'='https://test/Setup';'SHA256SUMS.txt'='https://test/Sums';'LICENSE'='https://test/LICENSE'}}
$dest=Join-Path $testDir 'With spaces\Dashboard'
Install-Release $r $dest $testDir
if ($script:argsSeen -cne ('/S /currentuser /D='+$dest)) { throw 'NSIS argument mismatch' }
'ok'`), 'ok');
});

test('current install reuse, check-only and login waiting never claim unconnected quota as ready', windows, () => {
  assert.equal(run(`$exe=Join-Path $testDir 'Codex Reset Dashboard.exe'; [IO.File]::WriteAllText($exe,'fake')
$script:installs=0; $script:launches=0; $script:checks=0; $script:allowReady=$false
function Get-Item { param($LiteralPath) return [pscustomobject]@{VersionInfo=[pscustomobject]@{ProductVersion='2.0.4'}} }
function Get-Release { param($WorkDir) return @{Version='2.0.4'} }
function Install-Release { param($Release,$TargetDir,$WorkDir) $script:installs++ }
function Get-DeploymentCheck { param($ExecutablePath,$WorkDir)
 $script:checks++
 if ($script:allowReady -and $script:checks -gt 1) { return @{version='2.0.4';status='ready';quotaConnected=$true;reasonCode='connected'} }
 return @{version='2.0.4';status='login_required';quotaConnected=$false;reasonCode='login_required'}
}
function Start-Process { param($FilePath,$WindowStyle,$ArgumentList)
 if ($ArgumentList -cne '--connect-quota') { throw 'Login connection argument missing' }
 $script:launches++
}
function Start-Sleep { param($Seconds) if ($Seconds -ne 15) { throw 'poll interval mismatch' } }
$r=Invoke-Deployment $testDir $testDir -SkipLaunch
if ($r.status -ne 'login_required' -or $script:launches -or $script:installs) { throw 'reuse or NoLaunch failed' }
$r=Invoke-Deployment $testDir $testDir -WaitSeconds 0
if ($r.status -ne 'login_required' -or $r.quotaConnected -or $script:launches -ne 1) { throw 'pending login falsely succeeded' }
$script:checks=0; $script:allowReady=$true
$r=Invoke-Deployment $testDir $testDir -WaitSeconds 30
if ($r.status -ne 'ready' -or -not $r.quotaConnected) { throw 'login completion not verified' }
function Get-Release { throw 'CheckOnly made a network request' }
$r=Invoke-Deployment $testDir $testDir -OnlyCheck
if ($script:installs) { throw 'CheckOnly installed' }
'ok'`), 'ok');
});

test('CLI check-only failure returns structured status without launching or downloading', windows, () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dashboard-checkonly-'));
  try {
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-CheckOnly','-NoLaunch','-InstallDir',dir],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,1,result.stderr);
    const report=JSON.parse(result.stdout.trim());
    assert.equal(report.status,'error');
    assert.equal(report.reasonCode,'not_installed');
    assert.equal(report.quotaConnected,false);
    assert.equal('installPath' in report,false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('upgrade skips legacy checks, validates the installed version and never launches under NoLaunch', windows, () => {
  assert.equal(run(`$exe=Join-Path $testDir 'Codex Reset Dashboard.exe'; [IO.File]::WriteAllText($exe,'legacy')
$script:installs=0; $script:checks=0; $script:wrongVersion=$false
function Get-Item { param($LiteralPath) return [pscustomobject]@{VersionInfo=[pscustomobject]@{ProductVersion='2.0.3'}} }
function Get-Release { param($WorkDir) return @{Version='2.0.4'} }
function Install-Release { param($Release,$TargetDir,$WorkDir) $script:installs++ }
function Start-Process { throw 'NoLaunch started the GUI' }
function Get-DeploymentCheck { param($ExecutablePath,$WorkDir)
 if ($script:installs -eq 0) { throw 'Legacy EXE invoked with unsupported check argument' }
 $script:checks++
 $v='2.0.4'; if ($script:wrongVersion) { $v='2.0.3' }
 return @{version=$v;status='ready';quotaConnected=$true;reasonCode='connected'}
}
$r=Invoke-Deployment $testDir $testDir -SkipLaunch
if ($script:installs -ne 1 -or $script:checks -ne 1 -or $r.status -ne 'ready') { throw 'upgrade failed' }
$script:wrongVersion=$true
try { Invoke-Deployment $testDir $testDir -SkipLaunch; throw 'version mismatch accepted' } catch { if ($_.Exception.Message -ne 'Installed version does not match the release.') { throw } }
'ok'`), 'ok');
});

test('actual deploymentReport results pass the PowerShell probe contract', windows, async () => {
  const {deploymentReport}=require('../app/deployment-check.cjs');
  const version='2.0.4';
  const readyClient={
    setupStatus:async()=>({authenticated:true}),
    read:async()=>({state:'ok',limits:[{primary:{usedPercent:12,durationMins:300,resetsAt:new Date(Date.now()+3600000).toISOString()}}]})
  };
  const reports=await Promise.all([
    deploymentReport(readyClient,version),
    deploymentReport({setupStatus:async()=>({authenticated:false})},version),
    deploymentReport({setupStatus:async()=>({errorCode:'RUNTIME_MISSING'})},version),
    deploymentReport({...readyClient,read:async()=>({state:'ok',limits:[]})},version),
    deploymentReport({setupStatus:async()=>{throw Object.assign(new Error('hidden details'),{code:'REQUEST_TIMEOUT'});}},version)
  ]);
  assert.equal(reports[0].reasonCode,null);
  assert.equal(reports[1].reasonCode,'CHATGPT_LOGIN_REQUIRED');
  const encoded=Buffer.from(JSON.stringify(reports)).toString('base64');
  assert.equal(run(`$exe=Join-Path $testDir 'Codex Reset Dashboard.exe'; [IO.File]::WriteAllText($exe,'fake')
$reports=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
function Start-Process { param($FilePath,$ArgumentList,$WindowStyle,[switch]$PassThru)
 if ($ArgumentList -notmatch '--deployment-result=(.+)"$') { throw 'missing result argument' }
 $script:reportToReturn | ConvertTo-Json -Compress | Set-Content -LiteralPath $Matches[1]
 $proc=[pscustomobject]@{}
 $proc | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { param($timeout) return $true }
 return $proc
}
foreach ($report in $reports) {
 $script:reportToReturn=$report
 $actual=Get-DeploymentCheck $exe $testDir
 if ($actual.status -cne $report.status -or $actual.quotaConnected -ne $report.quotaConnected -or $actual.reasonCode -cne $report.reasonCode) { throw 'production report contract mismatch' }
}
foreach ($bad in @($null,'contains secret spaces','URL/fragment',('A'*81))) {
 $script:reportToReturn=[pscustomobject]@{version='2.0.4';status='error';quotaConnected=$false;reasonCode=$bad}
 try { Get-DeploymentCheck $exe $testDir; throw 'unsafe reason accepted' } catch { if ($_.Exception.Message -ne 'Invalid quota deployment result.') { throw } }
}
'ok'`), 'ok');
});
