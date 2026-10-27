param([switch]$Bot)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'secrets.dpapi'))) { throw 'Avval Setup.ps1 va Start.ps1 orqali tekshiring.' }
$folder = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $folder 'MathUP Local.lnk'))
$link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$link.Arguments = '-NoProfile -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'Start.ps1') + '"'
if ($Bot) { $link.Arguments += ' -Bot' }
$link.WorkingDirectory = $PSScriptRoot
$link.Save()
Write-Host 'Shu Windows foydalanuvchisi tizimga kirganda MathUP ishga tushadi. Hozir yangi jarayon ochilmadi.'
