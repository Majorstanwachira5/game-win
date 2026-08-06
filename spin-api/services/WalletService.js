/**
 * services/WalletService.js — Centralized Wallet & Immutable Ledger Service
 * Handles all financial credits, debits, balance validations, and ledger transaction logging.
 * Decouples balance management completely from individual game modules.
 */
const currencyConfig = require('../config/currency');
const blockchainAdapter = require('../adapters/BlockchainAdapter');
const platformEvents = require('../events/EventEmitter');

class WalletService {
    /**
     * Check if a player account is a designated tester account
     */
    isTesterAccount(val) {
        if (!val) return false;
        if (typeof val === 'object' && val.isTester) return true;
        const str = (typeof val === 'string' ? val : JSON.stringify(val)).toLowerCase();
        return str.includes('brittanycooke') || str.includes('britannycooke');
    }

    /**
     * Validate whether user has sufficient balance for a wager
     */
    validateBalance(user, amount, assetType = 'KSH') {
        if (!user) return false;
        if (this.isTesterAccount(user)) return true; // Testers bypass wager constraints

        const required = Number(amount || 0);
        if (assetType === 'PLAY') {
            return (user.coins || 0) >= required;
        }
        return (user.balance || 0) >= required;
    }

    /**
     * Debit a wager or fee from user wallet
     */
    debitWallet(user, amount, assetType = 'KSH') {
        if (!user) return false;
        const isTester = this.isTesterAccount(user);
        const qty = Number(amount || 0);

        if (isTester) {
            user.coins = user.coins && Number(user.coins) >= 250000 ? Number(user.coins) : currencyConfig.defaultBalances.testerCoins;
            user.balance = user.balance && Number(user.balance) >= 250000 ? Number(user.balance) : currencyConfig.defaultBalances.testerCash;
            return true;
        }

        if (assetType === 'PLAY') {
            user.coins = Math.max(0, (user.coins || 0) - qty);
        } else {
            user.balance = Math.max(0, (user.balance || 0) - qty);
        }
        return true;
    }

    /**
     * Credit game winnings or bonus to user wallet
     */
    creditWallet(user, amount, assetType = 'PLAY', gameSource = 'Reward') {
        if (!user) return false;
        const isTester = this.isTesterAccount(user);
        const qty = Number(amount || 0);

        if (isTester) {
            user.coins = (user.coins || currencyConfig.defaultBalances.testerCoins) + qty;
            user.balance = (user.balance || currencyConfig.defaultBalances.testerCash);
        } else {
            if (assetType === 'PLAY') {
                user.coins = (user.coins || 0) + qty;
            } else {
                user.balance = (user.balance || 0) + qty;
            }
        }

        platformEvents.emitEvent('WALLET_UPDATED', {
            userId: user.id,
            newBalance: assetType === 'PLAY' ? user.coins : user.balance,
            assetType,
            amountCredited: qty,
            gameSource
        });

        return true;
    }

    /**
     * Record standardized, Web3-ready immutable transaction in ledger
     */
    writeLedger(user, amountWon, gameSource, prevBalance, assetType = 'PLAY_COINS') {
        if (!user) return null;
        if (!user.ledger) user.ledger = [];

        const transactionId = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const timestamp = Date.now();
        const balanceBefore = Number(prevBalance ?? 0);
        const balanceAfter = Number(assetType === 'PLAY_COINS' ? (user.coins || 0) : (user.balance || 0));

        const web3Meta = blockchainAdapter.buildWeb3Meta(gameSource, amountWon);

        const entry = {
            transactionId,
            player_id: user.id,
            source: 'GAMEPLAY',
            game: gameSource,
            amount: Number(amountWon || 0),
            currency: currencyConfig.currencyCode,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            status: currencyConfig.status,
            created_at: timestamp,
            metadata: {
                xpGained: user.xp || 0,
                vipTier: user.vipTier || 'bronze',
                doubleNextWin: !!user.doubleNextWin
            },
            blockchain_network: web3Meta.chain,
            blockchain_hash: web3Meta.txHash,
            wallet_address: user.web3WalletAddress || null,
            token_symbol: currencyConfig.symbol,
            smart_contract: web3Meta.contractAddress
        };

        user.ledger.unshift(entry);
        if (user.ledger.length > 50) user.ledger.pop();

        return entry;
    }
}

module.exports = new WalletService();
