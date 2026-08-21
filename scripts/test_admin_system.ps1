# PowerShell Test Suite for PLAYCOIN Admin System Diagnostic & Verification
Write-Host "===============================================================" -ForegroundColor Yellow
Write-Host "🛡️ RUNNING PLAYCOIN ADMIN SYSTEM DIAGNOSTIC & AUTH VERIFICATION" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Yellow

$passed = 0
$failed = 0

function Assert-AdminTest {
    param(
        [string]$Name,
        [scriptblock]$TestBlock
    )
    try {
        & $TestBlock
        Write-Host "  PASS: $Name" -ForegroundColor Green
        $script:passed++
    } catch {
        Write-Host "  FAIL: $Name" -ForegroundColor Red
        Write-Host "     Error: $_" -ForegroundColor DarkRed
        $script:failed++
    }
}

# 1. FILE & ASSET EXISTENCE AUDIT
Write-Host "`n--- 1. ADMIN ASSET & CONTROLLER AUDIT ---" -ForegroundColor Yellow

Assert-AdminTest -Name "Admin HTML File Exists in spin-admin/public" -TestBlock {
    $path = "spin-admin\public\admin.html"
    if (-not (Test-Path $path -PathType Leaf)) { throw "admin.html missing from spin-admin/public" }
    $content = Get-Content $path -Raw
    if (-not $content.Contains("adminLoginForm")) { throw "admin.html missing login form ID" }
    if (-not $content.Contains("adminAuthOverlay")) { throw "admin.html missing auth overlay ID" }
}

Assert-AdminTest -Name "Admin JS Controller Exists and Implements API_BASE & JWT Auth" -TestBlock {
    $path = "spin-admin\public\js\admin.js"
    if (-not (Test-Path $path -PathType Leaf)) { throw "admin.js missing" }
    $content = Get-Content $path -Raw
    if (-not $content.Contains("API_BASE")) { throw "API_BASE missing from admin.js" }
    if (-not $content.Contains("/api/auth/admin")) { throw "Admin auth endpoint missing from admin.js" }
    if (-not $content.Contains("ram_admin_jwt")) { throw "JWT storage missing from admin.js" }
}

Assert-AdminTest -Name "Admin CSS Stylesheet Exists" -TestBlock {
    $path = "spin-admin\public\css\admin.css"
    if (-not (Test-Path $path -PathType Leaf)) { throw "admin.css missing" }
}

# 2. BACKEND AUTH & MIDDLEWARE AUDIT
Write-Host "`n--- 2. BACKEND AUTH & CREDENTIALS AUDIT ---" -ForegroundColor Yellow

Assert-AdminTest -Name "Admin Auth Middleware Contains Seeded Admins and Passwords" -TestBlock {
    $authPath = "spin-api\middleware\auth.js"
    if (-not (Test-Path $authPath -PathType Leaf)) { throw "auth.js missing" }
    $content = Get-Content $authPath -Raw
    if (-not $content.Contains("SEEDED_ADMINS")) { throw "SEEDED_ADMINS missing from auth.js" }
    if (-not $content.Contains("adminLogin")) { throw "adminLogin handler missing" }
    if (-not $content.Contains("requireAdminAuth")) { throw "requireAdminAuth middleware missing" }
}

Assert-AdminTest -Name "Admin Routes Registered in Backend API Server" -TestBlock {
    $serverPath = "spin-api\server.js"
    $content = Get-Content $serverPath -Raw
    $requiredRoutes = @(
        "/api/auth/admin",
        "/api/admin/overview",
        "/api/admin/users",
        "/api/admin/payments",
        "/api/admin/referrals",
        "/api/admin/commissions",
        "/api/admin/withdrawals",
        "/api/admin/ledger",
        "/api/admin/risk",
        "/api/admin/audit-logs",
        "/api/admin/settings",
        "/api/admin/system/health"
    )
    foreach ($r in $requiredRoutes) {
        if (-not $content.Contains($r)) { throw "Missing required route: $r" }
    }
}

Assert-AdminTest -Name "Core API Server Mounts /admin and /admin.html Static Routes" -TestBlock {
    $serverPath = "spin-api\server.js"
    $content = Get-Content $serverPath -Raw
    if (-not $content.Contains("app.use('/admin'")) { throw "Missing /admin static mount in spin-api/server.js" }
    if (-not $content.Contains("'/admin', '/admin.html'")) { throw "Missing /admin route handler in spin-api/server.js" }
}

# 3. MULTI-SERVICE LAUNCHER CONCURRENCY AUDIT
Write-Host "`n--- 3. MULTI-SERVICE LAUNCHER CONCURRENCY AUDIT ---" -ForegroundColor Yellow

Assert-AdminTest -Name "start_all_services.ps1 Uses Asynchronous Non-Blocking Tasks" -TestBlock {
    $launcherPath = "start_all_services.ps1"
    $content = Get-Content $launcherPath -Raw
    if (-not $content.Contains("GetContextAsync()")) { throw "start_all_services.ps1 is not using async GetContextAsync" }
    if (-not $content.Contains("Task]::WaitAny")) { throw "start_all_services.ps1 is missing WaitAny concurrency loop" }
    if (-not $content.Contains("/api/auth/admin")) { throw "start_all_services.ps1 is missing /api/auth/admin endpoint" }
}

Assert-AdminTest -Name "start_server.ps1 Correctly Maps /admin to admin.html" -TestBlock {
    $launcherPath = "start_server.ps1"
    $content = Get-Content $launcherPath -Raw
    if (-not $content.Contains('elseif ($path -eq "/admin"')) { throw "start_server.ps1 missing /admin exact match" }
}

Write-Host "`n===============================================================" -ForegroundColor Yellow
$summaryColor = if ($failed -eq 0) { "Green" } else { "Red" }
Write-Host "ADMIN SYSTEM AUDIT SUMMARY: $passed PASSED, $failed FAILED" -ForegroundColor $summaryColor
Write-Host "===============================================================" -ForegroundColor Yellow
