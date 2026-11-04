$ErrorActionPreference = 'Stop'
$adminEmail = Read-Host 'Platform owner email'
$adminName = Read-Host 'Platform owner full name'
$adminSecurePassword = Read-Host 'Password (at least 16 characters)' -AsSecureString
$adminBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecurePassword)
try {
  $adminPayload = @{email=$adminEmail; name=$adminName; password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminBstr)}
  $adminPayload | ConvertTo-Json -Compress | npx tsx scripts/bootstrap-admin.ts
  if ($LASTEXITCODE -ne 0) { throw 'Admin bootstrap failed. No replacement of an existing owner is allowed.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminBstr)
  if ($adminPayload) { $adminPayload.password = $null }
}
