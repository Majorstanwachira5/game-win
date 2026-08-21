# Automated Real-Data Integration & Schema Validation Test for RAM Admin Control Center
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "RUNNING ADMIN END-TO-END REAL DATA INTEGRATION TESTS" -ForegroundColor Yellow
Write-Host "===========================================================" -ForegroundColor Cyan

$passed = 0
$total = 0

function Assert-Test {
    param(
        [string]$name,
        [bool]$condition,
        [string]$details = ""
    )
    $script:total++
    if ($condition) {
        $script:passed++
        Write-Host "  PASS: $name" -ForegroundColor Green
        if ($details) { Write-Host "     -> $details" -ForegroundColor DarkGray }
    } else {
        Write-Host "  FAIL: $name" -ForegroundColor Red
        if ($details) { Write-Host "     -> $details" -ForegroundColor Red }
    }
}

# 1. Admin Authentication
try {
    $body = @{ email = "admin@playcoin.live"; password = "admin123password" } | ConvertTo-Json
    $auth = Invoke-RestMethod -Uri "http://localhost:8080/api/auth/admin" -Method Post -Body $body -ContentType "application/json"
    $c = ($auth.success -eq $true -and $auth.token -ne $null)
    Assert-Test -name "Admin Authentication POST /api/auth/admin" -condition $c -details "Role: $($auth.admin.role)"
} catch {
    Assert-Test -name "Admin Authentication POST /api/auth/admin" -condition $false -details $_.Exception.Message
}

# 2. Admin Overview KPIs & Real-Time Data
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/overview" -Method Get
    $valid = ($res.success -eq $true) -and ($res.users.total -gt 0) -and ($res.payments.totalVolume -gt 0) -and ($res.revenue.houseNetProfit -gt 0) -and ($res.funnel.registrations -gt 0)
    Assert-Test -name "Admin Overview GET /api/admin/overview" -condition $valid -details "Total Users: $($res.users.total), Vol: KSh $($res.payments.totalVolume), Profit: KSh $($res.revenue.houseNetProfit)"
} catch {
    Assert-Test -name "Admin Overview GET /api/admin/overview" -condition $false -details $_.Exception.Message
}

# 3. Admin Users Tab & Pagination
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/users" -Method Get
    $valid = ($res.success -eq $true) -and ($res.pagination.total -gt 0) -and ($res.users.Count -gt 0)
    Assert-Test -name "Admin Users GET /api/admin/users" -condition $valid -details "Users count: $($res.users.Count), Total: $($res.pagination.total)"
} catch {
    Assert-Test -name "Admin Users GET /api/admin/users" -condition $false -details $_.Exception.Message
}

# 4. Admin Payments Tab
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/payments" -Method Get
    $valid = ($res.success -eq $true) -and ($res.transactions.Count -gt 0) -and ($res.pagination.page -ge 1)
    Assert-Test -name "Admin Payments GET /api/admin/payments" -condition $valid -details "Transactions count: $($res.transactions.Count), First Receipt: $($res.transactions[0].mpesaReceiptNumber)"
} catch {
    Assert-Test -name "Admin Payments GET /api/admin/payments" -condition $false -details $_.Exception.Message
}

# 5. Admin Referrals Leaderboard
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/referrals" -Method Get
    $valid = ($res.success -eq $true) -and ($res.topReferrers.Count -gt 0)
    Assert-Test -name "Admin Referrals GET /api/admin/referrals" -condition $valid -details "Top Recruiter: $($res.topReferrers[0].displayName) (KSh $($res.topReferrers[0].totalEarnings))"
} catch {
    Assert-Test -name "Admin Referrals GET /api/admin/referrals" -condition $false -details $_.Exception.Message
}

# 6. Admin Commissions Settlements
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/commissions" -Method Get
    $valid = ($res.success -eq $true) -and ($res.commissions.Count -gt 0)
    Assert-Test -name "Admin Commissions GET /api/admin/commissions" -condition $valid -details "Commissions settlements count: $($res.commissions.Count)"
} catch {
    Assert-Test -name "Admin Commissions GET /api/admin/commissions" -condition $false -details $_.Exception.Message
}

# 7. Admin Withdrawals Queue
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/withdrawals" -Method Get
    $valid = ($res.success -eq $true) -and ($res.withdrawals.Count -gt 0)
    Assert-Test -name "Admin Withdrawals GET /api/admin/withdrawals" -condition $valid -details "Withdrawal requests count: $($res.withdrawals.Count)"
} catch {
    Assert-Test -name "Admin Withdrawals GET /api/admin/withdrawals" -condition $false -details $_.Exception.Message
}

# 8. Admin Double-Entry Ledger
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/ledger" -Method Get
    $valid = ($res.success -eq $true) -and ($res.ledger.Count -gt 0)
    Assert-Test -name "Admin Ledger GET /api/admin/ledger" -condition $valid -details "Ledger entries count: $($res.ledger.Count)"
} catch {
    Assert-Test -name "Admin Ledger GET /api/admin/ledger" -condition $false -details $_.Exception.Message
}

# 9. Admin Fraud & Risk Detection
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/risk" -Method Get
    $valid = ($res.success -eq $true) -and ($res.riskCount -ne $null)
    Assert-Test -name "Admin Risk GET /api/admin/risk" -condition $valid -details "Flags: $($res.riskCount)"
} catch {
    Assert-Test -name "Admin Risk GET /api/admin/risk" -condition $false -details $_.Exception.Message
}

# 10. Admin Audit Logs
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/audit-logs" -Method Get
    $valid = ($res.success -eq $true) -and ($res.logs.Count -gt 0)
    Assert-Test -name "Admin Audit Logs GET /api/admin/audit-logs" -condition $valid -details "Audit logs count: $($res.logs.Count)"
} catch {
    Assert-Test -name "Admin Audit Logs GET /api/admin/audit-logs" -condition $false -details $_.Exception.Message
}

# 11. Admin Wheel Engine Probability Slices
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/stats" -Method Get
    $valid = ($res.success -eq $true) -and ($res.slices.Count -gt 0)
    Assert-Test -name "Admin Wheel Engine GET /api/admin/stats" -condition $valid -details "Slices count: $($res.slices.Count)"
} catch {
    Assert-Test -name "Admin Wheel Engine GET /api/admin/stats" -condition $false -details $_.Exception.Message
}

# 12. Admin System Health
try {
    $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/system/health" -Method Get
    $valid = ($res.success -eq $true) -and ($res.status -eq "OPERATIONAL")
    Assert-Test -name "Admin System Health GET /api/admin/system/health" -condition $valid -details "Status: $($res.status)"
} catch {
    Assert-Test -name "Admin System Health GET /api/admin/system/health" -condition $false -details $_.Exception.Message
}

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY: $passed / $total TESTS PASSED" -ForegroundColor $(if ($passed -eq $total) { "Green" } else { "Yellow" })
Write-Host "===========================================================" -ForegroundColor Cyan
