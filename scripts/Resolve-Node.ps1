$ErrorActionPreference = 'Stop'
$candidate = Get-Command node -ErrorAction SilentlyContinue
if ($candidate) { $script:MathUPNode = $candidate.Source }
else {
  $bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $bundled) { $script:MathUPNode = $bundled }
  else { throw 'Node.js 24.13 yoki yangi 24.x versiyasini ornating.' }
}
$version = & $script:MathUPNode -p 'process.versions.node'
$parts = $version.Split('.')
if ([int]$parts[0] -lt 24 -or ([int]$parts[0] -eq 24 -and [int]$parts[1] -lt 13)) { throw 'Node.js kamida 24.13 bolishi kerak.' }
