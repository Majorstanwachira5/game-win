# Monte Carlo 100,000 Spin Simulation in PowerShell
Write-Host "=======================================================" -ForegroundColor Gold
Write-Host "🎰 RUNNING 100,000 MONTE CARLO SPIN SIMULATION (85% PROFIT ENGINE)" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Gold

$slices = @(
    @{ id='try_again_1'; label='TRY AGAIN'; type='loss'; mult=0; weight=45000 },
    @{ id='try_again_2'; label='TRY AGAIN'; type='loss'; mult=0; weight=20000 },
    @{ id='mult_0_1'; label='×0.1'; type='win'; mult=0.1; weight=9500 },
    @{ id='mult_0_2'; label='×0.2'; type='win'; mult=0.2; weight=6500 },
    @{ id='mult_0_5'; label='×0.5'; type='win'; mult=0.5; weight=4500 },
    @{ id='mult_1_0'; label='×1'; type='win'; mult=1.0; weight=3000 },
    @{ id='mult_2_0'; label='×2'; type='win'; mult=2.0; weight=1300 },
    @{ id='mult_5_0'; label='×5'; type='win'; mult=5.0; weight=600 },
    @{ id='mult_10_0'; label='×10'; type='win'; mult=10.0; weight=150 },
    @{ id='mult_20_0'; label='×20'; type='win'; mult=20.0; weight=50 },
    @{ id='jackpot_50'; label='×50 JACKPOT'; type='jackpot'; mult=50.0; weight=5 },
    @{ id='free_spin_1'; label='🎁 FREE SPIN'; type='free_spin'; count=1; weight=6500 },
    @{ id='free_spin_2'; label='🎁 2 FREE SPINS'; type='free_spin'; count=2; weight=2500 },
    @{ id='double_win'; label='🔥 DOUBLE NEXT WIN'; type='double_next'; weight=395 }
)

$totalWeight = 0
foreach ($s in $slices) { $totalWeight += $s.weight }

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

function Get-RandomSlice {
    $bytes = New-Object byte[] 4
    $rng.GetBytes($bytes)
    $uint = [System.BitConverter]::ToUInt32($bytes, 0)
    $randWeight = ($uint / [uint32]::MaxValue) * $totalWeight

    foreach ($s in $slices) {
        if ($randWeight -lt $s.weight) { return $s }
        $randWeight -= $s.weight
    }
    return $slices[0]
}

$TOTAL_SPINS = 100000
$BET_AMOUNT = 100

$totalWagered = 0.0
$totalWon = 0.0
$freeSpins = 0
$doubleNextWin = $false

$hitCounts = @{}
foreach ($s in $slices) { $hitCounts[$s.id] = 0 }

for ($i = 0; $i -lt $TOTAL_SPINS; $i++) {
    if ($freeSpins -gt 0) {
        $freeSpins--
    } else {
        $totalWagered += $BET_AMOUNT
    }

    $won = Get-RandomSlice
    $hitCounts[$won.id]++

    if ($won.type -eq 'win' -or $won.type -eq 'jackpot') {
        $m = $won.mult
        if ($doubleNextWin) {
            $m = $m * 2
            $doubleNextWin = $false
        }
        $totalWon += ($BET_AMOUNT * $m)
    } elseif ($won.type -eq 'free_spin') {
        $freeSpins += $won.count
    } elseif ($won.type -eq 'double_next') {
        $doubleNextWin = $true
    }
}

$houseProfit = $totalWagered - $totalWon
$houseMargin = ($houseProfit / $totalWagered) * 100
$rtp = ($totalWon / $totalWagered) * 100

Write-Host "Total Spins Processed: $($TOTAL_SPINS.ToString('N0'))"
Write-Host "Total Wagered: KSh $($totalWagered.ToString('N2'))"
Write-Host "Total Payout: KSh $($totalWon.ToString('N2'))"
Write-Host "House Net Profit: KSh $($houseProfit.ToString('N2'))" -ForegroundColor Green
Write-Host "Realized Return To Player (RTP): $($rtp.ToString('F2'))%" -ForegroundColor Cyan
Write-Host "Realized House Profit Margin: $($houseMargin.ToString('F2'))% (TARGET: ~85.00%)" -ForegroundColor Gold

Write-Host "`n=== SLICE HIT FREQUENCY ===" -ForegroundColor Yellow
foreach ($s in $slices) {
    $pct = (($hitCounts[$s.id] / $TOTAL_SPINS) * 100).ToString('F3')
    Write-Host "$($s.label.PadRight(22)): $($hitCounts[$s.id]) hits ($pct%)"
}
