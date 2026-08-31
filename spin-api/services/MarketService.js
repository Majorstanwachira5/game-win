/**
 * services/MarketService.js — Authoritative PLAYCOIN Internal Market Data Service
 * 
 * Responsibilities:
 * 1. Generates and maintains authoritative internal PLAYCOIN market state and 24h statistics.
 * 2. Produces multi-timeframe OHLCV candlestick data buffers (1m, 5m, 15m, 1h, 4h, 1d).
 * 3. Incorporates platform gameplay volume and real time ticks deterministically.
 * 4. Exposes health and telemetry metrics for the Admin Dashboard.
 * 5. Strictly labels all data as 'PLAYCOIN INTERNAL MARKET'.
 */

const currencyConfig = require('../config/currency');

class MarketService {
    constructor() {
        this.symbol = currencyConfig.symbol || '$PLAY';
        this.currencyCode = currencyConfig.currencyCode || 'PLAY';
        this.status = 'PLAYCOIN INTERNAL MARKET';
        this.redeemTelegramUrl = process.env.PLAYCOIN_REDEEM_TELEGRAM_URL || 'https://t.me/PlayCoinRedemptionBot';
        
        // Base economic anchor: 1 PLAY = KSh 0.50 initial reference value
        this.basePrice = parseFloat(process.env.PLAYCOIN_INITIAL_PRICE || '0.50');
        this.currentPrice = this.basePrice;
        this.priceHistory = []; // [ { timestamp, price, volume } ]
        
        // Supported Candle Intervals in milliseconds
        this.INTERVAL_MS = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        };

        // In-memory OHLCV candle storage per timeframe (up to 500 candles each)
        this.candles = {
            '1m': [],
            '5m': [],
            '15m': [],
            '1h': [],
            '4h': [],
            '1d': []
        };

        this.stats24h = {
            open: this.basePrice,
            high: this.basePrice,
            low: this.basePrice,
            volume: 0,
            change: 0,
            changePercent: 0,
            tradesCount: 0,
            lastUpdated: Date.now()
        };

        this.serviceStartTime = Date.now();
        this.lastTickTime = Date.now();
        this.totalTicks = 0;

        // Initialize historical candle buffers
        this._initializeHistoricalData();

        // Start deterministic tick loop (every 5 seconds)
        this._startTickEngine();
    }

    /**
     * Build baseline historical candles backward from current time
     */
    _initializeHistoricalData() {
        const now = Date.now();
        const intervals = Object.keys(this.INTERVAL_MS);

        intervals.forEach(interval => {
            const stepMs = this.INTERVAL_MS[interval];
            const candleCount = 120; // 120 candles history
            const generated = [];

            let runningPrice = this.basePrice * (0.92 + Math.sin(interval.length) * 0.05);

            for (let i = candleCount; i >= 0; i--) {
                const candleTime = Math.floor((now - (i * stepMs)) / stepMs) * stepMs;
                
                // Deterministic pseudo-wave calculation based on timestamp
                const wave = Math.sin(candleTime / (stepMs * 8)) * 0.015 + Math.cos(candleTime / (stepMs * 17)) * 0.008;
                const open = Math.round(runningPrice * 10000) / 10000;
                const close = Math.round(Math.max(0.01, runningPrice * (1 + wave)) * 10000) / 10000;
                const high = Math.round(Math.max(open, close) * (1 + Math.abs(Math.sin(candleTime) * 0.012)) * 10000) / 10000;
                const low = Math.round(Math.min(open, close) * (1 - Math.abs(Math.cos(candleTime) * 0.010)) * 10000) / 10000;
                const volume = Math.round((500 + Math.abs(Math.sin(candleTime / stepMs) * 3500)) * 100) / 100;

                generated.push({
                    timestamp: candleTime,
                    open,
                    high,
                    low,
                    close,
                    volume
                });

                runningPrice = close;
            }

            this.candles[interval] = generated;
        });

        // Set initial current price from last 1m candle close
        const last1m = this.candles['1m'][this.candles['1m'].length - 1];
        if (last1m) {
            this.currentPrice = last1m.close;
        }

        this._recompute24hStats();
    }

    /**
     * Deterministic engine ticks every 5 seconds to advance live candles
     */
    _startTickEngine() {
        if (this._tickIntervalId) clearInterval(this._tickIntervalId);

        this._tickIntervalId = setInterval(() => {
            this._processTick();
        }, 5000);
    }

    /**
     * Process a periodic market state step
     */
    _processTick(volumeInjected = 0) {
        const now = Date.now();
        this.lastTickTime = now;
        this.totalTicks++;

        // Micro-drift calculation (bounded deterministic oscillation)
        const timeFactor = now / 1000;
        const drift = Math.sin(timeFactor / 12) * 0.0015 + (Math.cos(timeFactor / 37) * 0.0008);
        const nextPrice = Math.round(Math.max(0.05, this.currentPrice * (1 + drift)) * 10000) / 10000;

        const baseVolume = 10 + Math.floor(Math.abs(Math.sin(timeFactor) * 80));
        const tickVolume = baseVolume + (volumeInjected || 0);

        this.currentPrice = nextPrice;

        // Update each interval's active candle
        Object.keys(this.INTERVAL_MS).forEach(interval => {
            const stepMs = this.INTERVAL_MS[interval];
            const currentPeriodStart = Math.floor(now / stepMs) * stepMs;
            const candleList = this.candles[interval];

            if (!candleList || candleList.length === 0) {
                candleList.push({
                    timestamp: currentPeriodStart,
                    open: nextPrice,
                    high: nextPrice,
                    low: nextPrice,
                    close: nextPrice,
                    volume: tickVolume
                });
                return;
            }

            const latestCandle = candleList[candleList.length - 1];

            if (latestCandle.timestamp === currentPeriodStart) {
                // Update current forming candle
                latestCandle.high = Math.max(latestCandle.high, nextPrice);
                latestCandle.low = Math.min(latestCandle.low, nextPrice);
                latestCandle.close = nextPrice;
                latestCandle.volume = Math.round((latestCandle.volume + tickVolume) * 100) / 100;
            } else if (currentPeriodStart > latestCandle.timestamp) {
                // Finalize previous candle and start new candle
                const newCandle = {
                    timestamp: currentPeriodStart,
                    open: latestCandle.close,
                    high: Math.max(latestCandle.close, nextPrice),
                    low: Math.min(latestCandle.close, nextPrice),
                    close: nextPrice,
                    volume: tickVolume
                };
                candleList.push(newCandle);

                // Keep maximum 500 candles in memory
                if (candleList.length > 500) {
                    candleList.shift();
                }
            }
        });

        this._recompute24hStats();
    }

    /**
     * Record market volume from an actual game or coin activity
     */
    recordActivityVolume(amount) {
        const vol = Math.abs(Number(amount) || 0);
        if (vol > 0) {
            this._processTick(vol);
        }
    }

    /**
     * Compute 24-hour summary stats from 1h candles
     */
    _recompute24hStats() {
        const hourly = this.candles['1h'] || [];
        const last24 = hourly.slice(-24);

        if (last24.length === 0) {
            this.stats24h = {
                open: this.currentPrice,
                high: this.currentPrice,
                low: this.currentPrice,
                volume: 0,
                change: 0,
                changePercent: 0,
                tradesCount: this.totalTicks,
                lastUpdated: Date.now()
            };
            return;
        }

        const openPrice = last24[0].open;
        let highPrice = -Infinity;
        let lowPrice = Infinity;
        let totalVol = 0;

        last24.forEach(c => {
            if (c.high > highPrice) highPrice = c.high;
            if (c.low < lowPrice) lowPrice = c.low;
            totalVol += (c.volume || 0);
        });

        // Ensure current price is included in high/low
        highPrice = Math.max(highPrice, this.currentPrice);
        lowPrice = Math.min(lowPrice, this.currentPrice);

        const change = Math.round((this.currentPrice - openPrice) * 10000) / 10000;
        const changePercent = openPrice > 0 ? Math.round(((change / openPrice) * 100) * 100) / 100 : 0;

        this.stats24h = {
            open: Math.round(openPrice * 10000) / 10000,
            high: Math.round(highPrice * 10000) / 10000,
            low: Math.round(lowPrice * 10000) / 10000,
            volume: Math.round(totalVol * 100) / 100,
            change,
            changePercent,
            tradesCount: this.totalTicks,
            lastUpdated: Date.now()
        };
    }

    /**
     * Get authoritative market overview and 24h metrics
     */
    getMarketOverview(usersMap = {}) {
        let totalCirculatingCoins = 0;
        if (usersMap && typeof usersMap === 'object') {
            totalCirculatingCoins = Object.values(usersMap).reduce((sum, u) => sum + (Number(u.coins) || 0), 0);
        }

        return {
            symbol: this.symbol,
            currencyCode: this.currencyCode,
            currencyUnit: 'KSh',
            price: this.currentPrice,
            status: this.status,
            stats24h: { ...this.stats24h },
            totalCirculatingCoins: Math.round(totalCirculatingCoins * 100) / 100,
            redeemTelegramUrl: this.redeemTelegramUrl,
            supportedIntervals: Object.keys(this.INTERVAL_MS),
            serverTimestamp: Date.now()
        };
    }

    /**
     * Retrieve OHLCV candles for a given timeframe
     */
    getCandles(interval = '1h', limit = 100) {
        const validInterval = this.INTERVAL_MS[interval] ? interval : '1h';
        const rawCandles = this.candles[validInterval] || [];
        const requestedLimit = Math.min(Math.max(1, parseInt(limit) || 100), 500);
        const resultCandles = rawCandles.slice(-requestedLimit);

        return {
            success: true,
            symbol: this.symbol,
            currencyCode: this.currencyCode,
            interval: validInterval,
            count: resultCandles.length,
            status: this.status,
            candles: resultCandles
        };
    }

    /**
     * Admin health and telemetry status
     */
    getAdminTelemetry(usersMap = {}) {
        const candleDepths = {};
        Object.keys(this.candles).forEach(k => {
            candleDepths[k] = this.candles[k].length;
        });

        const circulating = Object.values(usersMap || {}).reduce((sum, u) => sum + (Number(u.coins) || 0), 0);

        return {
            serviceStatus: 'ONLINE',
            uptimeSeconds: Math.floor((Date.now() - this.serviceStartTime) / 1000),
            currentPrice: this.currentPrice,
            marketStatus: this.status,
            lastTickTimestamp: this.lastTickTime,
            totalTicksProcessed: this.totalTicks,
            stats24h: this.stats24h,
            candleDepths,
            totalCirculatingCoins: circulating,
            redeemTelegramUrl: this.redeemTelegramUrl,
            dataSource: 'BACKEND_AUTHORITATIVE_DETERMINISTIC'
        };
    }
}

module.exports = new MarketService();
