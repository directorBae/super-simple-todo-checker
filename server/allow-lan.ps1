$ErrorActionPreference = 'Stop'
$ruleName = 'TODO Checker personal sync (private LAN)'
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8787 -Profile Private -RemoteAddress LocalSubnet | Out-Null
}
Write-Host 'PC connection is ready on private Wi-Fi (TCP 8787, local subnet only).'
Read-Host 'Press Enter to close'
