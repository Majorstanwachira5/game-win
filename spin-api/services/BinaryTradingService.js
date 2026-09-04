/**
 * BinaryTradingService.js — Authoritative Multi-Asset Binary Options & Systematic Market Engine
 * 
 * Features:
 * - Multi-Asset Price Feeds (BTC/USD, ETH/USD, SOL/USD, PLAY/KES)
 * - Systematic Multi-Harmonic Trend & Momentum Micro-Structure Engine
 * - Smooth Candlestick Progression (30s, 1m, 2m, 5m, 10m, 15m, 30m, 1h)
 * - Authoritative Real-Time Binary Predictions Execution (CALL / PUT)
 * - Dynamic Floating P/L Tracking & Early Close Salvage Action
 * - Exact Expiry Auto-Settlement (+85% Winner Profit, Tie Refund, Loss Settlement)
 * - Live Order Book Depth Generation
 * - Performance Analytics (Win Rate, P/L, Streaks)
 */

const EventEmitter = require('events');

class BinaryTradingService extends EventEmitter {
    constructor(marketService = null) {
        super();
        this.marketService = marketService;

        // Multi-Asset Baseline Configurations & Trend State
        this.pairs = {
            'BTC/USD': {
                symbol: 'BTC/USD',
                base: 'BTC',
                quote: 'USD',
                decimals: 2,
                price: 64250.00,
                basePrice: 64250.00,
                open24h: 63500.00,
                high24h: 65120.00,
                low24h: 62800.00,
                volume24h: 1845.50,
                volatility: 0.0006,
                trendDirection: 1,
                trendStrength: 1.25,
                trendDuration: 45,
                trendElapsed: 0,
                wavePeriodFast: 28,
                wavePeriodSlow: 140,
                tickCount: 0,
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
                volatility: 0.0008,
                trendDirection: -1,
                trendStrength: 0.85,
                trendDuration: 35,
                trendElapsed: 0,
                wavePeriodFast: 22,
                wavePeriodSlow: 110,
                tickCount: 15,
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
                volatility: 0.0012,
                trendDirection: 1,
                trendStrength: 0.12,
                trendDuration: 50,
                trendElapsed: 0,
                wavePeriodFast: 18,
                wavePeriodSlow: 90,
                tickCount: 40,
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
                volatility: 0.0010,
                trendDirection: 1,
                trendStrength: 0.0004,
                trendDuration: 60,
                trendElapsed: 0,
                wavePeriodFast: 30,
                wavePeriodSlow: 180,
                tickCount: 5,
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
        this.activeTrades = new Map();
        this.settledTrades = [];
        this.userStats = new Map();
        this.idempotencyKeys = new Set();

        // Default Profit Multiplier for Winners: 85% profit (1.85x return)
        this.PAYOUT_RATE = 0.85;
        this.MIN_WAGER = 100;
        this.MAX_WAGER = 50000;

        // Initialize historical systematic candle buffers
        this._initializeAllPairCandles();

        // Start high-frequency engine loop (1000ms systematic ticks)
        this._startEngine();
    }

    /**
     * Build baseline multi-pair historical candles with systematic momentum and harmonic waves
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

                let runningPrice = pairConfig.basePrice * 0.985;
                const periodFactor = stepMs / 1000;

                for (let i = candleCount; i >= 1; i--) {
                    const candleTime = now - (i * stepMs);
                    const t = candleTime / 1000;

                    // Systematic multi-wave harmonics (macro cycle + swing wave + micro oscillation)
                    const macroWave = Math.sin(t / (periodFactor * 16)) * 0.008;
                    const swingWave = Math.cos(t / (periodFactor * 6)) * 0.004;
                    const microWave = Math.sin(t / (periodFactor * 2)) * 0.002;
                    const compositeDelta = (macroWave + swingWave + microWave) * pairConfig.basePrice;

                    const open = runningPrice;
                    const close = Math.max(pairConfig.basePrice * 0.5, open + compositeDelta);
                    const range = Math.abs(close - open);
                    const high = Math.max(open, close) + (range * 0.35) + (pairConfig.basePrice * pairConfig.volatility * 0.4);
                    const low = Math.min(open, close) - (range * 0.35) - (pairConfig.basePrice * pairConfig.volatility * 0.4);
                    const volume = parseFloat((120 + Math.abs(Math.sin(t / periodFactor)) * 400).toFixed(2));

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
     * Engine Loop (1 second tick)
     */
    _startEngine() {
        if (this._engineTimer) clearInterval(this._engineTimer);
        this._engineTimer = setInterval(() => {
            this._tickPriceFeeds();
            this._checkExpiries();
        }, 1000);
    }

    /**
     * Systematic Market Price Feed Step
     * Uses momentum velocity, harmonic wave oscillation, and mean-reverting drift
     */
    _tickPriceFeeds() {
        const now = Date.now();
        const nowSec = Math.floor(now / 1000);

        Object.keys(this.pairs).forEach(pair => {
            const config = this.pairs[pair];
            config.tickCount++;
            config.trendElapsed++;

            // Periodically cycle trend direction (Bull wave -> Range -> Bear wave)
            if (config.trendElapsed >= config.trendDuration) {
                config.trendElapsed = 0;
                config.trendDuration = 25 + Math.floor(Math.random() * 45); // 25s - 70s trend duration
                // Rotate trend: 1 (Bull) -> -1 (Bear) -> 1 (Bull) with slight bias to maintain equilibrium
                const meanDist = (config.price - config.basePrice) / config.basePrice;
                if (meanDist > 0.04) {
                    config.trendDirection = -1; // Overbought -> pull down
                } else if (meanDist < -0.04) {
                    config.trendDirection = 1; // Oversold -> pull up
                } else {
                    config.trendDirection = config.trendDirection === 1 ? -1 : 1;
                }
                config.trendStrength = (config.basePrice * config.volatility * 0.6) * (0.8 + Math.random() * 0.5);
            }

            // If PLAY/KES, couple to MarketService with smooth damping
            if (pair === 'PLAY/KES' && this.marketService) {
                config.price = parseFloat(this.marketService.currentPrice.toFixed(config.decimals));
            } else {
                // 1. Harmonic Wave Component (Fast + Slow)
                const fastAngle = (config.tickCount * 2 * Math.PI) / config.wavePeriodFast;
                const slowAngle = (config.tickCount * 2 * Math.PI) / config.wavePeriodSlow;
                const harmonicDelta = (Math.sin(fastAngle) * 0.45 + Math.cos(slowAngle) * 0.55) * (config.basePrice * config.volatility * 0.5);

                // 2. Momentum Trend Drift
                const trendDrift = (config.trendDirection * config.trendStrength * 0.25);

                // 3. Ornstein-Uhlenbeck Mean Reversion
                const ouReversion = (config.basePrice - config.price) * 0.0008;

                // 4. Subtle Micro-Tick Jitter
                const microJitter = (Math.sin(config.tickCount * 7.13) * 0.2) * (config.basePrice * config.volatility * 0.2);

                const totalStep = harmonicDelta + trendDrift + ouReversion + microJitter;
                const nextPrice = Math.max(config.basePrice * 0.2, config.price + totalStep);
                config.price = parseFloat(nextPrice.toFixed(config.decimals));
            }

            // Update 24h High/Low/Volume
            if (config.price > config.high24h) config.high24h = config.price;
            if (config.price < config.low24h) config.low24h = config.price;
            config.volume24h = parseFloat((config.volume24h + 0.25 + Math.abs(Math.sin(config.tickCount)) * 0.5).toFixed(2));

            // Update multi-timeframe candles systematically
            ['30s', '1m', '5m', '15m', '1h'].forEach(tf => {
                const stepSec = Math.floor((this.INTERVAL_MS[tf] || 60000) / 1000);
                const candleList = this.candles[pair][tf];
                if (!candleList || candleList.length === 0) return;

                const lastCandle = candleList[candleList.length - 1];
                const currentCandleBucket = Math.floor(nowSec / stepSec) * stepSec;

                if (lastCandle.time === currentCandleBucket) {
                    // Update current live candle smoothly
                    lastCandle.high = Math.max(lastCandle.high, config.price);
                    lastCandle.low = Math.min(lastCandle.low, config.price);
                    lastCandle.close = config.price;
                    lastCandle.volume = parseFloat((lastCandle.volume + 0.05).toFixed(2));
                } else if (currentCandleBucket > lastCandle.time) {
                    // Form new candle cleanly starting at previous candle's close
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
        const pairConfig = this.pairs[trade.pair];
        const exitPrice = pairConfig ? pairConfig.price : trade.entryPrice;
        trade.exitPrice = exitPrice;
        trade.settlementTime = Date.now();
        trade.status = 'SETTLED';

        const isCall = trade.direction === 'CALL';
        let result = 'LOST';
        let payout = 0;
        let totalReturn = 0;

        if (reason === 'EARLY_CLOSE') {
            const currentlyWinning = isCall ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice);
            if (currentlyWinning) {
                result = 'WON_EARLY';
                totalReturn = parseFloat((trade.amount * (1 + (this.PAYOUT_RATE * 0.65))).toFixed(2));
                payout = parseFloat((totalReturn - trade.amount).toFixed(2));
            } else {
                result = 'LOST_EARLY';
                totalReturn = parseFloat((trade.amount * 0.25).toFixed(2)); // 25% salvage refund
                payout = 0;
            }
        } else {
            // Standard Expiration
            if (exitPrice === trade.entryPrice) {
                result = 'TIE';
                payout = 0;
                totalReturn = trade.amount; // 100% refund
            } else if ((isCall && exitPrice > trade.entryPrice) || (!isCall && exitPrice < trade.entryPrice)) {
                result = 'WON';
                payout = parseFloat((trade.amount * this.PAYOUT_RATE).toFixed(2));
                totalReturn = parseFloat((trade.amount + payout).toFixed(2));
            } else {
                result = 'LOST';
                payout = 0;
                totalReturn = 0;
            }
        }

        trade.result = result;
        trade.payout = payout;
        trade.totalReturn = totalReturn;
        trade.netProfit = parseFloat((totalReturn - trade.amount).toFixed(2));

        // Credit user balance authoritatively
        if (totalReturn > 0 && trade.userObj) {
            trade.userObj.coins = parseFloat(((trade.userObj.coins || 0) + totalReturn).toFixed(2));
        }

        // Move from active to settled history
        this.activeTrades.delete(trade.id);
        this.settledTrades.unshift(trade);
        if (this.settledTrades.length > 500) this.settledTrades.pop();

        // Update performance stats
        this._updateUserStats(trade.userId, trade);

        // Emit settlement event
        this.emit('settled', trade);
        return trade;
    }

    /**
     * Place Binary Options Prediction
     */
    placePrediction({ userId, userEmail, pair, direction, amount, timeframe, idempotencyKey, userObj }) {
        if (idempotencyKey && this.idempotencyKeys.has(idempotencyKey)) {
            const existing = Array.from(this.activeTrades.values()).find(t => t.idempotencyKey === idempotencyKey);
            if (existing) return existing;
        }

        if (!this.pairs[pair]) {
            throw new Error(`Unsupported trading pair: ${pair}`);
        }

        const upperDir = (direction || '').toUpperCase();
        if (!['CALL', 'PUT'].includes(upperDir)) {
            throw new Error('Direction must be either CALL or PUT');
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount < this.MIN_WAGER) {
            throw new Error(`Minimum prediction wager is ${this.MIN_WAGER} PLAY.`);
        }
        if (numAmount > this.MAX_WAGER) {
            throw new Error(`Maximum prediction wager is ${this.MAX_WAGER} PLAY.`);
        }

        if (!userObj || (userObj.coins || 0) < numAmount) {
            throw new Error('Insufficient PLAYCOIN balance to place this wager.');
        }

        const tf = timeframe || '30s';
        const durationMs = this.INTERVAL_MS[tf] || (30 * 1000);
        const pairConfig = this.pairs[pair];
        const entryPrice = pairConfig.price;
        const now = Date.now();
        const expiryTime = now + durationMs;

        // Deduct wager from user balance
        userObj.coins = parseFloat(((userObj.coins || 0) - numAmount).toFixed(2));

        const tradeId = 'bin_' + now + '_' + Math.random().toString(36).substring(2, 7);
        const trade = {
            id: tradeId,
            idempotencyKey,
            userId,
            userEmail,
            pair,
            direction: upperDir,
            amount: numAmount,
            timeframe: tf,
            entryPrice,
            entryTime: now,
            expiryTime,
            potentialPayout: parseFloat((numAmount * this.PAYOUT_RATE).toFixed(2)),
            potentialReturn: parseFloat((numAmount * (1 + this.PAYOUT_RATE)).toFixed(2)),
            status: 'ACTIVE',
            result: null,
            exitPrice: null,
            payout: null,
            totalReturn: null,
            netProfit: null,
            userObj
        };

        this.activeTrades.set(tradeId, trade);
        if (idempotencyKey) this.idempotencyKeys.add(idempotencyKey);

        this.emit('trade_placed', trade);
        return trade;
    }

    /**
     * Close an Active Prediction Early
     */
    closeEarly(tradeId, userId, userObj) {
        const trade = this.activeTrades.get(tradeId);
        if (!trade) {
            throw new Error('Active prediction not found or already settled.');
        }
        if (trade.userId !== userId) {
            throw new Error('Unauthorized action for this trade.');
        }
        if (trade.status !== 'ACTIVE') {
            throw new Error('Trade is not active.');
        }

        if (userObj) trade.userObj = userObj;
        return this._settleTrade(trade, 'EARLY_CLOSE');
    }

    /**
     * Get user active predictions with live countdown and floating P/L
     */
    getUserActiveTrades(userId) {
        const now = Date.now();
        const list = [];

        for (const trade of this.activeTrades.values()) {
            if (trade.userId === userId && trade.status === 'ACTIVE') {
                const pairConfig = this.pairs[trade.pair];
                const currentPrice = pairConfig ? pairConfig.price : trade.entryPrice;
                const remainingMs = Math.max(0, trade.expiryTime - now);
                const isCall = trade.direction === 'CALL';
                const isWinning = isCall ? (currentPrice > trade.entryPrice) : (currentPrice < trade.entryPrice);
                const floatingProfit = isWinning ? trade.potentialPayout : -trade.amount;

                list.push({
                    id: trade.id,
                    pair: trade.pair,
                    direction: trade.direction,
                    amount: trade.amount,
                    timeframe: trade.timeframe,
                    entryPrice: trade.entryPrice,
                    currentPrice,
                    entryTime: trade.entryTime,
                    expiryTime: trade.expiryTime,
                    remainingMs,
                    remainingSec: Math.ceil(remainingMs / 1000),
                    isWinning,
                    floatingProfit,
                    potentialReturn: trade.potentialReturn,
                    potentialPayout: trade.potentialPayout
                });
            }
        }

        return list.sort((a, b) => a.expiryTime - b.expiryTime);
    }

    /**
     * Get settled predictions history
     */
    getUserTradeHistory(userId, limit = 50) {
        return this.settledTrades
            .filter(t => t.userId === userId)
            .slice(0, limit)
            .map(t => ({
                id: t.id,
                pair: t.pair,
                direction: t.direction,
                amount: t.amount,
                timeframe: t.timeframe,
                entryPrice: t.entryPrice,
                exitPrice: t.exitPrice,
                entryTime: t.entryTime,
                settlementTime: t.settlementTime,
                result: t.result,
                payout: t.payout,
                totalReturn: t.totalReturn,
                netProfit: t.netProfit
            }));
    }

    /**
     * Get user performance analytics
     */
    getUserPerformance(userId) {
        const stats = this.userStats.get(userId) || {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            winRate: 0,
            totalWagered: 0,
            totalPayout: 0,
            totalProfitLoss: 0,
            currentStreak: 0,
            bestStreak: 0
        };
        return stats;
    }

    _updateUserStats(userId, trade) {
        let stats = this.userStats.get(userId);
        if (!stats) {
            stats = {
                totalTrades: 0,
                wins: 0,
                losses: 0,
                ties: 0,
                winRate: 0,
                totalWagered: 0,
                totalPayout: 0,
                totalProfitLoss: 0,
                currentStreak: 0,
                bestStreak: 0
            };
            this.userStats.set(userId, stats);
        }

        stats.totalTrades++;
        stats.totalWagered = parseFloat((stats.totalWagered + trade.amount).toFixed(2));
        stats.totalPayout = parseFloat((stats.totalPayout + (trade.payout || 0)).toFixed(2));
        stats.totalProfitLoss = parseFloat((stats.totalProfitLoss + trade.netProfit).toFixed(2));

        const isWin = trade.result === 'WON' || trade.result === 'WON_EARLY';
        const isTie = trade.result === 'TIE';

        if (isWin) {
            stats.wins++;
            stats.currentStreak = stats.currentStreak >= 0 ? stats.currentStreak + 1 : 1;
            if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
        } else if (isTie) {
            stats.ties++;
        } else {
            stats.losses++;
            stats.currentStreak = stats.currentStreak <= 0 ? stats.currentStreak - 1 : -1;
        }

        stats.winRate = stats.totalTrades > 0 ? parseFloat(((stats.wins / stats.totalTrades) * 100).toFixed(1)) : 0;
    }

    /**
     * Get Live Order Book Depth for a pair
     */
    getOrderBook(pair) {
        const config = this.pairs[pair];
        if (!config) return { bids: [], asks: [] };

        const midPrice = config.price;
        const spread = config.price * 0.0004;
        const bids = [];
        const asks = [];

        for (let i = 1; i <= 6; i++) {
            const bidStep = i * (midPrice * 0.00025);
            const askStep = i * (midPrice * 0.00025);
            const bidPrice = parseFloat((midPrice - (spread / 2) - bidStep).toFixed(config.decimals));
            const askPrice = parseFloat((midPrice + (spread / 2) + askStep).toFixed(config.decimals));
            const bidSize = parseFloat((45 + Math.sin(i * 1.5) * 25 + Math.random() * 15).toFixed(2));
            const askSize = parseFloat((42 + Math.cos(i * 1.5) * 22 + Math.random() * 15).toFixed(2));

            bids.push({ price: bidPrice, size: bidSize, total: parseFloat((bidPrice * bidSize).toFixed(2)) });
            asks.push({ price: askPrice, size: askSize, total: parseFloat((askPrice * askSize).toFixed(2)) });
        }

        return {
            pair,
            midPrice,
            spread: parseFloat(spread.toFixed(config.decimals)),
            bids,
            asks
        };
    }

    /**
     * Get Candlestick data for pair and timeframe
     */
    getCandles(pair, timeframe = '30s') {
        const tf = this.candles[pair] && this.candles[pair][timeframe] ? timeframe : '30s';
        return (this.candles[pair] && this.candles[pair][tf]) ? this.candles[pair][tf] : [];
    }

    /**
     * Get All Pairs Real-Time Summary
     */
    getAllPairsSummary() {
        const summary = {};
        Object.keys(this.pairs).forEach(pair => {
            const c = this.pairs[pair];
            const change = c.price - c.open24h;
            const changePercent = c.open24h > 0 ? (change / c.open24h) * 100 : 0;

            summary[pair] = {
                symbol: c.symbol,
                base: c.base,
                quote: c.quote,
                decimals: c.decimals,
                price: c.price,
                change: parseFloat(change.toFixed(c.decimals)),
                changePercent: parseFloat(changePercent.toFixed(2)),
                high24h: c.high24h,
                low24h: c.low24h,
                volume24h: c.volume24h,
                status: c.status
            };
        });
        return summary;
    }
}

module.exports = BinaryTradingService;
