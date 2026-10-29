param(
  [switch]$Bot,
  [string]$ProjectPath = $PSScriptRoot,
  [string]$StartupFolder = [Environment]::GetFolderPath('Startup')
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ProjectPath).Path)
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
if ($package.name -ne 'mathup-local') { throw 'ProjectPath is not MathUP Local.' }
$startScript = Join-Path $projectRoot 'Start.ps1'
if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) { throw 'Start.ps1 topilmadi.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'secrets.dpapi') -PathType Leaf)) { throw 'Avval Setup.ps1 va Start.ps1 orqali tekshiring.' }
$folder = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $StartupFolder).Path)
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $folder 'MathUP Local.lnk'))
$link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$link.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $startScript + '"'
if ($Bot) { $link.Arguments += ' -Bot' }
$link.WorkingDirectory = $projectRoot
$link.Description = 'MathUP local admin and optional Telegram bot at Windows sign-in'
$link.Save()
$saved = $shell.CreateShortcut((Join-Path $folder 'MathUP Local.lnk'))
if ($saved.TargetPath -ne $link.TargetPath -or $saved.Arguments -ne $link.Arguments -or $saved.WorkingDirectory -ne $projectRoot) { throw 'Startup shortcut verification failed.' }
Write-Host 'Shu Windows foydalanuvchisi tizimga kirganda MathUP ishga tushadi. Hozir yangi jarayon ochilmadi.'
