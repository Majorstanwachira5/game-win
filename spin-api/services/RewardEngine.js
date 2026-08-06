/**
 * services/RewardEngine.js — Centralized Reward & VIP Multiplier Engine
 * Computes payouts, PlayCoin rewards, XP points, and VIP multipliers.
 * Eliminates duplicate reward calculations across game controllers.
 */
const walletService = require('./WalletService');
const platformEvents = require('../events/EventEmitter');

const VIP_MULTIPLIERS = {
    bronze: 1.0,
    silver: 1.1,
    gold: 1.25,
    platinum: 1.5,
    diamond: 2.0,
    black_card: 3.0
};

class RewardEngine {
    /**
     * Calculate PlayCoin bonus reward earned per wager
     */
    calculateRewardCoins(betAmount) {
        const bet = Number(betAmount) || 100;
        if (bet >= 1000) return bet * 4;
        return bet * 1;
    }

    /**
     * Apply VIP tier multiplier to base reward payout
     */
    applyVipMultiplier(baseAmount, vipTier = 'bronze') {
        const mult = VIP_MULTIPLIERS[vipTier.toLowerCase()] || 1.0;
        return Math.round(Number(baseAmount || 0) * mult);
    }

    /**
     * Process standardized game outcome reward, credit wallet, and write ledger
     */
    processRewardOutcome(user, gameSource, betAmount, winAmount, isTester = false) {
        const prevBalance = isTester ? (user.coins || 250000) : user.balance;

        if (winAmount > 0) {
            walletService.creditWallet(
                user,
                winAmount,
                isTester ? 'PLAY' : 'KSH',
                gameSource
            );
        }

        const ledgerEntry = walletService.writeLedger(
            user,
            winAmount,
            gameSource,
            prevBalance,
            isTester ? 'PLAY_COINS' : 'KSH'
        );

        platformEvents.emitEvent('REWARD_GRANTED', {
            userId: user.id,
            amount: winAmount,
            gameSource,
            assetType: isTester ? 'PLAY_COINS' : 'KSH',
            isTester
        });

        return {
            winAmount,
            ledgerEntry
        };
    }
}

module.exports = new RewardEngine();
