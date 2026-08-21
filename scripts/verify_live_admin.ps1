# Live Verification of Running Admin Services
Write-Host "===============================================================" -ForegroundColor Yellow
Write-Host "LIVE HTTP VERIFICATION OF PLAYCOIN ADMIN PORTAL AND API" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Yellow

$passed = 0
$failed = 0

function Test-LiveEndpoint ($name, [scriptblock]$testBlock) {
    try {
        & $testBlock
        Write-Host "  PASS: $name" -ForegroundColor Green
        $script:passed++
    } catch {
        Write-Host "  FAIL: $name" -ForegroundColor Red
        Write-Host "     Error: $_" -ForegroundColor DarkRed
        $script:failed++
    }
}

# 1. Admin Portal on Port 3001
Test-LiveEndpoint "Admin Portal UI on Port 3001 (HTTP 200)" {
    $res = Invoke-WebRequest -Uri "http://localhost:3001/admin.html" -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -ne 200) { throw "Expected status 200 but got $($res.StatusCode)" }
    if (-not $res.Content.Contains("RAM PORTAL") -and -not $res.Content.Contains("adminLoginForm")) {
        throw "Response did not contain admin login portal markup"
    }
}

Test-LiveEndpoint "Admin Static CSS on Port 3001 (HTTP 200)" {
    $res = Invoke-WebRequest -Uri "http://localhost:3001/css/admin.css" -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -ne 200) { throw "Expected status 200" }
}

Test-LiveEndpoint "Admin Controller JS on Port 3001 (HTTP 200)" {
    $res = Invoke-WebRequest -Uri "http://localhost:3001/js/admin.js" -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -ne 200) { throw "Expected status 200" }
    if (-not $res.Content.Contains("API_BASE")) { throw "admin.js missing API_BASE" }
}

# 2. Backend Health & Admin Route on Port 8080
Test-LiveEndpoint "Backend API Health Check on Port 8080 (HTTP 200)" {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get -TimeoutSec 5
    if ($res.status -ne "ok") { throw "Health check status was not 'ok'" }
}

Test-LiveEndpoint "Direct Admin Route on Port 8080 (/admin -> HTTP 200)" {
    $res = Invoke-WebRequest -Uri "http://localhost:8080/admin" -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -ne 200) { throw "Expected status 200 on /admin" }
}

# 3. Admin Authentication Endpoint (/api/auth/admin)
Test-LiveEndpoint "Admin Login Authentication (Valid Credentials)" {
    $body = @{
        email = "admin@playcoin.live"
        password = "admin123password"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/auth/admin" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
    if (-not $res.success) { throw "Admin authentication failed" }
    if (-not $res.token) { throw "JWT token missing in auth response" }
    if ($res.admin.role -ne "super_admin" -and $res.admin.role -ne "admin") { throw "Unexpected admin role" }
}

Test-LiveEndpoint "Admin Login Rejection (Invalid Credentials -> HTTP 403)" {
    $body = @{
        email = "admin@playcoin.live"
        password = "wrong_password_xyz"
    } | ConvertTo-Json

    $rejected = $false
    try {
        Invoke-RestMethod -Uri "http://localhost:8080/api/auth/admin" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 403) {
            $rejected = $true
        }
    }
    if (-not $rejected) { throw "Invalid credentials were not rejected with HTTP 403" }
}

# 4. Admin Overview / KPIs Endpoint
Test-LiveEndpoint "Admin Overview KPIs Endpoint (HTTP 200)" {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/overview" -Method Get -TimeoutSec 5
    if (-not $res.success) { throw "Overview API did not return success" }
    if ($res.kpis.totalRevenue -lt 1) { throw "Overview KPIs missing totalRevenue" }
}

# 5. Client Portal on Port 3000
Test-LiveEndpoint "Client Game Portal on Port 3000 (HTTP 200)" {
    $res = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -ne 200) { throw "Expected status 200 on Port 3000" }
}

Write-Host "`n===============================================================" -ForegroundColor Yellow
$color = if ($failed -eq 0) { "Green" } else { "Red" }
Write-Host "LIVE VERIFICATION SUMMARY: $passed PASSED, $failed FAILED" -ForegroundColor $color
Write-Host "===============================================================" -ForegroundColor Yellow

if ($failed -gt 0) { exit 1 } else { exit 0 }
