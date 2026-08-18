/**
 * services/ReferralService.js — Multi-Tiered Refer & Earn Commission Engine
 * Integrates cleanly with PLAYCOIN platform:
 *  - 2-Tier Referral Commission (Level 1: KSh 100 / 100 Coins, Level 2: KSh 50 / 50 Coins)
 *  - Automated Payment-Triggered Settlement (Triggered strictly upon verified M-Pesa / TON deposit)
 *  - Full Idempotency & Deduplication
 *  - Immutable Double-Entry Ledger Recording
 */
const platformEvents = require('../events/EventEmitter');

class ReferralService {
    constructor() {
        this.L1_COMMISSION = Number(process.env.REFERRAL_L1_COMMISSION) || 100.00;
        this.L2_COMMISSION = Number(process.env.REFERRAL_L2_COMMISSION) || 50.00;
        this.L1_COINS = Number(process.env.REFERRAL_L1_COINS) || 100;
        this.L2_COINS = Number(process.env.REFERRAL_L2_COINS) || 50;
        this.MIN_QUALIFYING_DEPOSIT = Number(process.env.REFERRAL_MIN_DEPOSIT) || 100.00;
    }

    /**
     * Generate unique referral code for user
     */
    generateReferralCode(user) {
        if (user.referralCode) return user.referralCode;
        const base = (user.id || user.email || 'REF').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${base}${rand}`;
    }

    /**
     * Process multi-tier referral bonus upon backend payment confirmation
     * @param {Object} referee - The newly deposited user
     * @param {number} depositAmount - Verified deposit amount
     * @param {Object} usersStore - Global users map
     * @param {Object} walletService - Wallet Service instance
     * @returns {Object} Settlement outcome
     */
    processReferralDeposit(referee, depositAmount, usersStore, walletService) {
        if (!referee || !referee.referredBy) {
            return { processed: false, reason: 'No referrer associated' };
        }

        if (referee.referralCommissionProcessed) {
            return { processed: false, reason: 'Referral commission already processed for this user' };
        }

        if (Number(depositAmount) < this.MIN_QUALIFYING_DEPOSIT) {
            return { processed: false, reason: 'Deposit below qualifying threshold' };
        }

        const outcomes = [];
        const level1ReferrerId = referee.referredBy;
        const level1Referrer = usersStore[level1ReferrerId] || Object.values(usersStore).find(u => u.referralCode === level1ReferrerId || u.id === level1ReferrerId);

        // ─── LEVEL 1: DIRECT REFERRER ──────────────────────────────────────────
        if (level1Referrer && level1Referrer.id !== referee.id) {
            const prevBal = level1Referrer.balance || 0;
            const prevCoins = level1Referrer.coins || 0;

            // Credit Cash Commission
            walletService.creditWallet(level1Referrer, this.L1_COMMISSION, 'KSH', 'Direct Referral Commission (Level 1)');
            walletService.writeLedger(level1Referrer, this.L1_COMMISSION, `Direct Referral Bonus (Level 1) from ${referee.displayName || referee.phone || referee.id}`, prevBal, 'KSH');

            // Credit Bonus Play Coins
            walletService.creditWallet(level1Referrer, this.L1_COINS, 'PLAY', 'Direct Referral Coins (Level 1)');
            walletService.writeLedger(level1Referrer, this.L1_COINS, `Direct Referral Coins (Level 1) from ${referee.displayName || referee.phone || referee.id}`, prevCoins, 'PLAY_COINS');

            // Update stats
            level1Referrer.referralCount = (level1Referrer.referralCount || 0) + 1;
            level1Referrer.referralEarnings = (level1Referrer.referralEarnings || 0) + this.L1_COMMISSION;
            level1Referrer.xp = (level1Referrer.xp || 0) + 50;

            if (!level1Referrer.referralsList) level1Referrer.referralsList = [];
            level1Referrer.referralsList.push({
                refereeId: referee.id,
                refereeName: referee.displayName || referee.phone || 'Player',
                level: 1,
                commissionEarned: this.L1_COMMISSION,
                coinsEarned: this.L1_COINS,
                joinedAt: new Date().toISOString()
            });

            outcomes.push({ level: 1, referrerId: level1Referrer.id, commission: this.L1_COMMISSION, coins: this.L1_COINS });

            console.log(`[REFERRAL L1 SUCCESS] Awarded KSh ${this.L1_COMMISSION} + ${this.L1_COINS} coins to Level 1 Referrer: ${level1Referrer.id}`);

            // ─── LEVEL 2: INDIRECT REFERRER (GRANDPARENT) ────────────────────────
            if (level1Referrer.referredBy) {
                const level2ReferrerId = level1Referrer.referredBy;
                const level2Referrer = usersStore[level2ReferrerId] || Object.values(usersStore).find(u => u.referralCode === level2ReferrerId || u.id === level2ReferrerId);

                if (level2Referrer && level2Referrer.id !== referee.id && level2Referrer.id !== level1Referrer.id) {
                    const prevBalL2 = level2Referrer.balance || 0;
                    const prevCoinsL2 = level2Referrer.coins || 0;

                    walletService.creditWallet(level2Referrer, this.L2_COMMISSION, 'KSH', 'Indirect Referral Commission (Level 2)');
                    walletService.writeLedger(level2Referrer, this.L2_COMMISSION, `Indirect Referral Bonus (Level 2) from ${referee.displayName || referee.phone || referee.id}`, prevBalL2, 'KSH');

                    walletService.creditWallet(level2Referrer, this.L2_COINS, 'PLAY', 'Indirect Referral Coins (Level 2)');
                    walletService.writeLedger(level2Referrer, this.L2_COINS, `Indirect Referral Coins (Level 2) from ${referee.displayName || referee.phone || referee.id}`, prevCoinsL2, 'PLAY_COINS');

                    level2Referrer.indirectReferralCount = (level2Referrer.indirectReferralCount || 0) + 1;
                    level2Referrer.referralEarnings = (level2Referrer.referralEarnings || 0) + this.L2_COMMISSION;
                    level2Referrer.xp = (level2Referrer.xp || 0) + 25;

                    if (!level2Referrer.referralsList) level2Referrer.referralsList = [];
                    level2Referrer.referralsList.push({
                        refereeId: referee.id,
                        refereeName: referee.displayName || referee.phone || 'Player',
                        level: 2,
                        commissionEarned: this.L2_COMMISSION,
                        coinsEarned: this.L2_COINS,
                        joinedAt: new Date().toISOString()
                    });

                    outcomes.push({ level: 2, referrerId: level2Referrer.id, commission: this.L2_COMMISSION, coins: this.L2_COINS });

                    console.log(`[REFERRAL L2 SUCCESS] Awarded KSh ${this.L2_COMMISSION} + ${this.L2_COINS} coins to Level 2 Referrer: ${level2Referrer.id}`);
                }
            }
        }

        referee.referralCommissionProcessed = true;

        platformEvents.emitEvent('REFERRAL_BONUS_SETTLED', {
            refereeId: referee.id,
            depositAmount,
            outcomes
        });

        return {
            processed: true,
            outcomes
        };
    }

    /**
     * Fetch referral dashboard statistics for user
     */
    getReferralStats(user, baseUrl = '') {
        const directReferrals = (user.referralsList || []).filter(r => r.level === 1);
        const indirectReferrals = (user.referralsList || []).filter(r => r.level === 2);

        const directEarnings = directReferrals.reduce((acc, r) => acc + (Number(r.commissionEarned) || 0), 0);
        const indirectEarnings = indirectReferrals.reduce((acc, r) => acc + (Number(r.commissionEarned) || 0), 0);
        const totalCoinsEarned = (user.referralsList || []).reduce((acc, r) => acc + (Number(r.coinsEarned) || 0), 0);

        const referralCode = this.generateReferralCode(user);
        user.referralCode = referralCode;

        const origin = baseUrl || 'https://game-win.vercel.app';
        const referralLink = `${origin}/?ref=${referralCode}`;

        return {
            referralCode,
            referralLink,
            stats: {
                directCount: directReferrals.length,
                indirectCount: indirectReferrals.length,
                totalCount: directReferrals.length + indirectReferrals.length,
                directEarnings,
                indirectEarnings,
                totalEarnings: directEarnings + indirectEarnings,
                totalCoinsEarned
            },
            directReferrals,
            indirectReferrals,
            commissionRules: {
                level1: `KSh ${this.L1_COMMISSION} + ${this.L1_COINS} Play Coins per direct friend deposit`,
                level2: `KSh ${this.L2_COMMISSION} + ${this.L2_COINS} Play Coins per 2nd tier friend deposit`
            }
        };
    }
}

module.exports = new ReferralService();
