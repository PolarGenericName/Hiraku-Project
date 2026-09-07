$ErrorActionPreference = "Stop"
$h = @{"User-Agent"="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

$url = "https://akumast.net/i/j-c6zUakAAif8II1y7_8CVYNO928mogTtA6h_VHEernYFmaN0DLLyD3l5iHMWcRCXHLIh8W27m7twALqzdvaOjGZyj3CV4c/m.jpg"
$r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 -Headers $h
$xml = [xml]$r.Content

Write-Output "=== FULL MANIFEST ==="
Write-Output $r.Content
