$ErrorActionPreference = 'Stop'
$path = Join-Path ([Environment]::GetFolderPath('Startup')) 'MathUP Local.lnk'
if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
Write-Host 'MathUP avtomatik ishga tushishi olib tashlandi. Joriy serverni uning oynasida Ctrl+C bilan toxtating.'
