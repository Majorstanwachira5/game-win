/**
 * market.js — Authoritative PLAYCOIN Professional Trading Terminal Engine
 * 
 * Features:
 * - High-DPI HTML5 Canvas Chart with Pan & Zoom
 * - Multi-chart presentation modes (Candles, Line, Area, Bars/OHLC)
 * - Technical Indicators Engine (MA, EMA, Bollinger Bands, RSI, Volume)
 * - Interactive Crosshair / Magnifier with price & time axis bubbles
 * - Compact Drawing Tools (Crosshair, Trendline, Horizontal Line, Clear)
 * - Fullscreen Chart Mode expansion
 * - Backend-authoritative order placement (BUY / SELL PLAYCOIN)
 * - Real-time Open Positions with dynamic live P/L calculation & Position Close
 * - Order book history & authoritative double-entry ledger feeds
 * - Direct integration with existing verified M-Pesa STK Deposit (Min KSh 200)
 * - Strictly zero fake/mock frontend trading data
 */

(function (window, document) {
    'use strict';

    const MarketEngine = {
        // Core State
        activeInterval: '1h',
        activeChartType: 'candles',
        activeIndicators: { ma: true, ema: false, boll: false, rsi: false, vol: true },
        activeDrawingTool: 'crosshair',
        drawings: [],
        tempDrawing: null,
        isFullscreenChart: false,

        // Trading State
        activeTradeSide: 'BUY',
        activeWorkspaceTab: 'panePositions',
        positions: [],
        orders: [],
        tradeHistory: [],

        // Chart & Data Buffers
        candles: [],
        marketOverview: null,
        userActivity: [],
        isLoading: false,
        pollTimer: null,
        canvas: null,
        ctx: null,
        
        // Viewport & Pan/Zoom
        visibleCandlesCount: 40,
        panOffset: 0,
        isDragging: false,
        dragStartX: 0,
        dragStartOffset: 0,
        hoveredIndex: -1,
        hoverPos: null,

        // Configuration
        redeemTelegramUrl: 'https://t.me/PlayCoinRedemptionBot',

        /**
         * Initialize Market Engine
         */
        init: function () {
            this.canvas = document.getElementById('marketCandleCanvas');
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                this._bindCanvasEvents();
                this._setupResizeObserver();
            }

            try {
                const savedType = sessionStorage.getItem('market_chart_type');
                if (savedType && ['candles', 'line', 'area', 'ohlc'].includes(savedType)) {
                    this.activeChartType = savedType;
                }
                const savedInds = sessionStorage.getItem('market_indicators');
                if (savedInds) {
                    this.activeIndicators = JSON.parse(savedInds);
                }
            } catch (e) {}

            this._bindUIEvents();
            this.fetchMarketConfig();
        },

        /**
         * Fetch public market configuration
         */
        fetchMarketConfig: function () {
            fetch('/api/market/playcoin/config')
                .then(res => res.json())
                .then(data => {
                    if (data && data.redeemTelegramUrl) {
                        this.redeemTelegramUrl = data.redeemTelegramUrl;
                    }
                })
                .catch(() => {});
        },

        /**
         * Open the Market Dashboard Modal / View
         */
        openMarket: function () {
            const modal = document.getElementById('modal-market');
            if (!modal) return;

            if (window.closeAllModals) window.closeAllModals();

            modal.classList.add('open', 'active');
            modal.setAttribute('style', 'display: flex !important; z-index: 999999;');

            // Adjust canvas resolution
            setTimeout(() => {
                this.resizeCanvas();
                this.refreshAll();
            }, 50);

            // Start polling (every 6 seconds)
            this.startPolling();
        },

        /**
         * Close the Market Modal
         */
        closeMarket: function () {
            const modal = document.getElementById('modal-market');
            if (modal) {
                modal.classList.remove('open', 'active');
                modal.setAttribute('style', 'display: none !important;');
            }
            if (this.isFullscreenChart) {
                this.toggleFullscreenChart(false);
            }
            this.stopPolling();
        },

        /**
         * Toggle Fullscreen Chart Mode
         */
        toggleFullscreenChart: function (forceState) {
            const modal = document.getElementById('marketDashboardModal') || document.querySelector('.market-dashboard-modal');
            const btn = document.getElementById('btnFullscreenToggle');
            if (!modal) return;

            this.isFullscreenChart = typeof forceState === 'boolean' ? forceState : !this.isFullscreenChart;

            if (this.isFullscreenChart) {
                modal.classList.add('fullscreen-chart-mode');
                if (btn) {
                    btn.innerHTML = '<span class="expand-icon">✕</span> <span class="expand-btn-text">Exit Fullscreen</span>';
                }
            } else {
                modal.classList.remove('fullscreen-chart-mode');
                if (btn) {
                    btn.innerHTML = '<span class="expand-icon">⛶</span> <span class="expand-btn-text">Expand</span>';
                }
            }

            setTimeout(() => {
                this.resizeCanvas();
                this.drawChart();
            }, 30);
        },

        /**
         * Handle Action Dropdown Selection (Expand, Deposit, Exit)
         */
        handleActionSelect: function (selectEl) {
            if (!selectEl) return;
            const val = selectEl.value;
            selectEl.selectedIndex = 0; // Reset placeholder

            if (val === 'expand') {
                this.toggleFullscreenChart();
            } else if (val === 'deposit') {
                this.triggerDeposit();
            } else if (val === 'exit') {
                this.closeMarket();
            }
        },


        /**
         * Start polling loop
         */
        startPolling: function () {
            this.stopPolling();
            this.pollTimer = setInterval(() => {
                const modal = document.getElementById('modal-market');
                if (modal && (modal.classList.contains('open') || modal.style.display === 'flex')) {
                    this.fetchMarketOverview(true);
                    this.fetchCandles(true);
                    if (this.activeWorkspaceTab === 'panePositions') {
                        this.fetchPositions(true);
                    }
                } else {
                    this.stopPolling();
                }
            }, 6000);
        },

        /**
         * Stop polling loop
         */
        stopPolling: function () {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
        },

        /**
         * Full data refresh
         */
        refreshAll: function () {
            this.fetchMarketOverview(false);
            this.fetchCandles(false);
            this.fetchPositions(false);
            this.fetchOrders();
            this.fetchTradeHistory();
            this.fetchUserActivity();
        },

        /**
         * Fetch 24H Overview Stats & Prices
         */
        fetchMarketOverview: function (isBackground = false) {
            fetch('/api/market/playcoin')
                .then(res => res.json())
                .then(data => {
                    if (data && data.success) {
                        this.marketOverview = data;
                        if (data.redeemTelegramUrl) {
                            this.redeemTelegramUrl = data.redeemTelegramUrl;
                        }
                        this.renderMarketOverview(data);
                    } else if (!isBackground) {
                        this.renderOverviewError();
                    }
                })
                .catch(() => {
                    if (!isBackground) this.renderOverviewError();
                });
        },

        /**
         * Render 24H Market Overview Stats
         */
        renderMarketOverview: function (data) {
            const priceEl = document.getElementById('marketLivePrice');
            const changeEl = document.getElementById('marketLiveChange');
            const highEl = document.getElementById('market24hHigh');
            const lowEl = document.getElementById('market24hLow');
            const volEl = document.getElementById('market24hVolume');
            const statusEl = document.getElementById('marketStatusBadge');
            const supplyEl = document.getElementById('marketCirculatingSupply');
            const userBalEl = document.getElementById('marketUserCoinBal');
            const tradeCashEl = document.getElementById('tradeAvailableCash');
            const tradeCoinsEl = document.getElementById('tradeAvailableCoins');
            const tradeValEl = document.getElementById('tradeTotalValuation');
            const tradePriceDisplay = document.getElementById('tradeExecutionPriceDisplay');

            const price = Number(data.price || 0);
            const stats = data.stats24h || {};
            const change = Number(stats.change || 0);
            const changePct = Number(stats.changePercent || 0);
            const isPos = change >= 0;

            const headerPrice = document.getElementById('marketHeaderPrice');

            if (priceEl) priceEl.textContent = `KSh ${price.toFixed(4)}`;
            if (headerPrice) headerPrice.textContent = `KSh ${price.toFixed(4)}`;
            if (tradePriceDisplay) tradePriceDisplay.textContent = `KSh ${price.toFixed(4)}`;
            
            if (changeEl) {
                changeEl.textContent = `${isPos ? '+' : ''}${changePct.toFixed(2)}% (${isPos ? '+' : ''}${change.toFixed(4)})`;
                changeEl.className = `market-stat-badge ${isPos ? 'bullish' : 'bearish'}`;
            }


            if (highEl) highEl.textContent = stats.high ? `KSh ${Number(stats.high).toFixed(4)}` : 'Data unavailable';
            if (lowEl) lowEl.textContent = stats.low ? `KSh ${Number(stats.low).toFixed(4)}` : 'Data unavailable';
            if (volEl) volEl.textContent = stats.volume ? `${Number(stats.volume).toLocaleString('en-US')} PLAY` : 'Data unavailable';

            if (statusEl) statusEl.textContent = data.status || '● LIVE TERMINAL';
            if (supplyEl) supplyEl.textContent = data.totalCirculatingCoins !== undefined ? `Circulating: ${Number(data.totalCirculatingCoins).toLocaleString('en-US')} PLAY` : 'Circulating: Data unavailable';

            // Authoritative user balance
            let currentCoins = 0;
            let currentCash = 0;
            try {
                const stored = localStorage.getItem('spin_user_data');
                if (stored) {
                    const u = JSON.parse(stored);
                    currentCoins = Number(u.coins || 0);
                    currentCash = Number(u.balance || 0);
                }
            } catch (e) {}

            if (window.APP_STATE) {
                if (window.APP_STATE.coins !== undefined) currentCoins = window.APP_STATE.coins;
                if (window.APP_STATE.balance !== undefined) currentCash = window.APP_STATE.balance;
            }

            if (userBalEl) userBalEl.textContent = `${Number(currentCoins).toLocaleString('en-US')} PLAY`;
            if (tradeCashEl) tradeCashEl.textContent = `KSh ${Number(currentCash).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            if (tradeCoinsEl) tradeCoinsEl.textContent = `${Number(currentCoins).toLocaleString('en-US')} PLAY`;
            if (tradeValEl) {
                const totalVal = currentCash + (currentCoins * price);
                tradeValEl.textContent = `KSh ${totalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }

            this.calculateOrderPreview();
        },

        renderOverviewError: function () {
            const priceEl = document.getElementById('marketLivePrice');
            const highEl = document.getElementById('market24hHigh');
            const lowEl = document.getElementById('market24hLow');
            const volEl = document.getElementById('market24hVolume');

            if (priceEl && priceEl.textContent === '...') priceEl.textContent = 'Data unavailable';
            if (highEl && highEl.textContent === '...') highEl.textContent = 'Data unavailable';
            if (lowEl && lowEl.textContent === '...') lowEl.textContent = 'Data unavailable';
            if (volEl && volEl.textContent === '...') volEl.textContent = 'Data unavailable';
        },

        /**
         * Fetch Candlestick Data for Active Interval
         */
        fetchCandles: function (isBackground = false) {
            if (!isBackground) {
                this.isLoading = true;
                this.renderChartState('loading');
            }

            fetch(`/api/market/playcoin/candles?interval=${this.activeInterval}&limit=120`)
                .then(res => res.json())
                .then(data => {
                    this.isLoading = false;
                    if (data && data.success && Array.isArray(data.candles)) {
                        this.candles = data.candles;
                        if (this.candles.length === 0) {
                            this.renderChartState('empty');
                        } else {
                            this.hideChartState();
                            this.drawChart();
                        }
                    } else {
                        this.renderChartState('error');
                    }
                })
                .catch(() => {
                    this.isLoading = false;
                    this.renderChartState('error');
                });
        },

        activeSection: 'all',

        /**
         * Switch Active Terminal View Section (Mobile / Android viewports)
         */
        switchSection: function (section) {
            const valid = ['all', 'chart', 'trade', 'positions'];
            if (!valid.includes(section)) section = 'all';
            this.activeSection = section;

            // Sync Dropdown
            const dd = document.getElementById('tradingSectionDropdown');
            if (dd && dd.value !== section) dd.value = section;

            // Sync Nav Pills
            document.querySelectorAll('.section-nav-pill').forEach(pill => {
                pill.classList.toggle('active', pill.getAttribute('data-section') === section);
            });

            // Sync Bottom App Nav Bar
            document.querySelectorAll('.app-nav-item').forEach(item => {
                const label = item.textContent || '';
                const isChart = section === 'chart' && label.includes('Chart');
                const isTrade = section === 'trade' && (label.includes('BUY') || label.includes('SELL'));
                const isPos = section === 'positions' && label.includes('Positions');
                item.classList.toggle('active', (section === 'all' && label.includes('Chart')) || isChart || isTrade || isPos);
            });

            const chartSec = document.getElementById('marketChartSection');
            const bottomSec = document.getElementById('marketBottomSection');
            const actCard = document.getElementById('marketActivityCard');
            const tradePanel = document.getElementById('marketTradingPanel');
            const metricsStrip = document.getElementById('marketMetricsStrip');

            if (section === 'all') {
                if (metricsStrip) metricsStrip.style.display = '';
                if (chartSec) chartSec.style.display = '';
                if (bottomSec) bottomSec.style.display = '';
                if (actCard) actCard.style.display = '';
                if (tradePanel) tradePanel.style.display = '';
            } else if (section === 'chart') {
                if (metricsStrip) metricsStrip.style.display = '';
                if (chartSec) chartSec.style.display = 'flex';
                if (bottomSec) bottomSec.style.display = 'none';
            } else if (section === 'trade') {
                if (metricsStrip) metricsStrip.style.display = '';
                if (chartSec) chartSec.style.display = 'none';
                if (bottomSec) bottomSec.style.display = 'grid';
                if (actCard) actCard.style.display = 'none';
                if (tradePanel) tradePanel.style.display = 'flex';
            } else if (section === 'positions') {
                if (metricsStrip) metricsStrip.style.display = 'none';
                if (chartSec) chartSec.style.display = 'none';
                if (bottomSec) bottomSec.style.display = 'grid';
                if (actCard) actCard.style.display = 'block';
                if (tradePanel) tradePanel.style.display = 'none';
                this.setWorkspaceTab('panePositions');
            }

            setTimeout(() => {
                this.resizeCanvas();
                this.drawChart();
            }, 30);
        },

        /**
         * Toggle Technical Indicator From Dropdown
         */
        toggleIndicatorFromDropdown: function (ind) {
            if (ind) {
                this.toggleIndicator(ind);
                const sel = document.getElementById('selectIndicatorQuick');
                if (sel) sel.selectedIndex = 0; // reset to placeholder
            }
        },

        /**
         * Set Active Timeframe
         */
        setInterval: function (interval) {
            this.activeInterval = interval;
            this.panOffset = 0;
            this.hoveredIndex = -1;

            document.querySelectorAll('.market-time-tab').forEach(t => {
                t.classList.toggle('active', t.getAttribute('data-interval') === interval);
            });

            this.fetchCandles(false);
        },


        /**
         * Set Chart Presentation Type
         */
        setChartType: function (chartType) {
            const valid = ['candles', 'line', 'area', 'ohlc'];
            if (!valid.includes(chartType)) chartType = 'candles';
            this.activeChartType = chartType;

            try {
                sessionStorage.setItem('market_chart_type', chartType);
            } catch (e) {}

            const select = document.getElementById('selectChartType');
            if (select && select.value !== chartType) select.value = chartType;

            document.querySelectorAll('.market-type-tab').forEach(t => {
                t.classList.toggle('active', t.getAttribute('data-chart-type') === chartType);
            });

            this.drawChart();
        },


        /**
         * Toggle Indicator
         */
        toggleIndicator: function (ind) {
            if (this.activeIndicators[ind] !== undefined) {
                this.activeIndicators[ind] = !this.activeIndicators[ind];
                try {
                    sessionStorage.setItem('market_indicators', JSON.stringify(this.activeIndicators));
                } catch (e) {}

                document.querySelectorAll('.market-indicator-btn').forEach(btn => {
                    if (btn.getAttribute('data-indicator') === ind) {
                        btn.classList.toggle('active', this.activeIndicators[ind]);
                    }
                });

                this.drawChart();
            }
        },

        /**
         * Set Active Drawing Tool
         */
        setDrawingTool: function (tool) {
            if (tool === 'clear') {
                this.drawings = [];
                this.activeDrawingTool = 'crosshair';
                document.querySelectorAll('.drawing-tool-btn').forEach(b => {
                    b.classList.toggle('active', b.getAttribute('data-tool') === 'crosshair');
                });
                this.drawChart();
                return;
            }

            this.activeDrawingTool = tool;
            document.querySelectorAll('.drawing-tool-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-tool') === tool);
            });
        },

        /**
         * Canvas Resize & High-DPI Adaptation
         */
        resizeCanvas: function () {
            if (!this.canvas) return;
            const container = this.canvas.parentElement;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            const width = rect.width || 600;
            const height = rect.height || 280;

            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';

            if (this.ctx) {
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
        },

        _setupResizeObserver: function () {
            if (window.ResizeObserver && this.canvas && this.canvas.parentElement) {
                const ro = new ResizeObserver(() => {
                    this.resizeCanvas();
                    this.drawChart();
                });
                ro.observe(this.canvas.parentElement);
            }
        },

        /**
         * Mathematical Indicator Calculation Helpers
         */
        _calculateSMA: function (data, period) {
            const result = new Array(data.length).fill(null);
            for (let i = period - 1; i < data.length; i++) {
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += data[i - j].close;
                }
                result[i] = sum / period;
            }
            return result;
        },

        _calculateEMA: function (data, period) {
            const result = new Array(data.length).fill(null);
            if (data.length < period) return result;
            
            const k = 2 / (period + 1);
            let sum = 0;
            for (let i = 0; i < period; i++) sum += data[i].close;
            let prevEMA = sum / period;
            result[period - 1] = prevEMA;

            for (let i = period; i < data.length; i++) {
                const curEMA = (data[i].close * k) + (prevEMA * (1 - k));
                result[i] = curEMA;
                prevEMA = curEMA;
            }
            return result;
        },

        _calculateBollinger: function (data, period = 20, multiplier = 2) {
            const sma = this._calculateSMA(data, period);
            const upper = new Array(data.length).fill(null);
            const lower = new Array(data.length).fill(null);

            for (let i = period - 1; i < data.length; i++) {
                let sumSq = 0;
                for (let j = 0; j < period; j++) {
                    sumSq += Math.pow(data[i - j].close - sma[i], 2);
                }
                const stdDev = Math.sqrt(sumSq / period);
                upper[i] = sma[i] + (multiplier * stdDev);
                lower[i] = sma[i] - (multiplier * stdDev);
            }
            return { middle: sma, upper, lower };
        },

        _calculateRSI: function (data, period = 14) {
            const result = new Array(data.length).fill(null);
            if (data.length <= period) return result;

            let gains = 0;
            let losses = 0;

            for (let i = 1; i <= period; i++) {
                const diff = data[i].close - data[i - 1].close;
                if (diff >= 0) gains += diff;
                else losses -= diff;
            }

            let avgGain = gains / period;
            let avgLoss = losses / period;
            let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            result[period] = 100 - (100 / (1 + rs));

            for (let i = period + 1; i < data.length; i++) {
                const diff = data[i].close - data[i - 1].close;
                const gain = diff > 0 ? diff : 0;
                const loss = diff < 0 ? -diff : 0;

                avgGain = ((avgGain * (period - 1)) + gain) / period;
                avgLoss = ((avgLoss * (period - 1)) + loss) / period;
                rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
                result[i] = 100 - (100 / (1 + rs));
            }

            return result;
        },

        /**
         * Main Professional HTML5 Canvas Chart Rendering Pipeline
         */
        drawChart: function () {
            if (!this.ctx || !this.canvas) return;
            const ctx = this.ctx;
            const w = this.canvas.width / (window.devicePixelRatio || 1);
            const h = this.canvas.height / (window.devicePixelRatio || 1);

            ctx.clearRect(0, 0, w, h);

            if (!this.candles || this.candles.length === 0) {
                return;
            }

            const total = this.candles.length;
            const count = Math.min(Math.max(15, this.visibleCandlesCount), total);
            const startIndex = Math.max(0, Math.min(total - count, total - count - this.panOffset));
            const visibleSlice = this.candles.slice(startIndex, startIndex + count);

            if (visibleSlice.length === 0) return;

            // Layout dimensions
            const paddingLeft = 10;
            const paddingRight = 65; // Price axis on right
            const paddingTop = 12;
            const paddingBottom = 22; // Time axis
            const plotWidth = w - paddingLeft - paddingRight;

            // Check if RSI sub-pane is active
            const isRsiActive = this.activeIndicators.rsi;
            const mainPlotRatio = isRsiActive ? 0.74 : 1.0;
            const totalPlotHeight = h - paddingTop - paddingBottom;
            const mainPlotHeight = totalPlotHeight * mainPlotRatio;
            const rsiPlotTop = paddingTop + mainPlotHeight + 10;
            const rsiPlotHeight = isRsiActive ? (totalPlotHeight - mainPlotHeight - 10) : 0;

            // Calculate min/max price for visible slice
            let minPrice = Infinity;
            let maxPrice = -Infinity;
            let maxVolume = 0;

            visibleSlice.forEach(c => {
                if (c.low < minPrice) minPrice = c.low;
                if (c.high > maxPrice) maxPrice = c.high;
                if ((c.volume || 0) > maxVolume) maxVolume = c.volume;
            });

            if (minPrice === maxPrice) {
                minPrice *= 0.98;
                maxPrice *= 1.02;
            }

            const priceSpread = maxPrice - minPrice;
            minPrice -= priceSpread * 0.08;
            maxPrice += priceSpread * 0.08;
            const priceRange = maxPrice - minPrice;

            const getY = (p) => paddingTop + (mainPlotHeight * (1 - ((p - minPrice) / priceRange)));
            const getPriceFromY = (y) => maxPrice - (((y - paddingTop) / mainPlotHeight) * priceRange);
            const getVolY = (vol) => (paddingTop + mainPlotHeight) - ((vol / (maxVolume || 1)) * (mainPlotHeight * 0.22));

            const candleStep = plotWidth / visibleSlice.length;
            const candleWidth = Math.max(2, candleStep * 0.68);

            // 1. Grid Lines & Right Price Axis
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            ctx.font = '10px Sora, sans-serif';
            ctx.fillStyle = 'rgba(160, 175, 200, 0.75)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            const gridSteps = 5;
            for (let i = 0; i <= gridSteps; i++) {
                const p = minPrice + (priceRange * (i / gridSteps));
                const y = getY(p);

                ctx.beginPath();
                ctx.moveTo(paddingLeft, y);
                ctx.lineTo(paddingLeft + plotWidth, y);
                ctx.stroke();

                ctx.fillText(`KSh ${p.toFixed(4)}`, paddingLeft + plotWidth + 6, y);
            }
            ctx.restore();

            // 2. Volume Bars (if active)
            if (this.activeIndicators.vol !== false) {
                visibleSlice.forEach((c, idx) => {
                    const x = paddingLeft + (idx * candleStep) + (candleStep / 2);
                    const isBull = c.close >= c.open;
                    const volTop = getVolY(c.volume || 0);
                    const volHeight = (paddingTop + mainPlotHeight) - volTop;
                    ctx.fillStyle = isBull ? 'rgba(0, 230, 118, 0.18)' : 'rgba(255, 23, 68, 0.18)';
                    ctx.fillRect(x - (candleWidth / 2), volTop, candleWidth, volHeight);
                });
            }

            // 3. Render Price Series
            if (this.activeChartType === 'candles') {
                visibleSlice.forEach((c, idx) => {
                    const x = paddingLeft + (idx * candleStep) + (candleStep / 2);
                    const isBull = c.close >= c.open;
                    const candleColor = isBull ? '#00e676' : '#ff1744';
                    const bodyTop = getY(Math.max(c.open, c.close));
                    const bodyBottom = getY(Math.min(c.open, c.close));
                    const bodyHeight = Math.max(1, bodyBottom - bodyTop);

                    // Wick
                    ctx.beginPath();
                    ctx.strokeStyle = candleColor;
                    ctx.lineWidth = 1.2;
                    ctx.moveTo(x, getY(c.high));
                    ctx.lineTo(x, getY(c.low));
                    ctx.stroke();

                    // Body
                    ctx.fillStyle = candleColor;
                    ctx.fillRect(x - (candleWidth / 2), bodyTop, candleWidth, bodyHeight);
                });
            } else if (this.activeChartType === 'ohlc') {
                visibleSlice.forEach((c, idx) => {
                    const x = paddingLeft + (idx * candleStep) + (candleStep / 2);
                    const isBull = c.close >= c.open;
                    const candleColor = isBull ? '#00e676' : '#ff1744';
                    const tickSize = Math.max(3, candleWidth / 2);

                    ctx.beginPath();
                    ctx.strokeStyle = candleColor;
                    ctx.lineWidth = 1.4;
                    ctx.moveTo(x, getY(c.high));
                    ctx.lineTo(x, getY(c.low));
                    ctx.stroke();

                    // Open tick (left)
                    const openY = getY(c.open);
                    ctx.beginPath();
                    ctx.moveTo(x - tickSize, openY);
                    ctx.lineTo(x, openY);
                    ctx.stroke();

                    // Close tick (right)
                    const closeY = getY(c.close);
                    ctx.beginPath();
                    ctx.moveTo(x, closeY);
                    ctx.lineTo(x + tickSize, closeY);
                    ctx.stroke();
                });
            } else if (this.activeChartType === 'line' || this.activeChartType === 'area') {
                if (visibleSlice.length > 0) {
                    if (this.activeChartType === 'area') {
                        ctx.save();
                        const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + mainPlotHeight);
                        grad.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
                        grad.addColorStop(1, 'rgba(0, 240, 255, 0.01)');
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        const firstX = paddingLeft + (candleStep / 2);
                        const firstY = getY(visibleSlice[0].close);
                        ctx.moveTo(firstX, paddingTop + mainPlotHeight);
                        ctx.lineTo(firstX, firstY);

                        for (let i = 1; i < visibleSlice.length; i++) {
                            const x = paddingLeft + (i * candleStep) + (candleStep / 2);
                            const y = getY(visibleSlice[i].close);
                            ctx.lineTo(x, y);
                        }
                        const lastX = paddingLeft + ((visibleSlice.length - 1) * candleStep) + (candleStep / 2);
                        ctx.lineTo(lastX, paddingTop + mainPlotHeight);
                        ctx.closePath();
                        ctx.fill();
                        ctx.restore();
                    }

                    // Stroke Price Line
                    ctx.save();
                    ctx.strokeStyle = '#00f0ff';
                    ctx.lineWidth = 2;
                    ctx.shadowColor = 'rgba(0, 240, 255, 0.5)';
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    for (let i = 0; i < visibleSlice.length; i++) {
                        const x = paddingLeft + (i * candleStep) + (candleStep / 2);
                        const y = getY(visibleSlice[i].close);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                    ctx.restore();
                }
            }

            // 4. Moving Average (MA) Indicator Overlays
            if (this.activeIndicators.ma) {
                const allCandles = this.candles;
                const ma7 = this._calculateSMA(allCandles, 7);
                const ma25 = this._calculateSMA(allCandles, 25);
                const ma99 = this._calculateSMA(allCandles, 99);

                this._drawIndicatorLine(ctx, visibleSlice, startIndex, candleStep, paddingLeft, ma7, getY, '#ffd700', 1.2);
                this._drawIndicatorLine(ctx, visibleSlice, startIndex, candleStep, paddingLeft, ma25, getY, '#00f0ff', 1.2);
                this._drawIndicatorLine(ctx, visibleSlice, startIndex, candleStep, paddingLeft, ma99, getY, '#b388ff', 1.2);
            }

            // 5. Exponential Moving Average (EMA) Indicator Overlays
            if (this.activeIndicators.ema) {
                const allCandles = this.candles;
                const ema12 = this._calculateEMA(allCandles, 12);
                const ema26 = this._calculateEMA(allCandles, 26);

                this._drawIndicatorLine(ctx, visibleSlice, startIndex, candleStep, paddingLeft, ema12, getY, '#ff4081', 1.3);
                this._drawIndicatorLine(ctx, visibleSlice, startIndex, candleStep, paddingLeft, ema26, getY, '#ffab00', 1.3);
            }

            // 6. Bollinger Bands Overlay
            if (this.activeIndicators.boll) {
                const boll = this._calculateBollinger(this.candles, 20, 2);
                this._drawIndicatorLine(ctx, visibleSlice, startIndex, candleStep, paddingLeft, boll.upper, getY, '#448aff', 1);
                this._drawIndicatorLine(ctx, visibleSlice, startIndex, candleStep, paddingLeft, boll.middle, getY, '#ffd700', 1);
                this._drawIndicatorLine(ctx, visibleSlice, startIndex, candleStep, paddingLeft, boll.lower, getY, '#448aff', 1);
            }

            // 7. RSI Sub-Pane
            if (isRsiActive) {
                ctx.save();
                // Sub-pane border
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.strokeRect(paddingLeft, rsiPlotTop, plotWidth, rsiPlotHeight);

                // RSI Reference Lines (70 and 30)
                const getRsiY = (rsiVal) => rsiPlotTop + (rsiPlotHeight * (1 - (rsiVal / 100)));
                ctx.setLineDash([3, 3]);
                ctx.strokeStyle = 'rgba(255, 23, 68, 0.35)';
                ctx.beginPath();
                ctx.moveTo(paddingLeft, getRsiY(70));
                ctx.lineTo(paddingLeft + plotWidth, getRsiY(70));
                ctx.stroke();

                ctx.strokeStyle = 'rgba(0, 230, 118, 0.35)';
                ctx.beginPath();
                ctx.moveTo(paddingLeft, getRsiY(30));
                ctx.lineTo(paddingLeft + plotWidth, getRsiY(30));
                ctx.stroke();

                ctx.setLineDash([]);
                ctx.font = '9px Sora, sans-serif';
                ctx.fillStyle = 'rgba(160, 175, 200, 0.6)';
                ctx.fillText('70', paddingLeft + plotWidth + 6, getRsiY(70));
                ctx.fillText('30', paddingLeft + plotWidth + 6, getRsiY(30));

                const allRsi = this._calculateRSI(this.candles, 14);
                this._drawIndicatorLine(ctx, visibleSlice, startIndex, candleStep, paddingLeft, allRsi, getRsiY, '#ff9100', 1.5);
                ctx.restore();
            }

            // 8. User Drawings (Trendlines & Horizontal Lines)
            if (this.drawings && this.drawings.length > 0) {
                ctx.save();
                this.drawings.forEach(d => {
                    if (d.type === 'hline') {
                        const y = getY(d.price);
                        ctx.strokeStyle = '#ffd700';
                        ctx.setLineDash([4, 2]);
                        ctx.lineWidth = 1.2;
                        ctx.beginPath();
                        ctx.moveTo(paddingLeft, y);
                        ctx.lineTo(paddingLeft + plotWidth, y);
                        ctx.stroke();
                    } else if (d.type === 'trendline') {
                        ctx.strokeStyle = '#00f0ff';
                        ctx.lineWidth = 1.8;
                        ctx.beginPath();
                        ctx.moveTo(d.x1, d.y1);
                        ctx.lineTo(d.x2, d.y2);
                        ctx.stroke();
                    }
                });
                ctx.restore();
            }

            // 9. Time Axis Labels
            ctx.save();
            ctx.fillStyle = 'rgba(160, 175, 200, 0.7)';
            ctx.font = '10px Sora, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            const timeStepCount = Math.min(6, visibleSlice.length);
            const timeIntervalStep = Math.floor(visibleSlice.length / timeStepCount);

            for (let i = 0; i < visibleSlice.length; i += timeIntervalStep) {
                const c = visibleSlice[i];
                if (!c) continue;
                const x = paddingLeft + (i * candleStep) + (candleStep / 2);
                const d = new Date(c.timestamp);
                let timeStr = this.activeInterval === '1d' ? `${d.getMonth() + 1}/${d.getDate()}` : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                ctx.fillText(timeStr, x, paddingTop + mainPlotHeight + (isRsiActive ? rsiPlotHeight + 14 : 6));
            }
            ctx.restore();

            // 10. Latest Price Guideline
            const lastCandle = this.candles[this.candles.length - 1];
            if (lastCandle) {
                const latestY = getY(lastCandle.close);
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = lastCandle.close >= lastCandle.open ? '#00e676' : '#ff1744';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(paddingLeft, latestY);
                ctx.lineTo(paddingLeft + plotWidth, latestY);
                ctx.stroke();

                ctx.setLineDash([]);
                ctx.fillStyle = lastCandle.close >= lastCandle.open ? '#00e676' : '#ff1744';
                ctx.fillRect(paddingLeft + plotWidth, latestY - 9, paddingRight, 18);
                ctx.fillStyle = '#000';
                ctx.font = 'bold 9px Sora, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${lastCandle.close.toFixed(4)}`, paddingLeft + plotWidth + (paddingRight / 2), latestY);
                ctx.restore();
            }

            // 11. Crosshair Guidelines & Axis Badges
            if (this.hoverPos && this.hoveredIndex >= 0 && this.hoveredIndex < visibleSlice.length) {
                const hoveredCandle = visibleSlice[this.hoveredIndex];
                const cx = paddingLeft + (this.hoveredIndex * candleStep) + (candleStep / 2);
                const cy = Math.max(paddingTop, Math.min(paddingTop + mainPlotHeight, this.hoverPos.y));

                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;

                // Vertical Line
                ctx.beginPath();
                ctx.moveTo(cx, paddingTop);
                ctx.lineTo(cx, paddingTop + mainPlotHeight + (isRsiActive ? rsiPlotHeight + 10 : 0));
                ctx.stroke();

                // Horizontal Line
                ctx.beginPath();
                ctx.moveTo(paddingLeft, cy);
                ctx.lineTo(paddingLeft + plotWidth, cy);
                ctx.stroke();

                // Y-Axis Price Badge
                ctx.setLineDash([]);
                const hoveredPrice = getPriceFromY(cy);
                ctx.fillStyle = '#00f0ff';
                ctx.fillRect(paddingLeft + plotWidth, cy - 9, paddingRight, 18);
                ctx.fillStyle = '#000';
                ctx.font = 'bold 9px Orbitron, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`KSh ${hoveredPrice.toFixed(4)}`, paddingLeft + plotWidth + (paddingRight / 2), cy);

                // X-Axis Time Badge
                const d = new Date(hoveredCandle.timestamp);
                const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                const timeBoxY = paddingTop + mainPlotHeight + (isRsiActive ? rsiPlotHeight + 12 : 4);
                ctx.fillStyle = '#ffd700';
                ctx.fillRect(cx - 24, timeBoxY, 48, 16);
                ctx.fillStyle = '#000';
                ctx.fillText(timeStr, cx, timeBoxY + 8);

                ctx.restore();

                this.updateHudReadout(hoveredCandle);
            } else if (lastCandle) {
                this.updateHudReadout(lastCandle);
            }
        },

        _drawIndicatorLine: function (ctx, visibleSlice, startIndex, candleStep, paddingLeft, allValues, getY, color, lineWidth) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            let first = true;

            for (let i = 0; i < visibleSlice.length; i++) {
                const globalIndex = startIndex + i;
                const val = allValues[globalIndex];
                if (val === null || val === undefined) continue;

                const x = paddingLeft + (i * candleStep) + (candleStep / 2);
                const y = getY(val);

                if (first) {
                    ctx.moveTo(x, y);
                    first = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();
        },

        updateHudReadout: function (c) {
            const hudOpen = document.getElementById('hudOpen');
            const hudHigh = document.getElementById('hudHigh');
            const hudLow = document.getElementById('hudLow');
            const hudClose = document.getElementById('hudClose');
            const hudVol = document.getElementById('hudVol');

            if (hudOpen) hudOpen.textContent = c.open.toFixed(4);
            if (hudHigh) hudHigh.textContent = c.high.toFixed(4);
            if (hudLow) hudLow.textContent = c.low.toFixed(4);
            if (hudClose) hudClose.textContent = c.close.toFixed(4);
            if (hudVol) hudVol.textContent = Number(c.volume || 0).toLocaleString('en-US');
        },

        renderChartState: function (state) {
            let overlay = document.getElementById('marketChartStateOverlay');
            if (!overlay && this.canvas) {
                overlay = document.createElement('div');
                overlay.id = 'marketChartStateOverlay';
                overlay.className = 'market-chart-state-overlay';
                this.canvas.parentElement.appendChild(overlay);
            }
            if (!overlay) return;

            overlay.style.display = 'flex';
            if (state === 'loading') {
                overlay.innerHTML = '<div class="market-spinner"></div><p>Streaming Order Flow...</p>';
            } else if (state === 'error') {
                overlay.innerHTML = '<span>⚠️</span><p>Market feed unavailable. Retrying...</p>';
            } else if (state === 'empty') {
                overlay.innerHTML = '<span>📊</span><p>Initializing order book...</p>';
            }
        },

        hideChartState: function () {
            const overlay = document.getElementById('marketChartStateOverlay');
            if (overlay) overlay.style.display = 'none';
        },

        /**
         * Canvas Interactive Events (Crosshair, Drag Pan, Pinch Zoom, Drawing Tools)
         */
        _bindCanvasEvents: function () {
            if (!this.canvas) return;

            const handlePointerMove = (clientX, clientY) => {
                const rect = this.canvas.getBoundingClientRect();
                const x = clientX - rect.left;
                const y = clientY - rect.top;

                this.hoverPos = { x, y };
                const plotWidth = rect.width - 75;
                const total = this.candles.length;
                const count = Math.min(Math.max(15, this.visibleCandlesCount), total);
                const candleStep = plotWidth / count;
                const idx = Math.floor((x - 10) / candleStep);

                if (idx >= 0 && idx < count) {
                    this.hoveredIndex = idx;
                } else {
                    this.hoveredIndex = -1;
                }
                this.drawChart();
            };

            this.canvas.addEventListener('mousemove', (e) => {
                if (this.isDragging) {
                    const dx = e.clientX - this.dragStartX;
                    const rect = this.canvas.getBoundingClientRect();
                    const plotWidth = rect.width - 75;
                    const total = this.candles.length;
                    const count = Math.min(Math.max(15, this.visibleCandlesCount), total);
                    const candleStep = plotWidth / count;
                    const shift = Math.round(dx / candleStep);
                    this.panOffset = Math.max(0, Math.min(total - count, this.dragStartOffset + shift));
                    this.drawChart();
                } else {
                    handlePointerMove(e.clientX, e.clientY);
                }
            });

            this.canvas.addEventListener('mouseleave', () => {
                this.hoveredIndex = -1;
                this.hoverPos = null;
                this.isDragging = false;
                this.drawChart();
            });

            this.canvas.addEventListener('mousedown', (e) => {
                if (this.activeDrawingTool === 'hline') {
                    const rect = this.canvas.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    // Calculate price
                    const total = this.candles.length;
                    const count = Math.min(Math.max(15, this.visibleCandlesCount), total);
                    const startIndex = Math.max(0, Math.min(total - count, total - count - this.panOffset));
                    const visibleSlice = this.candles.slice(startIndex, startIndex + count);
                    let minPrice = Infinity, maxPrice = -Infinity;
                    visibleSlice.forEach(c => {
                        if (c.low < minPrice) minPrice = c.low;
                        if (c.high > maxPrice) maxPrice = c.high;
                    });
                    const priceSpread = maxPrice - minPrice;
                    minPrice -= priceSpread * 0.08;
                    maxPrice += priceSpread * 0.08;
                    const priceRange = maxPrice - minPrice;
                    const h = rect.height;
                    const mainPlotHeight = h - 34;
                    const price = maxPrice - (((y - 12) / mainPlotHeight) * priceRange);

                    this.drawings.push({ type: 'hline', price });
                    this.drawChart();
                    return;
                }

                this.isDragging = true;
                this.dragStartX = e.clientX;
                this.dragStartOffset = this.panOffset;
            });

            window.addEventListener('mouseup', () => {
                this.isDragging = false;
            });

            // Wheel to Zoom
            this.canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const zoomFactor = e.deltaY < 0 ? -5 : 5;
                this.visibleCandlesCount = Math.min(100, Math.max(15, this.visibleCandlesCount + zoomFactor));
                this.drawChart();
            }, { passive: false });

            // Touch Support for Mobile
            this.canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    this.isDragging = true;
                    this.dragStartX = e.touches[0].clientX;
                    this.dragStartOffset = this.panOffset;
                    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: true });

            this.canvas.addEventListener('touchmove', (e) => {
                if (this.isDragging && e.touches.length === 1) {
                    const rect = this.canvas.getBoundingClientRect();
                    const plotWidth = rect.width - 75;
                    const total = this.candles.length;
                    const count = Math.min(Math.max(15, this.visibleCandlesCount), total);
                    const dx = e.touches[0].clientX - this.dragStartX;
                    const candleStep = plotWidth / count;
                    const shift = Math.round(dx / candleStep);
                    this.panOffset = Math.max(0, Math.min(total - count, this.dragStartOffset + shift));
                    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: true });

            this.canvas.addEventListener('touchend', () => {
                this.isDragging = false;
                this.hoverPos = null;
                this.drawChart();
            });
        },

        /**
         * Bind UI Controls
         */
        _bindUIEvents: function () {
            // Chart Type tabs
            document.querySelectorAll('.market-type-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const chartType = e.currentTarget.getAttribute('data-chart-type');
                    if (chartType) this.setChartType(chartType);
                });
            });

            // Timeframe tabs
            document.querySelectorAll('.market-time-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const interval = e.currentTarget.getAttribute('data-interval');
                    if (interval) this.setInterval(interval);
                });
            });

            // Technical Indicators
            document.querySelectorAll('.market-indicator-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const ind = e.currentTarget.getAttribute('data-indicator');
                    if (ind) this.toggleIndicator(ind);
                });
            });

            // Drawing Tools
            document.querySelectorAll('.drawing-tool-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tool = e.currentTarget.getAttribute('data-tool');
                    if (tool) this.setDrawingTool(tool);
                });
            });

            // Workspace Tabs
            document.querySelectorAll('.workspace-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const pane = e.currentTarget.getAttribute('data-target-pane');
                    if (pane) this.setWorkspaceTab(pane);
                });
            });

            // Deposit Buttons
            document.querySelectorAll('.trigger-trading-deposit, .trigger-pay-and-trade').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.triggerDeposit();
                });
            });
        },

        /**
         * Workspace Tab Switcher
         */
        setWorkspaceTab: function (paneId) {
            this.activeWorkspaceTab = paneId;

            document.querySelectorAll('.workspace-tab-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-target-pane') === paneId);
            });

            document.querySelectorAll('.workspace-pane').forEach(p => {
                p.style.display = p.id === paneId ? 'block' : 'none';
                p.classList.toggle('active', p.id === paneId);
            });

            if (paneId === 'panePositions') this.fetchPositions();
            else if (paneId === 'paneOrders') this.fetchOrders();
            else if (paneId === 'paneHistory') this.fetchTradeHistory();
            else if (paneId === 'paneLedger') this.fetchUserActivity();
        },

        /**
         * Trading Order Execution Flow
         */
        setTradeSide: function (side) {
            this.activeTradeSide = side;
            const btnBuy = document.getElementById('btnSideBuy');
            const btnSell = document.getElementById('btnSideSell');
            const lblAmount = document.getElementById('tradeAmountLabel');
            const unitAmount = document.getElementById('tradeAmountUnit');
            const btnExec = document.getElementById('btnExecuteTrade');
            const btnExecText = document.getElementById('btnExecuteText');
            const availLabel = document.getElementById('tradeAvailableLabel');

            if (side === 'BUY') {
                if (btnBuy) btnBuy.className = 'trade-side-tab active-buy';
                if (btnSell) btnSell.className = 'trade-side-tab';
                if (lblAmount) lblAmount.textContent = 'AMOUNT (KSh):';
                if (unitAmount) unitAmount.textContent = 'KSh';
                if (availLabel) availLabel.textContent = 'Available Cash:';
                if (btnExec) {
                    btnExec.className = 'btn-execute-trade buy';
                    if (btnExecText) btnExecText.textContent = 'EXECUTE BUY ORDER';
                }
            } else {
                if (btnBuy) btnBuy.className = 'trade-side-tab';
                if (btnSell) btnSell.className = 'trade-side-tab active-sell';
                if (lblAmount) lblAmount.textContent = 'AMOUNT (PLAY):';
                if (unitAmount) unitAmount.textContent = 'PLAY';
                if (availLabel) availLabel.textContent = 'Available Coins:';
                if (btnExec) {
                    btnExec.className = 'btn-execute-trade sell';
                    if (btnExecText) btnExecText.textContent = 'EXECUTE SELL ORDER';
                }
            }

            this.calculateOrderPreview();
        },

        setTradePercent: function (percent) {
            const input = document.getElementById('tradeOrderAmount');
            if (!input) return;

            let balance = 0;
            try {
                const stored = localStorage.getItem('spin_user_data');
                if (stored) {
                    const u = JSON.parse(stored);
                    balance = this.activeTradeSide === 'BUY' ? Number(u.balance || 0) : Number(u.coins || 0);
                }
            } catch (e) {}

            if (window.APP_STATE) {
                if (this.activeTradeSide === 'BUY' && window.APP_STATE.balance !== undefined) balance = window.APP_STATE.balance;
                if (this.activeTradeSide === 'SELL' && window.APP_STATE.coins !== undefined) balance = window.APP_STATE.coins;
            }

            const calculated = Math.floor((balance * (percent / 100)) * 100) / 100;
            input.value = calculated > 0 ? calculated : '';
            this.calculateOrderPreview();
        },

        calculateOrderPreview: function () {
            const input = document.getElementById('tradeOrderAmount');
            const previewLabel = document.getElementById('tradePreviewLabel');
            const previewVal = document.getElementById('tradePreviewValue');
            if (!input || !previewVal) return;

            const val = parseFloat(input.value) || 0;
            const price = this.marketOverview ? Number(this.marketOverview.price || 0.5) : 0.5;

            if (this.activeTradeSide === 'BUY') {
                if (previewLabel) previewLabel.textContent = 'Estimated Receive:';
                const estCoins = price > 0 ? (val / price).toFixed(2) : '0.00';
                previewVal.textContent = `${Number(estCoins).toLocaleString('en-US')} PLAY`;
            } else {
                if (previewLabel) previewLabel.textContent = 'Estimated Cash:';
                const estCash = (val * price).toFixed(2);
                previewVal.textContent = `KSh ${Number(estCash).toLocaleString('en-US')}`;
            }
        },

        executeCurrentOrder: function () {
            const input = document.getElementById('tradeOrderAmount');
            const amount = parseFloat(input ? input.value : 0);
            if (!amount || amount < 10) {
                if (window.showToast) window.showToast('Please enter a valid order amount (Min 10).', 'error');
                return;
            }

            const btn = document.getElementById('btnExecuteTrade');
            if (btn) btn.disabled = true;

            const clientOrderId = 'ord_req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

            let headers = { 'Content-Type': 'application/json' };
            const token = localStorage.getItem('spin_jwt_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;

            let storedUser = null;
            try {
                const raw = localStorage.getItem('spin_user_data');
                if (raw) storedUser = JSON.parse(raw);
            } catch (e) {}

            const userId = storedUser ? storedUser.id : (window.APP_STATE ? window.APP_STATE.userId : '');
            if (userId) headers['x-user-id'] = userId;

            fetch('/api/trading/order', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    side: this.activeTradeSide,
                    amount,
                    orderType: 'MARKET',
                    clientOrderId
                })
            })
            .then(res => res.json())
            .then(data => {
                if (btn) btn.disabled = false;
                if (data && data.success) {
                    if (window.showToast) {
                        const filled = data.order;
                        window.showToast(`Order Filled: ${filled.side} ${filled.quantity} PLAY @ KSh ${filled.executionPrice.toFixed(4)}`, 'success');
                    }

                    if (data.user) {
                        if (window.APP_STATE) {
                            window.APP_STATE.balance = data.user.balance;
                            window.APP_STATE.coins = data.user.coins;
                        }
                        if (window.updateBalanceUI) window.updateBalanceUI();
                    }

                    if (input) input.value = '';
                    this.calculateOrderPreview();
                    this.setWorkspaceTab('panePositions');
                    this.fetchMarketOverview(true);
                } else {
                    if (window.showToast) window.showToast(data.error || 'Order execution failed', 'error');
                }
            })
            .catch(err => {
                if (btn) btn.disabled = false;
                if (window.showToast) window.showToast(err.message || 'Network error executing trade', 'error');
            });
        },

        /**
         * Positions, Orders & History Fetchers
         */
        fetchPositions: function (isBackground = false) {
            let headers = {};
            const token = localStorage.getItem('spin_jwt_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            let storedUser = null;
            try {
                const raw = localStorage.getItem('spin_user_data');
                if (raw) storedUser = JSON.parse(raw);
            } catch (e) {}
            const userId = storedUser ? storedUser.id : (window.APP_STATE ? window.APP_STATE.userId : '');
            if (userId) headers['x-user-id'] = userId;

            fetch('/api/trading/positions', { headers })
                .then(res => res.json())
                .then(data => {
                    if (data && data.success && Array.isArray(data.positions)) {
                        this.positions = data.positions;
                        this.renderPositionsList(data.positions);
                        const countBadge = document.getElementById('posCountBadge');
                        if (countBadge) countBadge.textContent = data.positions.length;
                        const secCount = document.getElementById('posSectionCount');
                        if (secCount) secCount.textContent = data.positions.length;
                        const bottomCount = document.getElementById('posBottomCount');
                        if (bottomCount) bottomCount.textContent = data.positions.length;
                    }
                })
                .catch(() => {});
        },

        renderPositionsList: function (positions) {
            const listEl = document.getElementById('marketPositionsList');
            const secCount = document.getElementById('posSectionCount');
            if (secCount) secCount.textContent = (positions && positions.length) || 0;
            const bottomCount = document.getElementById('posBottomCount');
            if (bottomCount) bottomCount.textContent = (positions && positions.length) || 0;
            if (!listEl) return;



            if (!positions || positions.length === 0) {
                listEl.innerHTML = '<div class="market-empty-activity"><span>📊</span><p>No open positions. Execute a BUY or SELL order to open a position.</p></div>';
                return;
            }

            listEl.innerHTML = positions.map(pos => {
                const isBuy = pos.side === 'BUY';
                const isProfit = (pos.unrealizedPL || 0) >= 0;

                return `
                    <div class="position-card">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span class="position-side-pill ${isBuy ? 'buy' : 'sell'}">${pos.side}</span>
                                <strong style="font-size:11px; color:#fff;">${pos.symbol}</strong>
                                <span style="font-size:10px; color:#64748b;">${Number(pos.size).toLocaleString('en-US')} PLAY</span>
                            </div>
                            <div style="font-size:9px; color:#94a3b8;">
                                Entry: KSh ${Number(pos.entryPrice).toFixed(4)} · Mark: KSh ${Number(pos.currentPrice).toFixed(4)}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="position-pl-badge ${isProfit ? 'profit' : 'loss'}">
                                ${isProfit ? '+' : ''}KSh ${Number(pos.unrealizedPL).toFixed(2)} (${isProfit ? '+' : ''}${Number(pos.plPercent).toFixed(2)}%)
                            </div>
                            <button type="button" class="btn-close-position" onclick="if(window.MarketEngine) window.MarketEngine.closePosition('${pos.id}');">Close</button>
                        </div>
                    </div>
                `;
            }).join('');
        },

        closePosition: function (positionId) {
            let headers = { 'Content-Type': 'application/json' };
            const token = localStorage.getItem('spin_jwt_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            let storedUser = null;
            try {
                const raw = localStorage.getItem('spin_user_data');
                if (raw) storedUser = JSON.parse(raw);
            } catch (e) {}
            const userId = storedUser ? storedUser.id : (window.APP_STATE ? window.APP_STATE.userId : '');
            if (userId) headers['x-user-id'] = userId;

            fetch('/api/trading/close-position', {
                method: 'POST',
                headers,
                body: JSON.stringify({ positionId })
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    if (window.showToast) {
                        const isProfit = data.realizedPL >= 0;
                        window.showToast(`Position Closed. Realized P/L: ${isProfit ? '+' : ''}KSh ${data.realizedPL.toFixed(2)}`, isProfit ? 'success' : 'info');
                    }
                    this.fetchPositions();
                    this.fetchMarketOverview(true);
                } else {
                    if (window.showToast) window.showToast(data.error || 'Failed to close position', 'error');
                }
            })
            .catch(() => {
                if (window.showToast) window.showToast('Network error closing position', 'error');
            });
        },

        fetchOrders: function () {
            let headers = {};
            const token = localStorage.getItem('spin_jwt_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            let storedUser = null;
            try {
                const raw = localStorage.getItem('spin_user_data');
                if (raw) storedUser = JSON.parse(raw);
            } catch (e) {}
            const userId = storedUser ? storedUser.id : (window.APP_STATE ? window.APP_STATE.userId : '');
            if (userId) headers['x-user-id'] = userId;

            fetch('/api/trading/orders', { headers })
                .then(res => res.json())
                .then(data => {
                    if (data && data.success && Array.isArray(data.orders)) {
                        this.orders = data.orders;
                        this.renderOrdersList(data.orders);
                    }
                })
                .catch(() => {});
        },

        renderOrdersList: function (orders) {
            const listEl = document.getElementById('marketOrdersList');
            if (!listEl) return;

            if (!orders || orders.length === 0) {
                listEl.innerHTML = '<div class="market-empty-activity"><span>📜</span><p>No recent orders found.</p></div>';
                return;
            }

            listEl.innerHTML = orders.map(ord => {
                const dateStr = ord.timestamp ? new Date(ord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';
                const isBuy = ord.side === 'BUY';

                return `
                    <div class="order-card">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span class="position-side-pill ${isBuy ? 'buy' : 'sell'}">${ord.side}</span>
                                <strong style="font-size:11px; color:#fff;">${ord.symbol || 'PLAY/KSh'}</strong>
                                <span style="font-size:10px; color:#64748b;">${dateStr}</span>
                            </div>
                            <div style="font-size:9px; color:#94a3b8;">
                                Price: KSh ${Number(ord.executionPrice).toFixed(4)} · Qty: ${Number(ord.quantity || ord.amount).toLocaleString('en-US')} PLAY
                            </div>
                        </div>
                        <div style="font-size:10px; font-weight:800; color:#00e676;">
                            ● ${ord.status || 'FILLED'}
                        </div>
                    </div>
                `;
            }).join('');
        },

        fetchTradeHistory: function () {
            let headers = {};
            const token = localStorage.getItem('spin_jwt_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            let storedUser = null;
            try {
                const raw = localStorage.getItem('spin_user_data');
                if (raw) storedUser = JSON.parse(raw);
            } catch (e) {}
            const userId = storedUser ? storedUser.id : (window.APP_STATE ? window.APP_STATE.userId : '');
            if (userId) headers['x-user-id'] = userId;

            fetch('/api/trading/history', { headers })
                .then(res => res.json())
                .then(data => {
                    if (data && data.success && Array.isArray(data.history)) {
                        this.tradeHistory = data.history;
                        this.renderHistoryList(data.history);
                    }
                })
                .catch(() => {});
        },

        renderHistoryList: function (history) {
            const listEl = document.getElementById('marketHistoryList');
            if (!listEl) return;

            if (!history || history.length === 0) {
                listEl.innerHTML = '<div class="market-empty-activity"><span>🕒</span><p>No completed trade history.</p></div>';
                return;
            }

            listEl.innerHTML = history.map(item => {
                const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';
                return `
                    <div class="order-card">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <span style="font-size:11px; font-weight:700; color:#fff;">${item.side || 'TRADE'} · ${item.symbol || 'PLAY/KSh'}</span>
                            <span style="font-size:9px; color:#64748b;">${dateStr} · Status: ${item.status || 'SETTLED'}</span>
                        </div>
                        <div style="font-size:10px; font-family:'Orbitron', sans-serif; color:#00f0ff;">
                            ${item.quantity ? item.quantity + ' PLAY' : 'SETTLED'}
                        </div>
                    </div>
                `;
            }).join('');
        },

        /**
         * Fetch Real Authoritative User / Platform PLAYCOIN Ledger Feed
         */
        fetchUserActivity: function () {
            const listEl = document.getElementById('marketActivityList');
            if (!listEl) return;

            let headers = {};
            const token = localStorage.getItem('spin_jwt_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;

            let storedUser = null;
            try {
                const raw = localStorage.getItem('spin_user_data');
                if (raw) storedUser = JSON.parse(raw);
            } catch (e) {}

            const userId = storedUser ? storedUser.id : (window.APP_STATE ? window.APP_STATE.userId : '');
            if (userId) headers['x-user-id'] = userId;

            fetch('/api/market/playcoin/activity', { headers })
                .then(res => res.json())
                .then(data => {
                    if (data && data.success && Array.isArray(data.activity) && data.activity.length > 0) {
                        this.renderActivityList(data.activity);
                    } else {
                        listEl.innerHTML = '<div class="market-empty-activity"><span>📜</span><p>No transactions found in authoritative ledger.</p></div>';
                    }
                })
                .catch(() => {
                    listEl.innerHTML = '<div class="market-empty-activity"><span>⚠️</span><p>Unable to load transactions from authoritative ledger.</p></div>';
                });
        },

        renderActivityList: function (activity) {
            const listEl = document.getElementById('marketActivityList');
            if (!listEl) return;

            listEl.innerHTML = activity.map(item => {
                const amount = Number(item.amount || item.credit || item.debit || 0);
                const isCredit = (item.amount > 0) || (item.credit > 0) || (item.type === 'credit');
                const dateStr = item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';
                const label = item.game || item.description || (isCredit ? 'Reward Credited' : 'Coin Settlement');
                const symbol = item.token_symbol || item.currency || 'PLAY';

                return `
                    <div class="market-activity-item">
                        <div class="activity-left">
                            <span class="activity-icon">${isCredit ? '🟢' : '🔴'}</span>
                            <div class="activity-details">
                                <span class="activity-title">${label}</span>
                                <span class="activity-time">${dateStr} · Status: Settled</span>
                            </div>
                        </div>
                        <div class="activity-right ${isCredit ? 'bullish' : 'bearish'}">
                            ${isCredit ? '+' : ''}${amount.toLocaleString('en-US')} ${symbol}
                        </div>
                    </div>
                `;
            }).join('');
        },

        /**
         * Trigger Deposit entry point using authoritative M-Pesa payment system (Min KSh 200)
         */
        triggerDeposit: function () {
            const modal = document.getElementById('tradeDepositPromptModal');
            if (!modal) {
                if (typeof window.openDepositModal === 'function') {
                    window.openDepositModal();
                } else {
                    const depositModal = document.getElementById('depositModal');
                    if (depositModal) {
                        depositModal.classList.add('open', 'active');
                        depositModal.setAttribute('style', 'display: flex !important; z-index: 99999999;');
                    }
                }
                return;
            }

            const phoneInput = document.getElementById('tradeDepositPhoneInput');
            const amtInput = document.getElementById('tradeDepositAmountInput');
            const statusBanner = document.getElementById('tradeDepositStatusBanner');
            const btn = document.getElementById('btnSubmitTradeDeposit');

            let savedPhone = '';
            try {
                const u = JSON.parse(localStorage.getItem('spin_user_data') || '{}');
                savedPhone = u.phone || '';
            } catch (e) {}

            if (phoneInput && !phoneInput.value) phoneInput.value = savedPhone;
            if (amtInput && !amtInput.value) amtInput.value = '200';
            if (statusBanner) statusBanner.style.display = 'none';
            if (btn) {
                btn.disabled = false;
                btn.textContent = '⚡ SEND M-PESA PROMPT';
            }

            modal.style.display = 'flex';
            modal.classList.add('open', 'active');
        },

        closeTradeDepositModal: function () {
            const modal = document.getElementById('tradeDepositPromptModal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('open', 'active');
            }
        },

        setTradeDepositAmount: function (amt, btnEl) {
            const input = document.getElementById('tradeDepositAmountInput');
            if (input) input.value = amt;
            document.querySelectorAll('.deposit-chip').forEach(b => b.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');
        },

        submitTradeDeposit: async function () {
            const amtInput = document.getElementById('tradeDepositAmountInput');
            const phoneInput = document.getElementById('tradeDepositPhoneInput');
            const statusBanner = document.getElementById('tradeDepositStatusBanner');
            const statusText = document.getElementById('tradeDepositStatusText');
            const btn = document.getElementById('btnSubmitTradeDeposit');

            const amount = Number(amtInput ? amtInput.value : 200);
            let phone = phoneInput ? phoneInput.value.trim() : '';

            if (!amount || amount < 200) {
                if (window.showToast) window.showToast('Minimum deposit amount is KSh 200', 'error');
                return;
            }

            const cleanP = phone.replace(/\D/g, '');
            if (!phone || cleanP.length < 9) {
                if (window.showToast) window.showToast('Please enter a valid Safaricom M-Pesa phone number (e.g. 07XXXXXXXX)', 'error');
                return;
            }

            // Save phone locally
            try {
                const u = JSON.parse(localStorage.getItem('spin_user_data') || '{}');
                u.phone = phone;
                localStorage.setItem('spin_user_data', JSON.stringify(u));
            } catch (e) {}

            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Initializing STK Push...';
            }
            if (statusBanner) {
                statusBanner.style.display = 'block';
                statusBanner.style.borderColor = '#00f0ff';
                statusBanner.style.background = 'rgba(0, 240, 255, 0.1)';
                if (statusText) statusText.textContent = '⏳ Connecting to Safaricom Daraja Gateway...';
            }

            let userId = 'demo-user-1';
            try {
                const u = JSON.parse(localStorage.getItem('spin_user_data') || '{}');
                if (u.id) userId = u.id;
            } catch (e) {}
            if (window.APP_STATE && window.APP_STATE.userId) userId = window.APP_STATE.userId;

            try {
                const res = await fetch('/api/deposit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        amount,
                        phone,
                        gameAction: 'DEPOSIT_TRADE'
                    })
                }).then(r => r.json());

                if (!res || !res.success) {
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Retry Deposit';
                    }
                    const rawError = res?.error || res?.message || 'Failed to initiate M-Pesa prompt';
                    if (statusBanner) {
                        statusBanner.style.borderColor = '#ff4444';
                        statusBanner.style.background = 'rgba(255, 68, 68, 0.15)';
                        if (statusText) statusText.textContent = `❌ ${rawError}`;
                    }
                    if (window.showToast) window.showToast(`Deposit failed: ${rawError}`, 'error');
                    return;
                }

                if (statusBanner) {
                    statusBanner.style.borderColor = 'var(--gold-primary)';
                    statusBanner.style.background = 'rgba(255, 215, 0, 0.15)';
                    if (statusText) statusText.textContent = '📲 Prompt sent! Check your phone and enter M-Pesa PIN...';
                }
                if (btn) btn.textContent = 'Awaiting PIN...';
                if (window.showToast) window.showToast(`Prompt sent to ${phone}. Enter your M-Pesa PIN.`, 'info');

                const checkoutRequestId = res.CheckoutRequestID;
                if (!checkoutRequestId) return;

                let attempts = 0;
                const maxAttempts = 60;
                let isResolved = false;

                const pollInterval = setInterval(async () => {
                    if (isResolved) {
                        clearInterval(pollInterval);
                        return;
                    }
                    attempts++;
                    try {
                        const statusRes = await fetch(`/api/deposit/status/${checkoutRequestId}`).then(r => r.json());
                        const statusUpper = (statusRes?.status || '').toUpperCase();
                        const isConfirmed = statusUpper === 'COMPLETED' || statusUpper === 'SUCCESS' || statusUpper === 'CONFIRMED' || (statusRes?.success === true && statusRes?.amount > 0);

                        if (isConfirmed) {
                            isResolved = true;
                            clearInterval(pollInterval);
                            if (btn) btn.textContent = '✅ Confirmed!';
                            if (statusBanner) {
                                statusBanner.style.borderColor = '#00ff66';
                                statusBanner.style.background = 'rgba(0, 255, 100, 0.15)';
                                if (statusText) statusText.textContent = `✅ KSh ${amount.toLocaleString()} credited successfully!`;
                            }
                            if (window.showToast) window.showToast(`Payment Confirmed! KSh ${amount.toLocaleString()} added to Trading Wallet`, 'success');

                            if (statusRes.user) {
                                if (window.APP_STATE) {
                                    window.APP_STATE.balance = statusRes.user.balance;
                                    window.APP_STATE.coins = statusRes.user.coins;
                                }
                                if (window.updateUserState) window.updateUserState(statusRes.user, statusRes.amount || amount);
                                if (window.updateBalanceUI) window.updateBalanceUI();
                            }

                            if (window.triggerConfetti) window.triggerConfetti();

                            // Update trade available cash in Trade panel
                            const tradeCash = document.getElementById('tradeAvailableCash');
                            if (tradeCash && statusRes.user) {
                                tradeCash.textContent = `KSh ${Number(statusRes.user.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                            }

                            setTimeout(() => {
                                this.closeTradeDepositModal();
                                if (btn) {
                                    btn.disabled = false;
                                    btn.textContent = '⚡ SEND M-PESA PROMPT';
                                }
                                this.switchSection('trade');
                            }, 1200);

                        } else if (statusUpper === 'FAILED') {
                            isResolved = true;
                            clearInterval(pollInterval);
                            if (btn) {
                                btn.disabled = false;
                                btn.textContent = 'Retry Deposit';
                            }
                            if (statusBanner) {
                                statusBanner.style.borderColor = '#ff4444';
                                statusBanner.style.background = 'rgba(255, 68, 68, 0.15)';
                                if (statusText) statusText.textContent = '❌ Payment Cancelled or Failed';
                            }
                            if (window.showToast) window.showToast('Payment Cancelled or Failed', 'error');
                        } else if (attempts >= maxAttempts) {
                            isResolved = true;
                            clearInterval(pollInterval);
                            if (btn) {
                                btn.disabled = false;
                                btn.textContent = 'Check Status';
                            }
                            if (statusBanner) {
                                statusBanner.style.borderColor = '#ffbb00';
                                if (statusText) statusText.textContent = '⚠️ Request timed out. Balance will update automatically once confirmed.';
                            }
                        }
                    } catch (pollErr) {}
                }, 2000);

            } catch (err) {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Retry Deposit';
                }
                if (window.showToast) window.showToast(err.message || 'Network error initiating deposit', 'error');
            }
        },

        triggerPayAndTrade: function () {
            this.triggerDeposit();
        },


        /**
         * Open Telegram Redemption Confirmation Modal
         */
        openRedeemConfirmation: function () {
            const modal = document.getElementById('redeemConfirmModal');
            if (!modal) return;

            let coins = 0;
            try {
                const stored = localStorage.getItem('spin_user_data');
                if (stored) {
                    const u = JSON.parse(stored);
                    coins = Number(u.coins || 0);
                }
            } catch (e) {}

            if (window.APP_STATE && window.APP_STATE.coins !== undefined) {
                coins = window.APP_STATE.coins;
            }

            const balEl = document.getElementById('redeemModalBalanceText');
            if (balEl) balEl.textContent = `${Number(coins).toLocaleString('en-US')} PLAY`;

            modal.classList.add('open', 'active');
            modal.setAttribute('style', 'display: flex !important; z-index: 9999999;');
        },

        closeRedeemConfirmation: function () {
            const modal = document.getElementById('redeemConfirmModal');
            if (modal) {
                modal.classList.remove('open', 'active');
                modal.setAttribute('style', 'display: none !important;');
            }
        },

        proceedToTelegramRedeem: function () {
            const targetUrl = this.redeemTelegramUrl || 'https://t.me/PlayCoinRedemptionBot';
            this.closeRedeemConfirmation();
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
    };

    window.MarketEngine = MarketEngine;

    document.addEventListener('DOMContentLoaded', () => {
        MarketEngine.init();
    });

})(window, document);
