# Single-Port Express Launcher for Spin & Win Platform (Port 3000)
# Static file server for client & admin pages

Write-Host "=======================================================" -ForegroundColor Yellow
Write-Host "🎰 SPIN & WIN PLATFORM LAUNCHER (PORT 3000)" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Yellow
Write-Host "Client UI    : http://localhost:3000" -ForegroundColor Cyan
Write-Host "Admin Portal : http://localhost:3000/admin.html" -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Yellow

$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
    Write-Host "✅ LISTENER ONLINE ON PORT 3000" -ForegroundColor Green
} catch {
    Write-Host "Listener notice: $_" -ForegroundColor DarkGray
}

$clientDir = Join-Path $PSScriptRoot "spin-client\public"
$adminDir  = Join-Path $PSScriptRoot "spin-admin\public"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    $path = $req.Url.AbsolutePath

    $targetDir = if ($path.StartsWith("/admin") -or $path -eq "/admin.html") { $adminDir } else { $clientDir }
    $file = if ($path -eq "/" -or $path -eq "/index.html") { "index.html" } elseif ($path -eq "/admin.html") { "admin.html" } else { $path.TrimStart("/") }
    $fullPath = Join-Path $targetDir $file

    if (-not (Test-Path $fullPath -PathType Leaf)) {
        $fullPath = Join-Path $clientDir $file
    }

    if (Test-Path $fullPath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
        $ct = "application/octet-stream"
        if ($ext -eq ".html") { $ct = "text/html" }
        elseif ($ext -eq ".css") { $ct = "text/css" }
        elseif ($ext -eq ".js") { $ct = "application/javascript" }
        elseif ($ext -eq ".json") { $ct = "application/json" }
        elseif ($ext -eq ".png") { $ct = "image/png" }
        elseif ($ext -eq ".svg") { $ct = "image/svg+xml" }

        $res.ContentType = $ct
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $res.StatusCode = 404
    }
    $res.Close()
}
