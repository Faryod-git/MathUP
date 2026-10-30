param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$targetRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Target).Path)
if ($sourceRoot -eq $targetRoot) { throw 'Source and target must be different folders.' }
$package = Get-Content -LiteralPath (Join-Path $targetRoot 'package.json') -Raw | ConvertFrom-Json
if ($package.name -ne 'mathup-local') { throw 'Target is not MathUP Local.' }
$files = @('src\core.mjs','src\ui.mjs','src\bot-engine.mjs','src\student-selection.mjs','src\server.mjs','src\admin-design.mjs','src\button-labels.mjs','src\bot-content.mjs','src\practice-sections.mjs','src\practice-catalog.mjs','src\bot-profile.mjs','src\database.mjs','src\poller.mjs','src\local-data.mjs','src\broadcast.mjs','src\broadcast-ui.mjs','src\groups.mjs','src\groups-ui.mjs','test\features.mjs','test\deletion.mjs','test\broadcast.mjs','test\groups.mjs','test\bot-content.mjs','test\practice-sections.mjs','test\practice-topics.mjs','test\windows-update.ps1','test\run.mjs','scripts\configure-bot-profile.mjs','Install-Startup.ps1','README.md','STATUS.json','package.json')
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'update-manifest.json') -Raw | ConvertFrom-Json
# Private course content is optional and never included in the public code manifest.
$contentManifestPath = Join-Path $sourceRoot 'practice-content-manifest.json'
if (Test-Path -LiteralPath $contentManifestPath) {
  $privateManifest = Get-Content -LiteralPath $contentManifestPath -Raw | ConvertFrom-Json
  $properties = @($privateManifest.PSObject.Properties)
  if ($properties.Count -lt 1 -or $properties.Count -gt 3001 -or -not $privateManifest.PSObject.Properties['content\practice\catalog.json']) { throw 'Invalid private content manifest.' }
  foreach ($property in $properties) {
    if ($property.Name -cnotmatch '^content\\practice\\(catalog\.json|yie-[123]\\topic-[0-9]{2,3}\.png)$' -or $property.Value -cnotmatch '^[A-F0-9]{64}$') { throw 'Invalid private content path or hash.' }
    if ($manifest.PSObject.Properties[$property.Name]) { throw 'Duplicate update path.' }
    $manifest | Add-Member -MemberType NoteProperty -Name $property.Name -Value $property.Value
    $files += $property.Name
  }
}
foreach ($relative in $files) {
  $source = [IO.Path]::GetFullPath((Join-Path $sourceRoot $relative))
  $destination = [IO.Path]::GetFullPath((Join-Path $targetRoot $relative))
  if (-not $source.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar) -or -not $destination.StartsWith($targetRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Path escaped project.' }
  if ((Test-Path -LiteralPath $destination) -and -not (Test-Path -LiteralPath $destination -PathType Leaf)) { throw ('Target path is not a file: ' + $relative) }
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
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
    $temporary = $destination + '.mathup-update'
    Copy-Item -LiteralPath (Join-Path $sourceRoot $relative) -Destination $temporary -Force
    Move-Item -LiteralPath $temporary -Destination $destination -Force
  }
} catch {
  foreach ($relative in $replaced) {
    $saved = Join-Path $backup $relative
    $destination = Join-Path $targetRoot $relative
    if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination $destination -Force }
    elseif (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
    if (Test-Path -LiteralPath ($destination + '.mathup-update')) { Remove-Item -LiteralPath ($destination + '.mathup-update') -Force }
  }
  throw
}
Write-Output 'MathUP 1.10.1 code and supplied private course content updated. Config, credentials and database were not copied or changed.'
Write-Output 'Restart the existing server with Ctrl+C, then Start.ps1 -Bot. Refresh browser with Ctrl+F5.'
