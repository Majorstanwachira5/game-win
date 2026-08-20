/**
 * scripts/test_other_games_wallet.js
 * Comprehensive automated verification test suite for Mystery Box, Dice Roll, Pick a Card, Lucky 7,
 * and Centralized Wallet / Ledger Integration.
 */
'use strict';
const assert = require('assert');
const walletService = require('../spin-api/services/WalletService');
const { openBox, BOX_TIERS } = require('../spin-api/games/mysteryBox');
const { rollDice, SINGLE_OUTCOMES } = require('../spin-api/games/diceRoll');
const { dealCards, CARD_REWARDS } = require('../spin-api/games/pickCard');
const { playLucky7, BOX_REWARD_POOL } = require('../spin-api/games/lucky7');

function createMockUser(initialBalance = 5000, initialCoins = 200) {
    return {
        id: 'test_user_' + Math.random().toString(36).slice(2, 8),
        phone: 'USER 0722***000',
        balance: initialBalance,
        coins: initialCoins,
        freeSpins: 0,
        mysteryKeys: 0,
        doubleNextWin: false,
        totalWagered: 0,
        totalWon: 0,
        xp: 100,
        vipTier: 'bronze',
        ledger: []
    };
}

let passed = 0;
let failed = 0;

function runTest(testName, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${testName}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${testName}`);
        console.error(`     Error: ${err.message}`);
        failed++;
    }
}

console.log('\n===============================================================');
console.log('🧪 RUNNING PLAYCOIN GAMES & WALLET AUDIT TEST SUITE');
console.log('===============================================================\n');

// ─── 1. MYSTERY BOX TESTS ────────────────────────────────────────────────────
console.log('📦 --- 1. MYSTERY BOX AUDIT ---');

runTest('Mystery Box - Bronze Box stake & wallet debit', () => {
    const user = createMockUser(1000, 200);
    const startBal = user.balance;
    const startCoins = user.coins;
    const result = openBox('bronze', 0, user);

    assert.strictEqual(result.tier.id, 'bronze');
    assert.strictEqual(result.price, 50);
    // User should have been debited 50 KSh and credited 50 PlayCoins
    assert.strictEqual(user.coins, startCoins + 50);
    const expectedBal = Math.round((startBal - 50 + result.winAmount) * 100) / 100;
    assert.strictEqual(user.balance, expectedBal);
});

runTest('Mystery Box - Diamond Box stake (KSh 1,000)', () => {
    const user = createMockUser(5000, 200);
    const result = openBox('diamond', 0, user);
    assert.strictEqual(result.tier.id, 'diamond');
    assert.strictEqual(result.price, 1000);
    assert(result.winAmount >= 0);
});

runTest('Mystery Box - Insufficient Balance Protection', () => {
    const user = createMockUser(30, 200); // Only 30 KSh (need 50)
    assert.throws(() => {
        openBox('bronze', 0, user);
    }, /Insufficient balance/i);
    assert.strictEqual(user.balance, 30, 'Balance must not change on failed stake');
});

runTest('Mystery Box - Invalid Tier Rejection', () => {
    const user = createMockUser(1000, 200);
    assert.throws(() => {
        openBox('ultra_mythic_box', 0, user);
    }, /Invalid mystery box tier/i);
    assert.strictEqual(user.balance, 1000, 'Balance must not change on invalid tier');
});

runTest('Mystery Box - Double Next Win Activation & Consumption', () => {
    const user = createMockUser(2000, 200);
    user.doubleNextWin = true;
    const result = openBox('bronze', 0, user);
    if (result.reward.type === 'win') {
        assert.strictEqual(user.doubleNextWin, false, 'doubleNextWin must be consumed after win');
    }
});

// ─── 2. DICE ROLL TESTS ──────────────────────────────────────────────────────
console.log('\n🎲 --- 2. DICE ROLL AUDIT ---');

runTest('Dice Roll - Single Die valid roll & outcome', () => {
    const user = createMockUser(1000, 200);
    const startBal = user.balance;
    const startCoins = user.coins;
    const result = rollDice('single', 100, user);

    assert.strictEqual(result.betAmount, 100);
    assert.strictEqual(result.dice.length, 1);
    assert(result.dice[0] >= 1 && result.dice[0] <= 6);
    assert.strictEqual(user.coins, startCoins + 100, 'Must award 1:1 PlayCoins on wager');
    const expectedBal = Math.round((startBal - 100 + result.winAmount) * 100) / 100;
    assert.strictEqual(user.balance, expectedBal);
});

runTest('Dice Roll - Double Dice roll generates 2 dice', () => {
    const user = createMockUser(1000, 200);
    const result = rollDice('double', 200, user);
    assert.strictEqual(result.dice.length, 2);
    assert(result.dice[0] >= 1 && result.dice[0] <= 6);
    assert(result.dice[1] >= 1 && result.dice[1] <= 6);
});

runTest('Dice Roll - Min bet enforcement (No premature debit)', () => {
    const user = createMockUser(1000, 200);
    assert.throws(() => {
        rollDice('single', 20, user); // Min is 50
    }, /Minimum bet is KSh 50/i);
    assert.strictEqual(user.balance, 1000, 'Balance must NOT be debited on invalid bet amount');
});

runTest('Dice Roll - Insufficient Balance Protection', () => {
    const user = createMockUser(40, 200);
    assert.throws(() => {
        rollDice('single', 50, user);
    }, /Insufficient balance/i);
    assert.strictEqual(user.balance, 40);
});

runTest('Dice Roll - Invalid mode rejection', () => {
    const user = createMockUser(1000, 200);
    assert.throws(() => {
        rollDice('triple', 100, user);
    }, /Invalid dice mode/i);
    assert.strictEqual(user.balance, 1000);
});

// ─── 3. PICK A CARD TESTS ────────────────────────────────────────────────────
console.log('\n🃏 --- 3. PICK A CARD AUDIT ---');

runTest('Pick a Card - Valid card pick (5 revealed, 1 chosen)', () => {
    const user = createMockUser(1000, 200);
    const startBal = user.balance;
    const startCoins = user.coins;
    const result = dealCards(2, 100, user);

    assert.strictEqual(result.cards.length, 5);
    assert.strictEqual(result.cardIndex, 2);
    assert.strictEqual(result.chosen.id, result.cards[2].id);
    assert.strictEqual(user.coins, startCoins + 100);
    const expectedBal = Math.round((startBal - 100 + result.winAmount) * 100) / 100;
    assert.strictEqual(user.balance, expectedBal);
});

runTest('Pick a Card - Invalid card index rejection (<0 or >4)', () => {
    const user = createMockUser(1000, 200);
    assert.throws(() => {
        dealCards(5, 100, user);
    }, /Invalid card index/i);
    assert.throws(() => {
        dealCards(-1, 100, user);
    }, /Invalid card index/i);
    assert.strictEqual(user.balance, 1000);
});

runTest('Pick a Card - Min Bet enforcement (KSh 100)', () => {
    const user = createMockUser(1000, 200);
    assert.throws(() => {
        dealCards(0, 50, user);
    }, /Minimum bet is KSh 100/i);
    assert.strictEqual(user.balance, 1000);
});

runTest('Pick a Card - Insufficient Balance Protection', () => {
    const user = createMockUser(90, 200);
    assert.throws(() => {
        dealCards(0, 100, user);
    }, /Insufficient balance/i);
    assert.strictEqual(user.balance, 90);
});

// ─── 4. LUCKY 7 / SLOTS TESTS ────────────────────────────────────────────────
console.log('\n🎰 --- 4. LUCKY 7 / SLOTS AUDIT ---');

runTest('Lucky 7 - Valid spin/box pick (7 boxes revealed)', () => {
    const user = createMockUser(1000, 200);
    const startBal = user.balance;
    const startCoins = user.coins;
    const result = playLucky7(0, 100, user);

    assert.strictEqual(result.boxes.length, 7);
    assert.strictEqual(result.boxIndex, 0);
    assert.strictEqual(result.chosen.id, result.boxes[0].id);
    assert.strictEqual(user.coins, startCoins + 100, 'Lucky 7 must award 1:1 PlayCoins on wager');
    const expectedBal = Math.round((startBal - 100 + result.winAmount) * 100) / 100;
    assert.strictEqual(user.balance, expectedBal);
});

runTest('Lucky 7 - Invalid boxIndex rejection (<0 or >6)', () => {
    const user = createMockUser(1000, 200);
    assert.throws(() => {
        playLucky7(7, 100, user);
    }, /Invalid box index/i);
    assert.strictEqual(user.balance, 1000);
});

runTest('Lucky 7 - Min Bet enforcement (KSh 100)', () => {
    const user = createMockUser(1000, 200);
    assert.throws(() => {
        playLucky7(0, 50, user);
    }, /Minimum bet is KSh 100/i);
    assert.strictEqual(user.balance, 1000);
});

runTest('Lucky 7 - Insufficient Balance Protection', () => {
    const user = createMockUser(50, 200);
    assert.throws(() => {
        playLucky7(0, 100, user);
    }, /Insufficient balance/i);
    assert.strictEqual(user.balance, 50);
});

// ─── 5. WALLET & LEDGER AUDIT TESTS ──────────────────────────────────────────
console.log('\n🏛️ --- 5. WALLET & LEDGER INTEGRATION AUDIT ---');

runTest('WalletService - writeLedger formats KSh cash game ledger properly', () => {
    const user = createMockUser(1000, 200);
    const prevBal = user.balance;
    walletService.debitWallet(user, 100, 'KSH');
    walletService.creditWallet(user, 250, 'KSH', 'Dice Roll');

    const entry = walletService.writeLedger(
        user,
        250,
        'Dice Roll',
        prevBal,
        'KSH',
        { stake: 100, multiplier: 2.5, resultLabel: '×2.5 Win', gameType: 'dice_roll' }
    );

    assert.strictEqual(entry.currency, 'KSh');
    assert.strictEqual(entry.token_symbol, 'KSh');
    assert.strictEqual(entry.balance_before, 1000);
    assert.strictEqual(entry.balance_after, 1150);
    assert.strictEqual(entry.amount, 250);
    assert.strictEqual(entry.metadata.stake, 100);
    assert.strictEqual(entry.metadata.netResult, 150);
    assert.strictEqual(entry.metadata.gameType, 'dice_roll');
    assert.strictEqual(user.ledger[0].transactionId, entry.transactionId);
});

runTest('WalletService - writeLedger formats PlayCoin bonus ledger properly', () => {
    const user = createMockUser(1000, 200);
    const prevCoins = user.coins;
    walletService.creditWallet(user, 100, 'PLAY', 'Dice Roll Bonus');

    const entry = walletService.writeLedger(
        user,
        100,
        'Dice Roll Bonus',
        prevCoins,
        'PLAY_COINS',
        { stake: 100, gameType: 'dice_roll' }
    );

    assert.strictEqual(entry.currency, 'PLAY');
    assert.strictEqual(entry.token_symbol, '$PLAY');
    assert.strictEqual(entry.balance_before, 200);
    assert.strictEqual(entry.balance_after, 300);
});

runTest('WalletService - Tester Account bypass & isolation', () => {
    const tester = { id: 'tester_1', isTester: true, balance: 250000, coins: 250000 };
    assert.strictEqual(walletService.validateBalance(tester, 500000, 'KSH'), true);
    walletService.debitWallet(tester, 1000, 'KSH');
    assert.strictEqual(tester.balance, 250000);
});

// ─── 6. SECURITY & MALICIOUS INPUT TESTS ─────────────────────────────────────
console.log('\n🔒 --- 6. SECURITY & INPUT SANITIZATION AUDIT ---');

runTest('Security - Negative stake injection rejected', () => {
    const user = createMockUser(1000, 200);
    assert.throws(() => rollDice('single', -500, user));
    assert.throws(() => dealCards(0, -500, user));
    assert.throws(() => playLucky7(0, -500, user));
    assert.strictEqual(user.balance, 1000, 'Balance must remain unchanged on negative stake injection');
});

runTest('Security - Non-numeric / NaN stake rejected', () => {
    const user = createMockUser(1000, 200);
    assert.throws(() => rollDice('single', 'not_a_number', user));
    assert.throws(() => dealCards(0, 'NaN', user));
    assert.throws(() => playLucky7(0, null, user));
    assert.strictEqual(user.balance, 1000);
});

console.log('\n===============================================================');
console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('===============================================================\n');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
