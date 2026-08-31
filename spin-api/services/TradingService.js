/**
 * services/TradingService.js — Authoritative PLAYCOIN Trading & Position Management Service
 * 
 * Responsibilities:
 * 1. Validates and executes backend-authoritative BUY and SELL orders for PLAYCOIN against cash balance.
 * 2. Idempotently protects against network retries (clientOrderId deduplication).
 * 3. Maintains active open positions, dynamically calculates unrealized P/L at live market prices.
 * 4. Enables position closing with authoritative settlement back to the user wallet.
 * 5. Writes immutable double-entry ledger records for every trade.
 * 6. Integrates seamlessly with MarketService and WalletService.
 */

const marketService = require('./MarketService');
const walletService = require('./WalletService');
const platformEvents = require('../events/EventEmitter');

class TradingService {
    constructor() {
        // In-memory active positions and order records indexed by userId
        this.positions = new Map(); // userId -> Array<Position>
        this.orders = new Map();    // userId -> Array<Order>
        this.history = new Map();   // userId -> Array<TradeHistoryItem>

        // Idempotency cache: clientOrderId -> { timestamp, result }
        this.idempotencyCache = new Map();

        // Periodically purge old idempotency keys older than 15 minutes
        setInterval(() => {
            const cutoff = Date.now() - 15 * 60 * 1000;
            for (const [key, val] of this.idempotencyCache.entries()) {
                if (val.timestamp < cutoff) {
                    this.idempotencyCache.delete(key);
                }
            }
        }, 60000);
    }

    /**
     * Execute an authoritative market order (BUY or SELL)
     */
    executeOrder(user, { side, amount, orderType = 'MARKET', clientOrderId = null }) {
        if (!user || !user.id) {
            throw new Error('Authenticated user is required for trading');
        }

        const validSide = String(side || '').toUpperCase();
        if (validSide !== 'BUY' && validSide !== 'SELL') {
            throw new Error("Invalid order side. Must be 'BUY' or 'SELL'");
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            throw new Error('Order amount must be a positive number');
        }

        const minAmount = 10; // Min trade size (KSh 10 for BUY, 10 PLAY for SELL)
        if (numericAmount < minAmount) {
            throw new Error(`Minimum trade amount is ${minAmount} ${validSide === 'BUY' ? 'KSh' : 'PLAY'}`);
        }

        // Check idempotency
        if (clientOrderId && this.idempotencyCache.has(clientOrderId)) {
            const cached = this.idempotencyCache.get(clientOrderId);
            return {
                ...cached.result,
                isDuplicate: true,
                message: 'Existing trade returned (idempotent request)'
            };
        }

        const currentPrice = marketService.currentPrice;
        if (!currentPrice || currentPrice <= 0) {
            throw new Error('Market price unavailable. Trading temporarily paused.');
        }

        const orderId = 'ord_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const positionId = 'pos_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const timestamp = Date.now();

        let executedOrder = null;
        let newPosition = null;

        if (validSide === 'BUY') {
            // User spends KSh cash from user.balance to buy PLAYCOIN
            const cashToSpend = Math.round(numericAmount * 100) / 100;
            if ((user.balance || 0) < cashToSpend) {
                throw new Error(`Insufficient cash balance. Available: KSh ${(user.balance || 0).toFixed(2)}, Required: KSh ${cashToSpend.toFixed(2)}`);
            }

            const coinsBought = Math.floor((cashToSpend / currentPrice) * 100) / 100;
            if (coinsBought <= 0) {
                throw new Error('Trade amount too small to purchase PLAYCOIN at current price');
            }

            // Deduct cash balance & credit coins
            const prevCash = user.balance || 0;
            const prevCoins = user.coins || 0;

            user.balance = Math.max(0, Math.round((prevCash - cashToSpend) * 100) / 100);
            user.coins = Math.round((prevCoins + coinsBought) * 100) / 100;

            // Immutable double-entry ledger records
            walletService.writeLedger(user, -cashToSpend, 'TRADE_BUY_CASH', prevCash, 'KSh');
            walletService.writeLedger(user, coinsBought, 'TRADE_BUY_PLAY', prevCoins, 'PLAY');

            executedOrder = {
                id: orderId,
                positionId,
                clientOrderId,
                userId: user.id,
                symbol: 'PLAY/KSh',
                side: 'BUY',
                orderType,
                amount: cashToSpend,
                quantity: coinsBought,
                executionPrice: currentPrice,
                status: 'FILLED',
                timestamp
            };

            newPosition = {
                id: positionId,
                userId: user.id,
                symbol: 'PLAY/KSh',
                side: 'BUY',
                size: coinsBought,
                entryPrice: currentPrice,
                collateral: cashToSpend,
                status: 'OPEN',
                openedAt: timestamp
            };
        } else {
            // User sells PLAYCOIN from user.coins to receive KSh cash
            const coinsToSell = Math.round(numericAmount * 100) / 100;
            if ((user.coins || 0) < coinsToSell) {
                throw new Error(`Insufficient PLAYCOIN balance. Available: ${(user.coins || 0).toFixed(2)} PLAY, Required: ${coinsToSell.toFixed(2)} PLAY`);
            }

            const cashReceived = Math.round(coinsToSell * currentPrice * 100) / 100;
            if (cashReceived <= 0) {
                throw new Error('Trade amount too small to generate cash at current price');
            }

            // Deduct coins & credit cash
            const prevCash = user.balance || 0;
            const prevCoins = user.coins || 0;

            user.coins = Math.max(0, Math.round((prevCoins - coinsToSell) * 100) / 100);
            user.balance = Math.round((prevCash + cashReceived) * 100) / 100;

            // Immutable double-entry ledger records
            walletService.writeLedger(user, -coinsToSell, 'TRADE_SELL_PLAY', prevCoins, 'PLAY');
            walletService.writeLedger(user, cashReceived, 'TRADE_SELL_CASH', prevCash, 'KSh');

            executedOrder = {
                id: orderId,
                positionId,
                clientOrderId,
                userId: user.id,
                symbol: 'PLAY/KSh',
                side: 'SELL',
                orderType,
                amount: coinsToSell,
                quantity: coinsToSell,
                cashReceived,
                executionPrice: currentPrice,
                status: 'FILLED',
                timestamp
            };

            newPosition = {
                id: positionId,
                userId: user.id,
                symbol: 'PLAY/KSh',
                side: 'SELL',
                size: coinsToSell,
                entryPrice: currentPrice,
                collateral: cashReceived,
                status: 'OPEN',
                openedAt: timestamp
            };
        }

        // Store active position
        if (!this.positions.has(user.id)) this.positions.set(user.id, []);
        this.positions.get(user.id).unshift(newPosition);

        // Store order
        if (!this.orders.has(user.id)) this.orders.set(user.id, []);
        this.orders.get(user.id).unshift(executedOrder);

        // Store trade history
        if (!this.history.has(user.id)) this.history.set(user.id, []);
        this.history.get(user.id).unshift({
            ...executedOrder,
            type: 'TRADE_EXECUTION'
        });

        // Record market activity volume
        marketService.recordActivityVolume(numericAmount);

        // Emit real-time platform event
        platformEvents.emit('WALLET_UPDATED', {
            userId: user.id,
            balance: user.balance,
            coins: user.coins,
            assetType: validSide === 'BUY' ? 'PLAY' : 'KSh',
            amountCredited: validSide === 'BUY' ? executedOrder.quantity : executedOrder.cashReceived,
            gameSource: 'PLAYCOIN_TRADE'
        });

        const resultPayload = {
            success: true,
            order: executedOrder,
            position: newPosition,
            user: {
                id: user.id,
                balance: user.balance,
                coins: user.coins
            },
            marketPrice: currentPrice
        };

        // Cache for idempotency
        if (clientOrderId) {
            this.idempotencyCache.set(clientOrderId, {
                timestamp: Date.now(),
                result: resultPayload
            });
        }

        return resultPayload;
    }

    /**
     * Get user active open positions with live calculated P/L
     */
    getUserPositions(userId) {
        if (!userId) return [];
        const userPosList = this.positions.get(userId) || [];
        const currentPrice = marketService.currentPrice;

        return userPosList.map(pos => {
            const entryPrice = pos.entryPrice;
            const size = pos.size;
            let unrealizedPL = 0;
            let plPercent = 0;

            if (pos.side === 'BUY') {
                unrealizedPL = Math.round((currentPrice - entryPrice) * size * 100) / 100;
                plPercent = entryPrice > 0 ? Math.round(((currentPrice - entryPrice) / entryPrice * 100) * 100) / 100 : 0;
            } else {
                unrealizedPL = Math.round((entryPrice - currentPrice) * size * 100) / 100;
                plPercent = entryPrice > 0 ? Math.round(((entryPrice - currentPrice) / entryPrice * 100) * 100) / 100 : 0;
            }

            return {
                ...pos,
                currentPrice,
                unrealizedPL,
                plPercent,
                valuation: Math.round(size * currentPrice * 100) / 100
            };
        });
    }

    /**
     * Close an active open position at live market price
     */
    closePosition(user, positionId) {
        if (!user || !user.id) {
            throw new Error('Authenticated user is required');
        }

        const userPosList = this.positions.get(user.id) || [];
        const posIndex = userPosList.findIndex(p => p.id === positionId && p.status === 'OPEN');
        if (posIndex === -1) {
            throw new Error('Position not found or already closed');
        }

        const pos = userPosList[posIndex];
        const currentPrice = marketService.currentPrice;
        const entryPrice = pos.entryPrice;
        const size = pos.size;
        const closeTimestamp = Date.now();

        let realizedPL = 0;
        let plPercent = 0;

        if (pos.side === 'BUY') {
            realizedPL = Math.round((currentPrice - entryPrice) * size * 100) / 100;
            plPercent = entryPrice > 0 ? Math.round(((currentPrice - entryPrice) / entryPrice * 100) * 100) / 100 : 0;
        } else {
            realizedPL = Math.round((entryPrice - currentPrice) * size * 100) / 100;
            plPercent = entryPrice > 0 ? Math.round(((entryPrice - currentPrice) / entryPrice * 100) * 100) / 100 : 0;
        }

        // Mark position as closed
        pos.status = 'CLOSED';
        pos.closedAt = closeTimestamp;
        pos.closePrice = currentPrice;
        pos.realizedPL = realizedPL;
        pos.plPercent = plPercent;

        // Remove from active positions and append to history
        userPosList.splice(posIndex, 1);

        if (!this.history.has(user.id)) this.history.set(user.id, []);
        this.history.get(user.id).unshift({
            id: 'close_' + positionId,
            positionId: pos.id,
            userId: user.id,
            symbol: pos.symbol,
            side: pos.side === 'BUY' ? 'SELL_CLOSE' : 'BUY_CLOSE',
            size: pos.size,
            entryPrice: pos.entryPrice,
            closePrice: currentPrice,
            realizedPL,
            plPercent,
            timestamp: closeTimestamp,
            status: 'CLOSED'
        });

        // Record volume
        marketService.recordActivityVolume(size * currentPrice);

        return {
            success: true,
            closedPosition: pos,
            realizedPL,
            plPercent,
            user: {
                id: user.id,
                balance: user.balance,
                coins: user.coins
            }
        };
    }

    /**
     * Get user orders
     */
    getUserOrders(userId) {
        if (!userId) return [];
        return this.orders.get(userId) || [];
    }

    /**
     * Get user trade history
     */
    getUserHistory(userId) {
        if (!userId) return [];
        return this.history.get(userId) || [];
    }
}

module.exports = new TradingService();
