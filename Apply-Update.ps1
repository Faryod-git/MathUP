param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$targetRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Target).Path)
if ($sourceRoot -eq $targetRoot) { throw 'Source and target must be different folders.' }
$package = Get-Content -LiteralPath (Join-Path $targetRoot 'package.json') -Raw | ConvertFrom-Json
if ($package.name -ne 'mathup-local') { throw 'Target is not MathUP Local.' }
$files = @('src\core.mjs','src\ui.mjs','src\bot-engine.mjs','src\student-selection.mjs','src\server.mjs','src\admin-design.mjs','src\button-labels.mjs','src\bot-content.mjs','src\bot-profile.mjs','src\database.mjs','src\poller.mjs','src\local-data.mjs','src\broadcast.mjs','src\broadcast-ui.mjs','src\groups.mjs','src\groups-ui.mjs','test\features.mjs','test\deletion.mjs','test\broadcast.mjs','test\groups.mjs','test\bot-content.mjs','test\run.mjs','scripts\configure-bot-profile.mjs','Install-Startup.ps1','README.md','STATUS.json','package.json')
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'update-manifest.json') -Raw | ConvertFrom-Json
foreach ($relative in $files) {
  $source = [IO.Path]::GetFullPath((Join-Path $sourceRoot $relative))
  $destination = [IO.Path]::GetFullPath((Join-Path $targetRoot $relative))
  if (-not $source.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar) -or -not $destination.StartsWith($targetRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Path escaped project.' }
  $expected = $manifest.PSObject.Properties[$relative].Value
  if (-not $expected -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $expected) { throw ('Source hash mismatch: ' + $relative) }
}
$backup = Join-Path $targetRoot ('backups\code-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$replaced = @()
try {
  foreach ($relative in $files) {
    $destination = Join-Path $targetRoot $relative
    $saved = Join-Path $backup $relative
    if (Test-Path -LiteralPath $destination) { New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($saved)) -Force | Out-Null; Copy-Item -LiteralPath $destination -Destination $saved }
    $replaced += $relative
    $temporary = $destination + '.mathup-update'
    Copy-Item -LiteralPath (Join-Path $sourceRoot $relative) -Destination $temporary -Force
    Move-Item -LiteralPath $temporary -Destination $destination -Force
  }
} catch {
  foreach ($relative in $replaced) { $saved = Join-Path $backup $relative; if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination (Join-Path $targetRoot $relative) -Force } }
  throw
}
Write-Output 'MathUP 1.7 source files updated. Config, credentials and database were not copied or changed.'
Write-Output 'Restart the existing server with Ctrl+C, then Start.ps1 -Bot. Refresh browser with Ctrl+F5.'
