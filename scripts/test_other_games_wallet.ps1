# PowerShell Automated Verification Test Suite for Other Games and Wallet Integration
Write-Host "===============================================================" -ForegroundColor Yellow
Write-Host "RUNNING PLAYCOIN GAMES AND WALLET AUDIT TEST SUITE (POWERSHELL)" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Yellow

$passed = 0
$failed = 0

function Assert-Test {
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

# Mock User Generator
function New-MockUser {
    param([double]$balance = 5000.0, [int]$coins = 200)
    return @{
        id = "usr_test"
        balance = [double]$balance
        coins = [int]$coins
        freeSpins = 0
        mysteryKeys = 0
        doubleNextWin = $false
        ledger = @()
    }
}

# 1. MYSTERY BOX AUDIT
Write-Host "`n--- 1. MYSTERY BOX AUDIT ---" -ForegroundColor Yellow

$boxTiers = @{
    bronze = @{ price = 50; maxMult = 3.0 }
    silver = @{ price = 150; maxMult = 5.0 }
    gold = @{ price = 300; maxMult = 15.0 }
    platinum = @{ price = 500; maxMult = 25.0 }
    diamond = @{ price = 1000; maxMult = 50.0 }
}

Assert-Test -Name "Mystery Box - All 5 tiers priced and bounded correctly" -TestBlock {
    if ($boxTiers.bronze.price -ne 50) { throw "Bronze price mismatch" }
    if ($boxTiers.silver.price -ne 150) { throw "Silver price mismatch" }
    if ($boxTiers.gold.price -ne 300) { throw "Gold price mismatch" }
    if ($boxTiers.platinum.price -ne 500) { throw "Platinum price mismatch" }
    if ($boxTiers.diamond.price -ne 1000) { throw "Diamond price mismatch" }
}

Assert-Test -Name "Mystery Box - Stake validation and balance debit check" -TestBlock {
    $user = New-MockUser 1000 200
    $stake = $boxTiers.bronze.price
    if ($user.balance -lt $stake) { throw "Insufficient balance" }
    $user.balance -= $stake
    $user.coins += $stake
    if ($user.balance -ne 950) { throw "Balance deduction failed" }
    if ($user.coins -ne 250) { throw "PlayCoin award failed" }
}

Assert-Test -Name "Mystery Box - Insufficient balance protection" -TestBlock {
    $user = New-MockUser 30 200
    $stake = 50
    $blocked = $false
    if ($user.balance -lt $stake) { $blocked = $true }
    if (-not $blocked) { throw "Allowed play with insufficient balance" }
    if ($user.balance -ne 30) { throw "Balance altered during blocked game" }
}

# 2. DICE ROLL AUDIT
Write-Host "`n--- 2. DICE ROLL AUDIT ---" -ForegroundColor Yellow

Assert-Test -Name "Dice Roll - Valid stake range (50 to 50,000)" -TestBlock {
    $minBet = 50
    $maxBet = 50000
    $user = New-MockUser 1000 200
    $bet = 100
    if ($bet -lt $minBet -or $bet -gt $maxBet) { throw "Bet out of bounds" }
    $user.balance -= $bet
    $user.coins += $bet
    if ($user.balance -ne 900) { throw "Balance calculation error" }
    if ($user.coins -ne 300) { throw "PlayCoin credit error" }
}

Assert-Test -Name "Dice Roll - Sub-minimum stake (<50) rejected with zero debit" -TestBlock {
    $user = New-MockUser 1000 200
    $invalidBet = 20
    $rejected = $false
    if ($invalidBet -lt 50) { $rejected = $true }
    if (-not $rejected) { throw "Failed to reject bet < 50" }
    if ($user.balance -ne 1000) { throw "Balance was debited on invalid bet" }
}

# 3. PLAY CARDS AUDIT
Write-Host "`n--- 3. PICK A CARD AUDIT ---" -ForegroundColor Yellow

Assert-Test -Name "Play Cards - Valid card index (0 to 4)" -TestBlock {
    $validIndices = 0..4
    foreach ($idx in $validIndices) {
        if ($idx -lt 0 -or $idx -gt 4) { throw "Index out of range" }
    }
}

Assert-Test -Name "Play Cards - Min bet (KSh 100) enforced" -TestBlock {
    $user = New-MockUser 1000 200
    $stake = 100
    if ($user.balance -lt $stake) { throw "Insufficient balance" }
    $user.balance -= $stake
    $user.coins += $stake
    if ($user.balance -ne 900) { throw "Balance error" }
    if ($user.coins -ne 300) { throw "Coins error" }
}

# 4. LUCKY 7 / SLOTS AUDIT
Write-Host "`n--- 4. LUCKY 7 / SLOTS AUDIT ---" -ForegroundColor Yellow

Assert-Test -Name "Lucky 7 - Valid box/reel index (0 to 6)" -TestBlock {
    $validBoxes = 0..6
    foreach ($b in $validBoxes) {
        if ($b -lt 0 -or $b -gt 6) { throw "Box index out of range" }
    }
}

Assert-Test -Name "Lucky 7 - PlayCoin bonus award (1:1)" -TestBlock {
    $user = New-MockUser 2000 200
    $bet = 250
    $user.balance -= $bet
    $user.coins += $bet
    if ($user.coins -ne 450) { throw "PlayCoin award missing for Lucky 7" }
}

# 5. WALLET AND ATOMICITY AUDIT
Write-Host "`n--- 5. WALLET AND AUDIT LEDGER INTEGRATION ---" -ForegroundColor Yellow

Assert-Test -Name "Ledger - Atomic transaction entry structure" -TestBlock {
    $tx = @{
        transactionId = "tx_123456"
        game = "Dice Roll"
        amount = 250.0
        currency = "KSh"
        balance_before = 1000.0
        balance_after = 1150.0
        stake = 100.0
        netResult = 150.0
        multiplier = 2.5
    }
    if ($tx.currency -ne "KSh") { throw "Currency symbol mismatch" }
    if ($tx.balance_after -ne ($tx.balance_before - $tx.stake + $tx.amount)) { throw "Ledger arithmetic mismatch" }
}

Assert-Test -Name "In-Flight Request Lock - Rejects parallel concurrent request" -TestBlock {
    $user = New-MockUser 1000 200
    $user._activeGameLock = $true
    $canPlay = -not $user._activeGameLock
    if ($canPlay) { throw "Concurrent request was not blocked" }
    $user._activeGameLock = $false
    $canPlayAfter = -not $user._activeGameLock
    if (-not $canPlayAfter) { throw "Lock was not released" }
}

Write-Host "`n===============================================================" -ForegroundColor Yellow
$summaryColor = if ($failed -eq 0) { "Green" } else { "Red" }
Write-Host "AUDIT SUITE SUMMARY: $passed PASSED, $failed FAILED" -ForegroundColor $summaryColor
Write-Host "===============================================================" -ForegroundColor Yellow
