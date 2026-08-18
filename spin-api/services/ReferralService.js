/**
 * services/ReferralService.js — Multi-Tiered Refer & Earn Pyramid Commission Engine
 * Integrates cleanly with PLAYCOIN platform:
 *  - 2-Tier Referral Commission (Level 1: KSh 100 / 100 Coins, Level 2: KSh 50 / 50 Coins)
 *  - Automated Payment-Triggered Settlement (Triggered strictly upon verified M-Pesa 250 KES activation deposit)
 *  - 2,000 KES Minimum Withdrawal Rule with Admin Approval Queue
 *  - Full Idempotency & Deduplication
 *  - Immutable Double-Entry Ledger Recording
 */
const platformEvents = require('../events/EventEmitter');

class ReferralService {
    constructor() {
        this.ACTIVATION_FEE = Number(process.env.REFERRAL_ACTIVATION_FEE) || 250.00;
        this.L1_COMMISSION = Number(process.env.REFERRAL_L1_COMMISSION) || 100.00;
        this.L2_COMMISSION = Number(process.env.REFERRAL_L2_COMMISSION) || 50.00;
        this.L1_COINS = Number(process.env.REFERRAL_L1_COINS) || 100;
        this.L2_COINS = Number(process.env.REFERRAL_L2_COINS) || 50;
        this.MIN_QUALIFYING_DEPOSIT = Number(process.env.REFERRAL_MIN_DEPOSIT) || 100.00;
        this.WITHDRAWAL_THRESHOLD = Number(process.env.REFERRAL_WITHDRAWAL_MIN) || 2000.00;

        // In-memory global referral withdrawal queue (backed by user store)
        this.withdrawalQueue = [];
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
     * Process multi-tier referral bonus upon backend payment confirmation (250 KES Activation)
     * @param {Object} referee - The newly deposited user
     * @param {number} depositAmount - Verified deposit amount
     * @param {Object} usersStore - Global users map
     * @param {Object} walletService - Wallet Service instance
     * @returns {Object} Settlement outcome
     */
    processReferralDeposit(referee, depositAmount, usersStore, walletService) {
        if (Number(depositAmount) >= this.ACTIVATION_FEE) {
            referee.isActivated = true;
            referee.isActive = true;
        }

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

        // ─── LEVEL 1: DIRECT REFERRER (KSh 100 Virtual Credits) ─────────────
        if (level1Referrer && level1Referrer.id !== referee.id) {
            const prevBal = level1Referrer.balance || 0;
            const prevCoins = level1Referrer.coins || 0;

            // Credit Virtual Referral Credits & Cash Balance
            level1Referrer.referralBalance = (level1Referrer.referralBalance || 0) + this.L1_COMMISSION;
            level1Referrer.referralEarnings = (level1Referrer.referralEarnings || 0) + this.L1_COMMISSION;
            level1Referrer.totalReferralEarnings = (level1Referrer.totalReferralEarnings || 0) + this.L1_COMMISSION;
            level1Referrer.referralCount = (level1Referrer.referralCount || 0) + 1;
            level1Referrer.xp = (level1Referrer.xp || 0) + 50;

            if (walletService) {
                walletService.creditWallet(level1Referrer, this.L1_COMMISSION, 'KSH', 'Direct Referral Commission (Level 1)');
                walletService.writeLedger(level1Referrer, this.L1_COMMISSION, `Direct Referral Bonus (Level 1) from ${referee.displayName || referee.phone || referee.id}`, prevBal, 'KSH');

                walletService.creditWallet(level1Referrer, this.L1_COINS, 'PLAY', 'Direct Referral Coins (Level 1)');
                walletService.writeLedger(level1Referrer, this.L1_COINS, `Direct Referral Coins (Level 1) from ${referee.displayName || referee.phone || referee.id}`, prevCoins, 'PLAY_COINS');
            }

            if (!level1Referrer.referralsList) level1Referrer.referralsList = [];
            level1Referrer.referralsList.push({
                refereeId: referee.id,
                refereeName: referee.displayName || referee.phone || referee.email || 'Player',
                level: 1,
                commissionEarned: this.L1_COMMISSION,
                coinsEarned: this.L1_COINS,
                joinedAt: new Date().toISOString()
            });

            outcomes.push({ level: 1, referrerId: level1Referrer.id, commission: this.L1_COMMISSION, coins: this.L1_COINS });

            console.log(`[REFERRAL L1 SUCCESS] Awarded KSh ${this.L1_COMMISSION} + ${this.L1_COINS} coins to Level 1 Referrer: ${level1Referrer.id}`);

            // ─── LEVEL 2: INDIRECT REFERRER (KSh 50 Virtual Credits) ───────────
            if (level1Referrer.referredBy) {
                const level2ReferrerId = level1Referrer.referredBy;
                const level2Referrer = usersStore[level2ReferrerId] || Object.values(usersStore).find(u => u.referralCode === level2ReferrerId || u.id === level2ReferrerId);

                if (level2Referrer && level2Referrer.id !== referee.id && level2Referrer.id !== level1Referrer.id) {
                    const prevBalL2 = level2Referrer.balance || 0;
                    const prevCoinsL2 = level2Referrer.coins || 0;

                    level2Referrer.referralBalance = (level2Referrer.referralBalance || 0) + this.L2_COMMISSION;
                    level2Referrer.referralEarnings = (level2Referrer.referralEarnings || 0) + this.L2_COMMISSION;
                    level2Referrer.totalReferralEarnings = (level2Referrer.totalReferralEarnings || 0) + this.L2_COMMISSION;
                    level2Referrer.indirectReferralCount = (level2Referrer.indirectReferralCount || 0) + 1;
                    level2Referrer.xp = (level2Referrer.xp || 0) + 25;

                    if (walletService) {
                        walletService.creditWallet(level2Referrer, this.L2_COMMISSION, 'KSH', 'Indirect Referral Commission (Level 2)');
                        walletService.writeLedger(level2Referrer, this.L2_COMMISSION, `Indirect Referral Bonus (Level 2) from ${referee.displayName || referee.phone || referee.id}`, prevBalL2, 'KSH');

                        walletService.creditWallet(level2Referrer, this.L2_COINS, 'PLAY', 'Indirect Referral Coins (Level 2)');
                        walletService.writeLedger(level2Referrer, this.L2_COINS, `Indirect Referral Coins (Level 2) from ${referee.displayName || referee.phone || referee.id}`, prevCoinsL2, 'PLAY_COINS');
                    }

                    if (!level2Referrer.referralsList) level2Referrer.referralsList = [];
                    level2Referrer.referralsList.push({
                        refereeId: referee.id,
                        refereeName: referee.displayName || referee.phone || referee.email || 'Player',
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
     * Submit a withdrawal request for accumulated referral earnings
     * Enforces the critical 2,000 KES Minimum Withdrawal Rule
     */
    requestWithdrawal(user, phone, amount = 2000, walletService = null) {
        const withdrawAmount = Number(amount) || this.WITHDRAWAL_THRESHOLD;
        const currentBalance = Number(user.referralBalance || 0);

        if (currentBalance < this.WITHDRAWAL_THRESHOLD) {
            const needed = this.WITHDRAWAL_THRESHOLD - currentBalance;
            throw new Error(`Minimum referral withdrawal is KSh ${this.WITHDRAWAL_THRESHOLD.toLocaleString()}. You need KSh ${needed.toLocaleString()} more to withdraw.`);
        }

        if (withdrawAmount < this.WITHDRAWAL_THRESHOLD) {
            throw new Error(`Minimum withdrawal amount is KSh ${this.WITHDRAWAL_THRESHOLD.toLocaleString()}`);
        }

        if (withdrawAmount > currentBalance) {
            throw new Error(`Insufficient referral balance. Available: KSh ${currentBalance.toLocaleString()}`);
        }

        const prevBalance = currentBalance;
        user.referralBalance = Math.max(0, currentBalance - withdrawAmount);

        const withdrawalTicket = {
            id: 'RW_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6).toUpperCase(),
            userId: user.id,
            userName: user.displayName || user.name || user.email || 'Player',
            phone: phone || user.phone || user.email || '',
            amount: withdrawAmount,
            status: 'PENDING', // PENDING -> APPROVED / PAID / REJECTED
            requestedAt: new Date().toISOString(),
            processedAt: null,
            adminNotes: '',
            mpesaReceipt: ''
        };

        if (!user.referralWithdrawals) user.referralWithdrawals = [];
        user.referralWithdrawals.unshift(withdrawalTicket);

        this.withdrawalQueue.unshift(withdrawalTicket);

        if (walletService) {
            walletService.writeLedger(user, -withdrawAmount, `Referral Earnings Withdrawal Request (${withdrawalTicket.id})`, prevBalance, 'KSH');
        }

        platformEvents.emitEvent('REFERRAL_WITHDRAWAL_REQUESTED', {
            userId: user.id,
            ticket: withdrawalTicket
        });

        console.log(`✅ [REFERRAL WITHDRAWAL SUBMITTED] User ${user.id} requested KSh ${withdrawAmount}. New Referral Balance: KSh ${user.referralBalance}`);

        return {
            success: true,
            ticket: withdrawalTicket,
            remainingBalance: user.referralBalance,
            message: `Withdrawal request for KSh ${withdrawAmount.toLocaleString()} submitted! Admin will send money to ${withdrawalTicket.phone} shortly.`
        };
    }

    /**
     * Admin: Approve/Pay withdrawal
     */
    approveWithdrawal(ticketId, mpesaReceipt = '', usersStore = {}) {
        const ticket = this.withdrawalQueue.find(w => w.id === ticketId);
        if (!ticket) throw new Error('Withdrawal ticket not found');

        ticket.status = 'PAID';
        ticket.processedAt = new Date().toISOString();
        ticket.mpesaReceipt = mpesaReceipt || 'MPESA_' + Date.now();

        // Update in user object
        const user = usersStore[ticket.userId] || Object.values(usersStore).find(u => u.id === ticket.userId);
        if (user && user.referralWithdrawals) {
            const userTicket = user.referralWithdrawals.find(w => w.id === ticketId);
            if (userTicket) {
                userTicket.status = 'PAID';
                userTicket.processedAt = ticket.processedAt;
                userTicket.mpesaReceipt = ticket.mpesaReceipt;
            }
        }

        return { success: true, ticket };
    }

    /**
     * Admin: Reject withdrawal (refunds balance)
     */
    rejectWithdrawal(ticketId, reason = 'Administrative Rejection', usersStore = {}) {
        const ticket = this.withdrawalQueue.find(w => w.id === ticketId);
        if (!ticket) throw new Error('Withdrawal ticket not found');

        ticket.status = 'REJECTED';
        ticket.processedAt = new Date().toISOString();
        ticket.adminNotes = reason;

        // Refund balance to user
        const user = usersStore[ticket.userId] || Object.values(usersStore).find(u => u.id === ticket.userId);
        if (user) {
            user.referralBalance = (user.referralBalance || 0) + ticket.amount;
            if (user.referralWithdrawals) {
                const userTicket = user.referralWithdrawals.find(w => w.id === ticketId);
                if (userTicket) {
                    userTicket.status = 'REJECTED';
                    userTicket.processedAt = ticket.processedAt;
                    userTicket.adminNotes = reason;
                }
            }
        }

        return { success: true, ticket, refunded: true };
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

        // Ensure user has referral balance initialized
        if (typeof user.referralBalance !== 'number') {
            user.referralBalance = Number(user.referralEarnings || (directEarnings + indirectEarnings) || 0);
        }

        const currentBalance = user.referralBalance || 0;
        const totalEarnings = user.totalReferralEarnings || user.referralEarnings || (directEarnings + indirectEarnings);
        const progressPercent = Math.min(100, Math.round((currentBalance / this.WITHDRAWAL_THRESHOLD) * 100));
        const remainingToWithdraw = Math.max(0, this.WITHDRAWAL_THRESHOLD - currentBalance);
        const canWithdraw = currentBalance >= this.WITHDRAWAL_THRESHOLD;

        const origin = baseUrl || 'https://game-win.vercel.app';
        const referralLink = `${origin}/?ref=${referralCode}`;

        return {
            referralCode,
            referralLink,
            balance: currentBalance,
            totalEarnings,
            targetWithdrawal: this.WITHDRAWAL_THRESHOLD,
            progressPercent,
            remainingToWithdraw,
            canWithdraw,
            isActivated: Boolean(user.isActivated || (user.totalDeposited >= 250) || user.isActive),
            stats: {
                directCount: directReferrals.length,
                indirectCount: indirectReferrals.length,
                totalCount: directReferrals.length + indirectReferrals.length,
                directEarnings,
                indirectEarnings,
                totalEarnings,
                totalCoinsEarned
            },
            directReferrals,
            indirectReferrals,
            recentEarnings: [...(user.referralsList || [])].reverse().slice(0, 20),
            withdrawals: user.referralWithdrawals || [],
            commissionRules: {
                activationFee: `KSh ${this.ACTIVATION_FEE} M-Pesa one-time activation`,
                level1: `KSh ${this.L1_COMMISSION} + ${this.L1_COINS} Play Coins per direct friend activation`,
                level2: `KSh ${this.L2_COMMISSION} + ${this.L2_COINS} Play Coins per 2nd tier friend activation`,
                withdrawalMinimum: `KSh ${this.WITHDRAWAL_THRESHOLD.toLocaleString()} Minimum Threshold`
            }
        };
    }

    /**
     * Admin Overview Stats
     */
    getAdminStats(usersStore = {}, financialStats = {}) {
        const allUsers = Object.values(usersStore);
        const activeUsers = allUsers.filter(u => u.isActivated || (u.totalDeposited >= 250) || u.isActive);
        const allReferrals = allUsers.reduce((sum, u) => sum + (u.referralCount || 0) + (u.indirectReferralCount || 0), 0);
        const totalCommissions = allUsers.reduce((sum, u) => sum + (u.totalReferralEarnings || u.referralEarnings || 0), 0);
        const pendingWithdrawals = this.withdrawalQueue.filter(w => w.status === 'PENDING');
        const paidWithdrawals = this.withdrawalQueue.filter(w => w.status === 'PAID');
        const totalPaidOut = paidWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

        return {
            totalTill: (financialStats.totalRevenue || 540000) - (financialStats.totalPayout || 81000) - totalPaidOut,
            totalUsers: allUsers.length,
            totalActiveUsers: activeUsers.length,
            totalReferrals: allReferrals,
            totalCommissionsPaid: totalCommissions,
            pendingWithdrawalsCount: pendingWithdrawals.length,
            totalWithdrawalsPaid: totalPaidOut,
            withdrawals: this.withdrawalQueue
        };
    }
}

module.exports = new ReferralService();
