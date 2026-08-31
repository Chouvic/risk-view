# Kill whatever holds a TCP port, so a server can bind it.
# Usage: powershell -File scripts\free-port.ps1 [PORT]   (default 8000).
#
# -LocalPort matches any connection state, so a server that left the socket
# bound but not listening is caught too; and because it is the *local* port, a
# browser merely connected to the port is not.
param([int]$Port = 8000)

$owners = @(
  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -gt 4 }
)

if ($owners.Count -eq 0) {
  Write-Output "port ${Port}: free"
  exit 0
}

Write-Output "port ${Port}: killing $($owners -join ' ')"
$owners | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
