param(
  [string]$InstallRoot = (Split-Path $PSScriptRoot -Parent),
  [string]$Profile,
  [switch]$Local,
  [string]$ProfilesRoot = 'D:\DRA\user-profiles',
  [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Profile)) {
  Write-Host 'Baselio profile launcher / Baselio 独立档案启动器'
  Write-Host 'Use one profile per person. Quit Baselio completely before switching.'
  Write-Host '同一人使用同一档案；切换前完全退出 Baselio，包括托盘。'
  if (Test-Path -LiteralPath $ProfilesRoot) { Get-ChildItem -LiteralPath $ProfilesRoot -Directory -Filter 'profile-*' | ForEach-Object { Write-Host $_.Name.Substring(8) } }
  $Profile = Read-Host 'Profile name (a-z, 0-9, hyphen) / 档案名称，例如 doctor-a'
  $choice = Read-Host 'Local mode without Baselio login? [y/N] / 是否免登录本地模式'
  $Local = $choice -match '^[yY]$'
}
if ($Profile -cnotmatch '^[a-z0-9][a-z0-9-]{0,33}$') { throw 'Use 1-34 lowercase letters, digits or hyphens.' }
if ($Local -and !$Profile.StartsWith('local-')) { $Profile = 'local-' + $Profile }
if (!$Local -and $Profile.StartsWith('local-')) { throw 'A local- profile must be launched in local mode.' }
if (![IO.Path]::IsPathRooted($ProfilesRoot)) { throw 'ProfilesRoot must be an absolute path.' }
if (Get-Process -Name 'medresearch-agent' -ErrorAction SilentlyContinue) { throw 'Quit Baselio, including its tray icon, before switching profiles.' }
$executable = Join-Path ([IO.Path]::GetFullPath($InstallRoot)) 'medresearch-agent.exe'
if (!(Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'Baselio installation was not found.' }
$env:DRA_PROFILES_ROOT = [IO.Path]::GetFullPath($ProfilesRoot)
$arguments = @('--dra-profile=' + $Profile)
if ($Local) { $arguments += '--dra-local' }
if ($ValidateOnly) { Write-Output "Validated profile: $Profile; local=$Local"; exit 0 }
# Public deployment remains inherited; conflicting legacy storage overrides fail in bootstrap.
Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden

