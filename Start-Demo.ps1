$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\Resolve-Node.ps1')
& $script:MathUPNode app.mjs --demo
exit $LASTEXITCODE
