param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Launcher,
  [Parameter(Mandatory = $true)][string]$Publisher
)
$ErrorActionPreference = 'Stop'
foreach ($file in @($Installer, $Launcher)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing release artifact: $file" }
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  if ($signature.Status -ne 'Valid') { throw "Invalid release signature: $file ($($signature.Status))" }
  $actualPublisher = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  if ($actualPublisher -cne $Publisher) { throw "Unexpected release publisher: $file" }
  if ($null -eq $signature.TimeStamperCertificate) { throw "Missing release timestamp: $file" }
  Write-Host "Verified release signature, publisher and timestamp: $file"
}
