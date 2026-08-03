const crypto = require('crypto');

const wheelSlices = [
    { id: 'try_again_1', label: 'TRY AGAIN', type: 'loss', multiplier: 0, weight: 45000 },
    { id: 'try_again_2', label: 'TRY AGAIN', type: 'loss', multiplier: 0, weight: 20000 },
    { id: 'mult_0_1', label: '×0.1', type: 'win', multiplier: 0.1, weight: 9500 },
    { id: 'mult_0_2', label: '×0.2', type: 'win', multiplier: 0.2, weight: 6500 },
    { id: 'mult_0_5', label: '×0.5', type: 'win', multiplier: 0.5, weight: 4500 },
    { id: 'mult_1_0', label: '×1', type: 'win', multiplier: 1.0, weight: 3000 },
    { id: 'mult_2_0', label: '×2', type: 'win', multiplier: 2.0, weight: 1300 },
    { id: 'mult_5_0', label: '×5', type: 'win', multiplier: 5.0, weight: 600 },
    { id: 'mult_10_0', label: '×10', type: 'win', multiplier: 10.0, weight: 150 },
    { id: 'mult_20_0', label: '×20', type: 'win', multiplier: 20.0, weight: 50 },
    { id: 'jackpot_50', label: '×50 JACKPOT', type: 'jackpot', multiplier: 50.0, weight: 5 },
    { id: 'free_spin_1', label: '🎁 FREE SPIN', type: 'free_spin', count: 1, weight: 6500 },
    { id: 'free_spin_2', label: '🎁 2 FREE SPINS', type: 'free_spin', count: 2, weight: 2500 },
    { id: 'double_win', label: '🔥 DOUBLE NEXT WIN', type: 'double_next', weight: 395 }
];

const totalWeight = wheelSlices.reduce((s, x) => s + x.weight, 0);

function getRandomSlice() {
    const randomBuffer = crypto.randomBytes(4);
    const randomNumber = randomBuffer.readUInt32BE(0);
    let randomWeight = (randomNumber / 0xFFFFFFFF) * totalWeight;

    for (const slice of wheelSlices) {
        if (randomWeight < slice.weight) {
            return slice;
        }
        randomWeight -= slice.weight;
    }
    return wheelSlices[0];
}

console.log("=== RUNNING 100,000 MONTE CARLO SPIN SIMULATION ===");

const TOTAL_SPINS = 100000;
const BET_AMOUNT = 100;

let totalWagered = 0;
let totalWon = 0;
let counts = {};
wheelSlices.forEach(s => counts[s.id] = 0);

let freeSpins = 0;
let doubleNextWin = false;

for (let i = 0; i < TOTAL_SPINS; i++) {
    const isFree = freeSpins > 0;
    if (isFree) {
        freeSpins--;
    } else {
        totalWagered += BET_AMOUNT;
    }

    const slice = getRandomSlice();
    counts[slice.id]++;

    if (slice.type === 'win' || slice.type === 'jackpot') {
        let mult = slice.multiplier;
        if (doubleNextWin) {
            mult *= 2;
            doubleNextWin = false;
        }
        totalWon += BET_AMOUNT * mult;
    } else if (slice.type === 'free_spin') {
        freeSpins += slice.count;
    } else if (slice.type === 'double_next') {
        doubleNextWin = true;
    }
}

const houseProfit = totalWagered - totalWon;
const houseMargin = (houseProfit / totalWagered) * 100;
const rtp = (totalWon / totalWagered) * 100;

console.log(`Total Spins Processed: ${TOTAL_SPINS.toLocaleString()}`);
console.log(`Total Wagered: KSh ${totalWagered.toLocaleString()}`);
console.log(`Total Payout: KSh ${totalWon.toLocaleString()}`);
console.log(`House Net Profit: KSh ${houseProfit.toLocaleString()}`);
console.log(`Realized Return To Player (RTP): ${rtp.toFixed(2)}%`);
console.log(`Realized House Profit Margin: ${houseMargin.toFixed(2)}% (TARGET: ~85%)`);
console.log("\n=== SLICE HIT FREQUENCY ===");
wheelSlices.forEach(s => {
    const pct = ((counts[s.id] / TOTAL_SPINS) * 100).toFixed(3);
    console.log(`${s.label.padEnd(22)}: ${counts[s.id]} hits (${pct}%)`);
});
