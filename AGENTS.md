# Deploy this project

For a user request to deploy this repository on Windows 10/11 x64, use the published Windows release and the maintained deployment entry. The installed app includes the official Codex runtime.

## Run the installer

If the repository is checked out:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

If you only have the GitHub URL, save and run the deployment script:

```powershell
$deployScript = Join-Path $env:TEMP ('codex-dashboard-install-' + [Guid]::NewGuid().ToString('N') + '.ps1')
Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/zzy2670/codex-reset-forecast-dashboard/main/scripts/install.ps1' -OutFile $deployScript
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deployScript
```

The script downloads the latest installer, verifies its SHA-256 and executable header, installs for the current Windows user, and checks the quota connection. If sign-in is needed, it opens the app's official ChatGPT authorization flow and waits for the user to finish.

## Completion criteria

- Exit code `0`, `status: "ready"`, and `quotaConnected: true` mean the official service returned a valid quota window.
- Exit code `2` and `status: "login_required"` mean the user must finish ChatGPT authorization. Continue after authorization and run the check again.
- Exit code `1` means deployment or connection needs a repair. Read `reasonCode` and the command error, fix the identified issue, and repeat the check.

An existing installation can be checked without downloading or opening a window:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -CheckOnly -NoLaunch
```

For a custom installation, pass `-InstallDir` with its absolute directory. Personal quota requires a ChatGPT account that returns Codex quota windows. The account owner completes sign-in; credentials stay with the official local Codex process. Report the actual connection result to the user.

## Developing and releasing changes

For source changes, run the project's unit, privacy, interface, language and onboarding checks. Build the Windows release, verify the packaged runtime and deployment report, then publish through the release workflow. Use isolated profiles for tests. Preserve installed user data and avoid sending native test notifications.

Maintainer changes are installed locally after verification. Queue reviewed updates for publication at 00:00 Beijing time, at most once per day and only when updates exist. Do not push main, tags or releases immediately after edits. This schedule applies to publishing new versions; installing an already published release remains immediate.
