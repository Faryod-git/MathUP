$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Add-Type -AssemblyName System.Security
$secretPath = Join-Path $PSScriptRoot 'secrets.dpapi'
$configPath = Join-Path $PSScriptRoot 'config.json'
if (Test-Path -LiteralPath $secretPath) {
  if ((Read-Host 'Mavjud maxfiy sozlamalarni almashtirish uchun ALMASHTIR yozing') -cne 'ALMASHTIR') { return }
}
function Read-PrivateText([string] $prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$password = Read-PrivateText 'Yangi admin paroli (12-256 belgi)'
$confirm = Read-PrivateText 'Parolni qayta kiriting'
if ($password.Length -lt 12 -or $password.Length -gt 256 -or $password -cne $confirm) { throw 'Parollar mos emas yoki uzunligi notogri.' }
$salt = New-Object byte[] 16
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($salt) } finally { $rng.Dispose() }
$derive = [Security.Cryptography.Rfc2898DeriveBytes]::new($password, $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256)
try { $hash = $derive.GetBytes(32) } finally { $derive.Dispose() }
$saltHex = [BitConverter]::ToString($salt).Replace('-', '').ToLowerInvariant()
$hashHex = [BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant()
$token = Read-PrivateText 'BotFather tokeni (hozircha faqat admin kerak bolsa Enter)'
if ($token -and $token -notmatch '^\d{5,16}:[A-Za-z0-9_-]{30,100}$') { throw 'Token formati notogri.' }
$telegramId = Read-Host 'Ozingizning Telegram raqamli ID (bot sinovi uchun; hozircha Enter mumkin)'
if ($telegramId -and ($telegramId -notmatch '^[1-9]\d{0,15}$')) { throw 'Telegram ID notogri.' }
$secrets = @{adminPassword = @{salt = $saltHex; hash = $hashHex; iterations = 600000}; botToken = $token}
$plain = [Text.Encoding]::UTF8.GetBytes(($secrets | ConvertTo-Json -Depth 5 -Compress))
$encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($secretPath, $encrypted)
if (-not (Test-Path -LiteralPath $configPath)) {
  $ids = @(); if ($telegramId) { $ids = @($telegramId) }
  $config = @{host = '127.0.0.1'; port = 8787; botUsername = 'MathUP_Gallaorol_Testbot'; adminTelegramIds = $ids; audience = 'admins'; publicRegistrationEnabled = $false}
  [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
} else { Write-Host 'config.json saqlandi. Yangi Telegram ID kerak bolsa faylda adminTelegramIds ni yangilang.' }
$password = $null; $confirm = $null; $token = $null; $plain = $null; $secrets = $null
Write-Host 'Sozlamalar saqlandi. Start.ps1 adminni ochadi. Bot yoki ChatPlace ulanishi ozgartirilmadi.'
