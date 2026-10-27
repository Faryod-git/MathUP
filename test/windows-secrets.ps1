$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$salt = [byte[]](0..15)
$derive = [Security.Cryptography.Rfc2898DeriveBytes]::new('Synthetic-cross-runtime-2026', $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256)
try { $hash = $derive.GetBytes(32) } finally { $derive.Dispose() }
$record = @{salt = [BitConverter]::ToString($salt).Replace('-', '').ToLowerInvariant(); hash = [BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant(); iterations = 600000}
$bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json -Compress))
$encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$decrypted = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
if ([Convert]::ToBase64String($bytes) -cne [Convert]::ToBase64String($decrypted)) { throw 'DPAPI roundtrip failed' }
[Console]::Write([Text.Encoding]::UTF8.GetString($decrypted))
