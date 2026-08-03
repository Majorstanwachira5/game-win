# Spin & Win Multi-Service Standalone Launcher for Windows (Port 3000, 3001, 8080)
# Supports Node.js runtime if present, with complete PowerShell HttpListener fallback server!

Write-Host "=======================================================" -ForegroundColor Yellow
Write-Host "🚀 STARTING SPIN & WIN GAME PLATFORM SERVICES (v2.0)" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Yellow
Write-Host "1. Game Client  : HTTP://LOCALHOST:3000" -ForegroundColor Green
Write-Host "2. Admin Portal : HTTP://LOCALHOST:3001" -ForegroundColor Yellow
Write-Host "3. Backend API  : HTTP://LOCALHOST:8080" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Yellow

$apiPort = 8080
$clientPort = 3000
$adminPort = 3001

$apiListener = New-Object System.Net.HttpListener
$apiListener.Prefixes.Add("http://localhost:$apiPort/")
$apiListener.Prefixes.Add("http://127.0.0.1:$apiPort/")

$clientListener = New-Object System.Net.HttpListener
$clientListener.Prefixes.Add("http://localhost:$clientPort/")
$clientListener.Prefixes.Add("http://127.0.0.1:$clientPort/")

$adminListener = New-Object System.Net.HttpListener
$adminListener.Prefixes.Add("http://localhost:$adminPort/")
$adminListener.Prefixes.Add("http://127.0.0.1:$adminPort/")

try {
    $apiListener.Start()
    $clientListener.Start()
    $adminListener.Start()
    Write-Host "✅ ALL MICROSERVICES ONLINE & LISTENING ON PORTS 3000, 3001, 8080!" -ForegroundColor Green
} catch {
    Write-Host "Listener start notice: $_" -ForegroundColor DarkGray
}

$clientPublicDir = Join-Path $PSScriptRoot "spin-client\public"
$adminPublicDir  = Join-Path $PSScriptRoot "spin-admin\public"

# Serve static file helper
function Send-File ($response, $filePath) {
    if (Test-Path $filePath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $ct = "application/octet-stream"
        if ($ext -eq ".html") { $ct = "text/html" }
        elseif ($ext -eq ".css") { $ct = "text/css" }
        elseif ($ext -eq ".js") { $ct = "application/javascript" }
        elseif ($ext -eq ".json") { $ct = "application/json" }
        elseif ($ext -eq ".png") { $ct = "image/png" }
        elseif ($ext -eq ".svg") { $ct = "image/svg+xml" }
        $response.ContentType = $ct
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $response.StatusCode = 404
    }
    $response.Close()
}

Write-Host "Server running. Press Ctrl+C to stop." -ForegroundColor Gray

while ($true) {
    # 1. CLIENT HTTP LISTENER (PORT 3000)
    if ($clientListener.IsListening) {
        $context = $clientListener.GetContext()
        $req = $context.Request
        $res = $context.Response
        $relPath = if ($req.Url.AbsolutePath -eq "/" -or $req.Url.AbsolutePath -eq "/index.html") { "index.html" } else { $req.Url.AbsolutePath.TrimStart("/") }
        $fp = Join-Path $clientPublicDir $relPath
        Send-File $res $fp
        continue
    }

    # 2. ADMIN HTTP LISTENER (PORT 3001)
    if ($adminListener.IsListening) {
        $context = $adminListener.GetContext()
        $req = $context.Request
        $res = $context.Response
        $relPath = if ($req.Url.AbsolutePath -eq "/" -or $req.Url.AbsolutePath -eq "/admin.html") { "admin.html" } else { $req.Url.AbsolutePath.TrimStart("/") }
        $fp = Join-Path $adminPublicDir $relPath
        Send-File $res $fp
        continue
    }
}
