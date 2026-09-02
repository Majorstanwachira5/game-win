/**
 * services/BinaryTradingService.js — Authoritative Binary / Prediction Options Engine
 *
 * Core Features:
 * 1. Multi-Asset Real-Time Price Feeds (BTC/USD, ETH/USD, SOL/USD, PLAY/KES).
 * 2. Multi-Timeframe OHLCV Candles & Live Order Books (Bids/Asks depth).
 * 3. Binary Options (CALL / PUT) Prediction Ledger.
 * 4. High-Frequency Expiry Settlement Engine (auto-settles at expiry timestamp).
 * 5. Early Settlement & Dynamic Floating P/L.
 * 6. User Performance Statistics (Win Rate, Streaks, Net P/L).
 */

const EventEmitter = require('events');

class BinaryTradingService extends EventEmitter {
    constructor(marketService) {
        super();
        this.marketService = marketService;

        // Supported Trading Asset Pairs
        this.pairs = {
            'BTC/USD': {
                symbol: 'BTC/USD',
                base: 'BTC',
                quote: 'USD',
                decimals: 2,
                price: 64250.00,
                basePrice: 64250.00,
                open24h: 63100.00,
                high24h: 65120.00,
                low24h: 62800.00,
                volume24h: 1845.50,
                volatility: 0.0008,
                status: 'LIVE_MARKET'
            },
            'ETH/USD': {
                symbol: 'ETH/USD',
                base: 'ETH',
                quote: 'USD',
                decimals: 2,
                price: 3450.00,
                basePrice: 3450.00,
                open24h: 3380.00,
                high24h: 3520.00,
                low24h: 3340.00,
                volume24h: 14230.80,
                volatility: 0.0012,
                status: 'LIVE_MARKET'
            },
            'SOL/USD': {
                symbol: 'SOL/USD',
                base: 'SOL',
                quote: 'USD',
                decimals: 2,
                price: 148.50,
                basePrice: 148.50,
                open24h: 142.00,
                high24h: 154.20,
                low24h: 139.80,
                volume24h: 94500.00,
                volatility: 0.0018,
                status: 'LIVE_MARKET'
            },
            'PLAY/KES': {
                symbol: 'PLAY/KES',
                base: 'PLAY',
                quote: 'KES',
                decimals: 4,
                price: marketService ? marketService.currentPrice : 0.60,
                basePrice: 0.60,
                open24h: 0.50,
                high24h: 0.65,
                low24h: 0.48,
                volume24h: 385000.00,
                volatility: 0.0015,
                status: 'PLAYCOIN_INTERNAL'
            }
        };

        // Supported Timeframe Intervals in ms
        this.INTERVAL_MS = {
            '30s': 30 * 1000,
            '1m': 60 * 1000,
            '2m': 2 * 60 * 1000,
            '5m': 5 * 60 * 1000,
            '10m': 10 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000
        };

        // In-memory Multi-Pair Multi-Timeframe Candles
        this.candles = {};
        Object.keys(this.pairs).forEach(pair => {
            this.candles[pair] = {
                '30s': [],
                '1m': [],
                '5m': [],
                '15m': [],
                '1h': []
            };
        });

        // Binary Trades In-Memory Store
        this.activeTrades = new Map(); // tradeId -> trade object
        this.settledTrades = []; // array of settled trade objects (most recent first)
        this.userStats = new Map(); // userId -> stats object
        this.idempotencyKeys = new Set();

        // Default Profit Multiplier for Winners: 85% profit (1.85x return)
        this.PAYOUT_RATE = 0.85;
        this.MIN_WAGER = 100;
        this.MAX_WAGER = 50000;

        // Initialize historical candle buffers
        this._initializeAllPairCandles();

        // Start tick loop (runs every 1000ms for smooth real-time ticks & expiry checks)
        this._startEngine();
    }

    /**
     * Build baseline multi-pair historical candles
     */
    _initializeAllPairCandles() {
        const now = Date.now();
        const timeframes = ['30s', '1m', '5m', '15m', '1h'];

        Object.keys(this.pairs).forEach(pair => {
            const pairConfig = this.pairs[pair];
            timeframes.forEach(tf => {
                const stepMs = this.INTERVAL_MS[tf] || 60000;
                const candleCount = 100;
                const generated = [];

                let runningPrice = pairConfig.price * (0.97 + Math.random() * 0.06);

                for (let i = candleCount; i >= 1; i--) {
                    const candleTime = now - (i * stepMs);
                    const delta = (Math.random() - 0.49) * (pairConfig.price * pairConfig.volatility * Math.sqrt(stepMs / 1000));
                    const open = runningPrice;
                    const close = Math.max(open * 0.5, open + delta);
                    const high = Math.max(open, close) + Math.abs(delta * (0.2 + Math.random() * 0.6));
                    const low = Math.min(open, close) - Math.abs(delta * (0.2 + Math.random() * 0.6));
                    const volume = parseFloat((50 + Math.random() * 500).toFixed(2));

                    generated.push({
                        time: Math.floor(candleTime / 1000),
                        open: parseFloat(open.toFixed(pairConfig.decimals)),
                        high: parseFloat(high.toFixed(pairConfig.decimals)),
                        low: parseFloat(low.toFixed(pairConfig.decimals)),
                        close: parseFloat(close.toFixed(pairConfig.decimals)),
                        volume
                    });

                    runningPrice = close;
                }

                this.candles[pair][tf] = generated;
            });
        });
    }

    /**
     * High-precision Engine Loop (1 second tick)
     */
    _startEngine() {
        setInterval(() => {
            this._tickPriceFeeds();
            this._checkExpiries();
        }, 1000);
    }

    /**
     * Update live price feeds and append/update candles
     */
    _tickPriceFeeds() {
        const now = Date.now();
        const nowSec = Math.floor(now / 1000);

        Object.keys(this.pairs).forEach(pair => {
            const config = this.pairs[pair];

            // If PLAY/KES, mirror MarketService price with slight tick jitter
            if (pair === 'PLAY/KES' && this.marketService) {
                config.price = parseFloat(this.marketService.currentPrice.toFixed(config.decimals));
            } else {
                // Micro-fluctuation (Brownian drift)
                const drift = (Math.random() - 0.495) * (config.price * config.volatility);
                config.price = parseFloat(Math.max(config.price * 0.1, config.price + drift).toFixed(config.decimals));
            }

            // Update 24h High/Low/Volume
            if (config.price > config.high24h) config.high24h = config.price;
            if (config.price < config.low24h) config.low24h = config.price;
            config.volume24h = parseFloat((config.volume24h + (Math.random() * 2)).toFixed(2));

            // Update Candles for each timeframe
            ['30s', '1m', '5m', '15m', '1h'].forEach(tf => {
                const stepSec = Math.floor((this.INTERVAL_MS[tf] || 60000) / 1000);
                const candleList = this.candles[pair][tf];
                if (!candleList || candleList.length === 0) return;

                const lastCandle = candleList[candleList.length - 1];
                const currentCandleBucket = Math.floor(nowSec / stepSec) * stepSec;

                if (lastCandle.time === currentCandleBucket) {
                    // Update active candle
                    lastCandle.high = Math.max(lastCandle.high, config.price);
                    lastCandle.low = Math.min(lastCandle.low, config.price);
                    lastCandle.close = config.price;
                    lastCandle.volume = parseFloat((lastCandle.volume + 0.1).toFixed(2));
                } else if (currentCandleBucket > lastCandle.time) {
                    // Start a new candle
                    candleList.push({
                        time: currentCandleBucket,
                        open: lastCandle.close,
                        high: Math.max(lastCandle.close, config.price),
                        low: Math.min(lastCandle.close, config.price),
                        close: config.price,
                        volume: 0.1
                    });
                    if (candleList.length > 250) candleList.shift();
                }
            });
        });

        this.emit('tick', this.getAllPairsSummary());
    }

    /**
     * Check active trades for expiration and settle them immediately
     */
    _checkExpiries() {
        const now = Date.now();
        const toSettle = [];

        for (const [tradeId, trade] of this.activeTrades.entries()) {
            if (now >= trade.expiryTime && trade.status === 'ACTIVE') {
                toSettle.push(trade);
            }
        }

        toSettle.forEach(trade => {
            this._settleTrade(trade, 'EXPIRY');
        });
    }

    /**
     * Authoritatively settle a binary trade
     */
    _settleTrade(trade, reason = 'EXPIRY') {
        trade.status = 'SETTLED';
        trade.settlementTime = Date.now();
        const currentPairPrice = this.getPairPrice(trade.pair);
        trade.exitPrice = currentPairPrice;

        const isCall = trade.direction === 'CALL';
        const isPut = trade.direction === 'PUT';

        let result = 'LOST'; // WON, LOST, TIE
        let payout = 0;
        let totalReturn = 0;
        let netProfit = -trade.amount;

        if (trade.exitPrice === trade.entryPrice) {
            result = 'TIE';
            payout = 0;
            totalReturn = trade.amount; // 100% refund
            netProfit = 0;
        } else if ((isCall && trade.exitPrice > trade.entryPrice) || (isPut && trade.exitPrice < trade.entryPrice)) {
            result = 'WON';
            payout = parseFloat((trade.amount * this.PAYOUT_RATE).toFixed(2));
            totalReturn = parseFloat((trade.amount + payout).toFixed(2));
            netProfit = payout;
        } else {
            result = 'LOST';
            payout = 0;
            totalReturn = 0;
            netProfit = -trade.amount;
        }

        trade.result = result;
        trade.payout = payout;
        trade.totalReturn = totalReturn;
        trade.netProfit = netProfit;
        trade.reason = reason;

        // Move from active to settled
        this.activeTrades.delete(trade.id);
        this.settledTrades.unshift(trade);
        if (this.settledTrades.length > 1000) this.settledTrades.pop();

        // Update user statistics
        this._updateUserStats(trade.userId, result, netProfit);

        // Emit settlement event
        this.emit('tradeSettled', trade);

        return trade;
    }

    /**
     * Update user lifetime & daily trading statistics
     */
    _updateUserStats(userId, result, netProfit) {
        let stats = this.userStats.get(userId);
        if (!stats) {
            stats = {
                userId,
                totalTrades: 0,
                wins: 0,
                losses: 0,
                ties: 0,
                totalProfitLoss: 0,
                winRate: 0,
                currentStreak: 0,
                bestStreak: 0,
                lastTradeTime: Date.now()
            };
            this.userStats.set(userId, stats);
        }

        stats.totalTrades++;
        stats.totalProfitLoss = parseFloat((stats.totalProfitLoss + netProfit).toFixed(2));
        stats.lastTradeTime = Date.now();

        if (result === 'WON') {
            stats.wins++;
            stats.currentStreak = stats.currentStreak > 0 ? stats.currentStreak + 1 : 1;
            if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
        } else if (result === 'LOST') {
            stats.losses++;
            stats.currentStreak = stats.currentStreak < 0 ? stats.currentStreak - 1 : -1;
        } else {
            stats.ties++;
        }

        const winnable = stats.wins + stats.losses;
        stats.winRate = winnable > 0 ? parseFloat(((stats.wins / winnable) * 100).toFixed(1)) : 0;
    }

    /**
     * Place a new authoritative binary prediction
     */
    placePrediction({ userId, userEmail, pair, direction, amount, timeframe, idempotencyKey, userObj }) {
        if (!userId) throw new Error('Authentication required.');
        if (!pair || !this.pairs[pair]) throw new Error(`Invalid asset pair: ${pair}`);
        if (!['CALL', 'PUT'].includes(direction)) throw new Error('Direction must be CALL or PUT.');

        const wager = parseFloat(Number(amount).toFixed(2));
        if (isNaN(wager) || wager < this.MIN_WAGER) {
            throw new Error(`Minimum prediction wager is ${this.MIN_WAGER} PLAY.`);
        }
        if (wager > this.MAX_WAGER) {
            throw new Error(`Maximum prediction wager is ${this.MAX_WAGER} PLAY.`);
        }

        const tfMs = this.INTERVAL_MS[timeframe];
        if (!tfMs) {
            throw new Error(`Invalid timeframe: ${timeframe}. Supported: 30s, 1m, 2m, 5m, 10m, 15m, 30m, 1h.`);
        }

        // Idempotency check
        if (idempotencyKey) {
            if (this.idempotencyKeys.has(idempotencyKey)) {
                // Return existing trade
                for (const t of this.activeTrades.values()) {
                    if (t.idempotencyKey === idempotencyKey) return t;
                }
                for (const t of this.settledTrades) {
                    if (t.idempotencyKey === idempotencyKey) return t;
                }
            }
            this.idempotencyKeys.add(idempotencyKey);
        }

        // Real Balance Validation
        if (!userObj || (userObj.coins || 0) < wager) {
            throw new Error(`Insufficient PLAYCOIN balance. Available: ${(userObj?.coins || 0).toLocaleString()} PLAY, Required: ${wager.toLocaleString()} PLAY.`);
        }

        // Deduct Wager from Real Balance
        userObj.coins = parseFloat((userObj.coins - wager).toFixed(2));

        const entryPrice = this.getPairPrice(pair);
        const now = Date.now();
        const expiryTime = now + tfMs;
        const tradeId = 'bin_' + now + '_' + Math.random().toString(36).substring(2, 7);

        const trade = {
            id: tradeId,
            userId,
            userEmail: userEmail || '',
            pair,
            direction,
            amount: wager,
            entryPrice,
            timeframe,
            timeframeMs: tfMs,
            payoutRate: this.PAYOUT_RATE,
            potentialPayout: parseFloat((wager * this.PAYOUT_RATE).toFixed(2)),
            potentialReturn: parseFloat((wager * (1 + this.PAYOUT_RATE)).toFixed(2)),
            status: 'ACTIVE',
            entryTime: now,
            expiryTime,
            idempotencyKey: idempotencyKey || tradeId
        };

        this.activeTrades.set(tradeId, trade);
        this.emit('tradePlaced', trade);

        return trade;
    }

    /**
     * Early close an active prediction before expiry
     */
    closeEarly(tradeId, userId, userObj) {
        const trade = this.activeTrades.get(tradeId);
        if (!trade) throw new Error('Active prediction not found.');
        if (trade.userId !== userId) throw new Error('Unauthorized trade access.');
        if (trade.status !== 'ACTIVE') throw new Error('Trade is no longer active.');

        const currentPrice = this.getPairPrice(trade.pair);
        const isWinning = (trade.direction === 'CALL' && currentPrice > trade.entryPrice) ||
                          (trade.direction === 'PUT' && currentPrice < trade.entryPrice);

        // Early salvage value: 60% of potential return if currently winning, 20% salvage refund if currently losing
        const earlyReturn = isWinning
            ? parseFloat((trade.amount * (1 + this.PAYOUT_RATE * 0.6)).toFixed(2))
            : parseFloat((trade.amount * 0.20).toFixed(2));

        trade.status = 'SETTLED';
        trade.settlementTime = Date.now();
        trade.exitPrice = currentPrice;
        trade.result = isWinning ? 'WON_EARLY' : 'LOST_EARLY';
        trade.totalReturn = earlyReturn;
        trade.payout = parseFloat((earlyReturn - trade.amount).toFixed(2));
        trade.netProfit = trade.payout;
        trade.reason = 'EARLY_CLOSE';

        // Credit to user balance
        if (userObj) {
            userObj.coins = parseFloat(((userObj.coins || 0) + earlyReturn).toFixed(2));
        }

        this.activeTrades.delete(tradeId);
        this.settledTrades.unshift(trade);

        this._updateUserStats(userId, isWinning ? 'WON' : 'LOST', trade.netProfit);
        this.emit('tradeSettled', trade);

        return trade;
    }

    /**
     * Get active trades for a specific user
     */
    getUserActiveTrades(userId) {
        const now = Date.now();
        const list = [];

        for (const trade of this.activeTrades.values()) {
            if (trade.userId === userId) {
                const currentPrice = this.getPairPrice(trade.pair);
                const isCall = trade.direction === 'CALL';
                const isWinning = (isCall && currentPrice > trade.entryPrice) || (!isCall && currentPrice < trade.entryPrice);
                const isTie = currentPrice === trade.entryPrice;

                list.push({
                    ...trade,
                    currentPrice,
                    remainingMs: Math.max(0, trade.expiryTime - now),
                    remainingSec: Math.max(0, Math.ceil((trade.expiryTime - now) / 1000)),
                    isWinning,
                    isTie,
                    floatingProfit: isWinning ? trade.potentialPayout : (isTie ? 0 : -trade.amount)
                });
            }
        }

        return list.sort((a, b) => a.expiryTime - b.expiryTime);
    }

    /**
     * Get trade history for a user
     */
    getUserTradeHistory(userId, limit = 50) {
        return this.settledTrades
            .filter(t => t.userId === userId)
            .slice(0, limit);
    }

    /**
     * Get performance stats for a user
     */
    getUserPerformance(userId) {
        const stats = this.userStats.get(userId) || {
            userId,
            totalTrades: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            totalProfitLoss: 0,
            winRate: 0,
            currentStreak: 0,
            bestStreak: 0,
            lastTradeTime: null
        };

        return stats;
    }

    /**
     * Get pair price
     */
    getPairPrice(pair) {
        return this.pairs[pair] ? this.pairs[pair].price : 0;
    }

    /**
     * Get all pairs summary
     */
    getAllPairsSummary() {
        const summary = {};
        Object.keys(this.pairs).forEach(pair => {
            const p = this.pairs[pair];
            const change = p.price - p.open24h;
            const changePercent = p.open24h > 0 ? parseFloat(((change / p.open24h) * 100).toFixed(2)) : 0;

            summary[pair] = {
                pair,
                symbol: p.symbol,
                price: p.price,
                decimals: p.decimals,
                change: parseFloat(change.toFixed(p.decimals)),
                changePercent,
                high24h: p.high24h,
                low24h: p.low24h,
                volume24h: p.volume24h,
                status: p.status
            };
        });
        return summary;
    }

    /**
     * Get Candles for pair and timeframe
     */
    getCandles(pair, timeframe = '1m') {
        const tf = this.INTERVAL_MS[timeframe] ? timeframe : '1m';
        if (!this.candles[pair] || !this.candles[pair][tf]) {
            return [];
        }
        return this.candles[pair][tf];
    }

    /**
     * Get synthetic order book with realistic depth for an asset pair
     */
    getOrderBook(pair) {
        const config = this.pairs[pair];
        if (!config) return { bids: [], asks: [] };

        const mid = config.price;
        const decimals = config.decimals;
        const bids = [];
        const asks = [];

        for (let i = 1; i <= 6; i++) {
            const bidPrice = parseFloat((mid * (1 - (i * 0.0004))).toFixed(decimals));
            const bidSize = parseFloat((0.2 * i + Math.random() * 1.5).toFixed(3));
            bids.push({ price: bidPrice, size: bidSize, total: parseFloat((bidPrice * bidSize).toFixed(2)) });

            const askPrice = parseFloat((mid * (1 + (i * 0.0004))).toFixed(decimals));
            const askSize = parseFloat((0.2 * i + Math.random() * 1.5).toFixed(3));
            asks.push({ price: askPrice, size: askSize, total: parseFloat((askPrice * askSize).toFixed(2)) });
        }

        return { bids, asks, midPrice: mid, spread: parseFloat((asks[0].price - bids[0].price).toFixed(decimals)) };
    }
}

module.exports = BinaryTradingService;
