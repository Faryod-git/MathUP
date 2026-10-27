param([switch]$Bot)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\Resolve-Node.ps1')
if ($Bot) { & $script:MathUPNode app.mjs --bot }
else { & $script:MathUPNode app.mjs }
exit $LASTEXITCODE
