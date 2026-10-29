$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$root = Join-Path ([IO.Path]::GetTempPath()) ('mathup-update-test-' + [guid]::NewGuid().ToString('N'))
$source = Join-Path $root 'source'
$target = Join-Path $root 'target'
New-Item -ItemType Directory -Path $source,$target -Force | Out-Null
function Write-Utf8($Path,$Text) {
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($Path)) -Force | Out-Null
  [IO.File]::WriteAllText($Path,$Text,(New-Object Text.UTF8Encoding($false)))
}
function Check($Condition,$Message) { if (-not $Condition) { throw $Message } }
function Apply { & (Join-Path $source 'Apply-Update.ps1') -Target $target | Out-Null }
function Must-Fail { $failed=$false; try { Apply } catch { $failed=$true }; Check $failed 'Expected update rejection.' }
try {
  $manifest=Get-Content -LiteralPath (Join-Path $project 'update-manifest.json') -Raw | ConvertFrom-Json
  foreach ($p in $manifest.PSObject.Properties) {
    $destination=Join-Path $source $p.Name
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $project $p.Name) -Destination $destination
  }
  Copy-Item -LiteralPath (Join-Path $project 'Apply-Update.ps1') -Destination $source
  Copy-Item -LiteralPath (Join-Path $project 'update-manifest.json') -Destination $source
  Write-Utf8 (Join-Path $target 'package.json') '{"name":"mathup-local","version":"synthetic-old"}'
  Write-Utf8 (Join-Path $target 'config.json') 'SYNTHETIC PRIVATE CONFIG'
  Write-Utf8 (Join-Path $target 'secrets.dpapi') 'SYNTHETIC PRIVATE SECRET'
  Write-Utf8 (Join-Path $target 'data\sentinel.txt') 'SYNTHETIC PRIVATE DATA'
  Write-Utf8 (Join-Path $target 'src\core.mjs') 'SYNTHETIC OLD CORE'
  Write-Utf8 (Join-Path $target 'src\poller.mjs') 'SYNTHETIC OLD POLLER'
  Write-Utf8 (Join-Path $source 'content\practice\catalog.json') '{"schema_version":1,"topics":[]}'
  $private=[ordered]@{'content\practice\catalog.json'=(Get-FileHash (Join-Path $source 'content\practice\catalog.json') -Algorithm SHA256).Hash}
  $privateJson=$private | ConvertTo-Json
  Write-Utf8 (Join-Path $source 'practice-content-manifest.json') $privateJson
  if ($env:OS -eq 'Windows_NT') {
    $lock=[IO.File]::Open((Join-Path $target 'src\poller.mjs'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try { Must-Fail } finally { $lock.Dispose() }
    Check ((Get-Content -LiteralPath (Join-Path $target 'src\core.mjs') -Raw) -eq 'SYNTHETIC OLD CORE') 'Rollback did not restore old file.'
    Check (-not (Test-Path -LiteralPath (Join-Path $target 'src\practice-catalog.mjs'))) 'Rollback retained a newly added file.'
  }
  Apply
  Check ((Get-FileHash (Join-Path $target 'src\practice-catalog.mjs') -Algorithm SHA256).Hash -eq $manifest.PSObject.Properties['src\practice-catalog.mjs'].Value) 'New module was not copied.'
  Check ((Get-Content -LiteralPath (Join-Path $target 'content\practice\catalog.json') -Raw) -eq '{"schema_version":1,"topics":[]}') 'Private catalog was not copied.'
  foreach ($p in @(@('config.json','SYNTHETIC PRIVATE CONFIG'),@('secrets.dpapi','SYNTHETIC PRIVATE SECRET'),@('data\sentinel.txt','SYNTHETIC PRIVATE DATA'))) { Check ((Get-Content -LiteralPath (Join-Path $target $p[0]) -Raw) -eq $p[1]) 'Private settings changed.' }
  $before=(Get-FileHash (Join-Path $target 'package.json') -Algorithm SHA256).Hash
  Write-Utf8 (Join-Path $source 'practice-content-manifest.json') '{"content\\practice\\catalog.json":"0000000000000000000000000000000000000000000000000000000000000000"}'
  Must-Fail
  Check ((Get-FileHash (Join-Path $target 'package.json') -Algorithm SHA256).Hash -eq $before) 'Hash rejection changed target.'
  Write-Utf8 (Join-Path $source 'practice-content-manifest.json') '{"content\\practice\\catalog.json":"0000000000000000000000000000000000000000000000000000000000000000","..\\escape.txt":"0000000000000000000000000000000000000000000000000000000000000000"}'
  Must-Fail
  Check (-not (Test-Path -LiteralPath (Join-Path $root 'escape.txt'))) 'Path escaped target.'
  Write-Utf8 (Join-Path $source 'practice-content-manifest.json') $privateJson
  Remove-Item -LiteralPath (Join-Path $target 'src\practice-catalog.mjs') -Force
  New-Item -ItemType Directory -Path (Join-Path $target 'src\practice-catalog.mjs') | Out-Null
  Must-Fail
  Write-Output 'PASS updater: optional private content, hashes, paths, backup, rollback and private settings preservation.'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
