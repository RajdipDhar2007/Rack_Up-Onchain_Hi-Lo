# Run once as Administrator: lets phones/laptops on the same Wi-Fi reach the game on port 3000.
# Opens the port on every network profile (Windows often marks home Wi-Fi as "Public", which blocks it).
$ErrorActionPreference = "Stop"
$name = "Rack Up game (TCP 3000)"
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Any | Out-Null
Write-Host "Done. Port 3000 is open for players on your Wi-Fi."
