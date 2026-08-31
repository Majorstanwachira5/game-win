/**
 * market.js — PLAYCOIN Market Dashboard & Interactive Candlestick Engine
 * 
 * Features:
 * - High-DPI Interactive HTML5 Canvas Candlestick Chart
 * - Timeframe switching (1m, 5m, 15m, 1h, 4h, 1d)
 * - Hover crosshairs, live price line, volume histogram, floating OHLC tooltip
 * - Zoom & Pan navigation
 * - Authoritative backend market data consumption
 * - Single authoritative user coin balance display & ledger activity
 * - Configurable Telegram redemption confirmation flow
 * - Strictly zero fake/mock frontend data
 */

(function (window, document) {
    'use strict';

    const MarketEngine = {
        // State
        activeInterval: '1h',
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

            // Start polling (every 8 seconds)
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
            this.stopPolling();
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
                } else {
                    this.stopPolling();
                }
            }, 8000);
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

            const price = Number(data.price || 0);
            const stats = data.stats24h || {};
            const change = Number(stats.change || 0);
            const changePct = Number(stats.changePercent || 0);
            const isPos = change >= 0;

            if (priceEl) priceEl.textContent = `KSh ${price.toFixed(4)}`;
            
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

        /**
         * Fetch Real Authoritative User / Platform PLAYCOIN Activity
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
            } catch(e) {}

            const userId = storedUser ? storedUser.id : (window.APP_STATE ? window.APP_STATE.userId : '');
            if (userId) headers['x-user-id'] = userId;

            fetch('/api/market/playcoin/activity', { headers })
                .then(res => res.json())
                .then(data => {
                    if (data && data.success && Array.isArray(data.activity) && data.activity.length > 0) {
                        this.renderActivityList(data.activity);
                    } else {
                        listEl.innerHTML = `
                            <div class="market-empty-activity">
                                <span>📜</span>
                                <p>No recent PLAYCOIN transactions found.</p>
                            </div>
                        `;
                    }
                })
                .catch(() => {
                    listEl.innerHTML = `
                        <div class="market-empty-activity">
                            <span>⚠️</span>
                            <p>Activity data unavailable</p>
                        </div>
                    `;
                });
        },

        /**
         * Render Activity List
         */
        renderActivityList: function (items) {
            const listEl = document.getElementById('marketActivityList');
            if (!listEl) return;

            listEl.innerHTML = items.map(item => {
                const amount = Number(item.amount || 0);
                const isCredit = amount >= 0;
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
         * Timeframe Selector Handler
         */
        setInterval: function (interval) {
            this.activeInterval = interval;
            this.panOffset = 0;
            this.hoveredIndex = -1;

            // Update UI tab states
            const tabs = document.querySelectorAll('.market-time-tab');
            tabs.forEach(t => {
                if (t.getAttribute('data-interval') === interval) {
                    t.classList.add('active');
                } else {
                    t.classList.remove('active');
                }
            });

            this.fetchCandles(false);
        },

        /**
         * Canvas Resize & High-DPI Adaptation
         */
        resizeCanvas: function () {
            if (!this.canvas) return;
            const container = this.canvas.parentElement;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const width = Math.floor(rect.width);
            const height = Math.max(260, Math.floor(rect.height || 360));

            const dpr = window.devicePixelRatio || 1;
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';

            this.ctx.scale(dpr, dpr);
            this.drawChart();
        },

        _setupResizeObserver: function () {
            if (typeof ResizeObserver !== 'undefined' && this.canvas && this.canvas.parentElement) {
                const ro = new ResizeObserver(() => {
                    this.resizeCanvas();
                });
                ro.observe(this.canvas.parentElement);
            }
        },

        /**
         * Candlestick Chart Renderer
         */
        drawChart: function () {
            if (!this.canvas || !this.ctx || this.candles.length === 0) return;

            const width = parseFloat(this.canvas.style.width) || 600;
            const height = parseFloat(this.canvas.style.height) || 360;
            const ctx = this.ctx;

            ctx.clearRect(0, 0, width, height);

            // Chart Layout Margins
            const paddingRight = 65; // Price Axis
            const paddingBottom = 30; // Time Axis
            const paddingTop = 20;
            const paddingLeft = 10;

            const plotWidth = width - paddingLeft - paddingRight;
            const plotHeight = height - paddingTop - paddingBottom;
            const volumeHeight = plotHeight * 0.22;
            const candlePlotHeight = plotHeight - volumeHeight;

            // Visible Slice calculation based on pan & zoom
            const total = this.candles.length;
            const count = Math.min(Math.max(15, this.visibleCandlesCount), total);
            
            let endIndex = total - this.panOffset;
            endIndex = Math.min(total, Math.max(count, endIndex));
            let startIndex = Math.max(0, endIndex - count);

            const visibleSlice = this.candles.slice(startIndex, endIndex);
            if (visibleSlice.length === 0) return;

            // Find High / Low for scaling
            let minPrice = Infinity;
            let maxPrice = -Infinity;
            let maxVolume = 0;

            visibleSlice.forEach(c => {
                if (c.high > maxPrice) maxPrice = c.high;
                if (c.low < minPrice) minPrice = c.low;
                if (c.volume > maxVolume) maxVolume = c.volume;
            });

            // Prevent flat line zero range
            if (minPrice === maxPrice) {
                minPrice *= 0.95;
                maxPrice *= 1.05;
            }
            const pricePadding = (maxPrice - minPrice) * 0.08;
            minPrice -= pricePadding;
            maxPrice += pricePadding;
            const priceRange = maxPrice - minPrice;

            // Helper mapping coordinates
            const getY = (val) => paddingTop + candlePlotHeight - ((val - minPrice) / priceRange) * candlePlotHeight;
            const getVolY = (vol) => paddingTop + plotHeight - (maxVolume > 0 ? (vol / maxVolume) * volumeHeight : 0);

            // Update Live HUD Readout
            const hudCandle = (this.hoveredIndex >= 0 && visibleSlice[this.hoveredIndex]) ? visibleSlice[this.hoveredIndex] : visibleSlice[visibleSlice.length - 1];
            if (hudCandle) {
                const hO = document.getElementById('hudOpen');
                const hH = document.getElementById('hudHigh');
                const hL = document.getElementById('hudLow');
                const hC = document.getElementById('hudClose');
                const hV = document.getElementById('hudVol');
                if (hO) hO.textContent = hudCandle.open.toFixed(4);
                if (hH) hH.textContent = hudCandle.high.toFixed(4);
                if (hL) hL.textContent = hudCandle.low.toFixed(4);
                if (hC) {
                    hC.textContent = hudCandle.close.toFixed(4);
                    hC.style.color = hudCandle.close >= hudCandle.open ? '#00e676' : '#ff1744';
                }
                if (hV) hV.textContent = Number(hudCandle.volume || 0).toLocaleString('en-US');
            }

            const candleStep = plotWidth / visibleSlice.length;
            const candleWidth = Math.max(2, candleStep * 0.68);

            // 1. Draw Grid Lines & Price Axis
            ctx.save();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            ctx.font = '10px Sora, sans-serif';
            ctx.fillStyle = 'rgba(160, 175, 200, 0.7)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';


            const gridSteps = 5;
            for (let i = 0; i <= gridSteps; i++) {
                const p = minPrice + (priceRange * (i / gridSteps));
                const y = getY(p);

                // Horizontal line
                ctx.beginPath();
                ctx.moveTo(paddingLeft, y);
                ctx.lineTo(paddingLeft + plotWidth, y);
                ctx.stroke();

                // Price label
                ctx.fillText(`KSh ${p.toFixed(4)}`, paddingLeft + plotWidth + 6, y);
            }
            ctx.restore();

            // 2. Draw Volume & Candlesticks
            visibleSlice.forEach((c, idx) => {
                const x = paddingLeft + (idx * candleStep) + (candleStep / 2);
                const isBull = c.close >= c.open;
                const candleColor = isBull ? '#00e676' : '#ff1744';
                const bodyTop = getY(Math.max(c.open, c.close));
                const bodyBottom = getY(Math.min(c.open, c.close));
                const bodyHeight = Math.max(1, bodyBottom - bodyTop);

                // Volume Bar
                const volTop = getVolY(c.volume || 0);
                const volHeight = (paddingTop + plotHeight) - volTop;
                ctx.fillStyle = isBull ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.2)';
                ctx.fillRect(x - (candleWidth / 2), volTop, candleWidth, volHeight);

                // Candlestick Wick (High to Low)
                ctx.beginPath();
                ctx.strokeStyle = candleColor;
                ctx.lineWidth = 1.2;
                ctx.moveTo(x, getY(c.high));
                ctx.lineTo(x, getY(c.low));
                ctx.stroke();

                // Candlestick Body
                ctx.fillStyle = candleColor;
                ctx.fillRect(x - (candleWidth / 2), bodyTop, candleWidth, bodyHeight);
            });

            // 3. Draw Time Axis Labels
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
                let timeStr = '';

                if (this.activeInterval === '1d') {
                    timeStr = `${d.getMonth() + 1}/${d.getDate()}`;
                } else {
                    timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }

                ctx.fillText(timeStr, x, paddingTop + plotHeight + 8);
            }
            ctx.restore();

            // 4. Latest Price Dashed Guideline
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

                // Latest price pill badge
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

            // 5. Interactive Crosshair & Tooltip
            if (this.hoverPos && this.hoveredIndex >= 0 && this.hoveredIndex < visibleSlice.length) {
                const hoveredCandle = visibleSlice[this.hoveredIndex];
                const hoverX = paddingLeft + (this.hoveredIndex * candleStep) + (candleStep / 2);
                const hoverY = this.hoverPos.y;

                ctx.save();
                // Vertical crosshair line
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(hoverX, paddingTop);
                ctx.lineTo(hoverX, paddingTop + plotHeight);
                ctx.stroke();

                // Horizontal crosshair line
                ctx.beginPath();
                ctx.moveTo(paddingLeft, hoverY);
                ctx.lineTo(paddingLeft + plotWidth, hoverY);
                ctx.stroke();
                ctx.restore();

                this.renderFloatingTooltip(hoveredCandle, hoverX, hoverY, width, height);
            } else {
                this.hideFloatingTooltip();
            }
        },

        /**
         * Floating OHLC Tooltip
         */
        renderFloatingTooltip: function (candle, x, y, canvasW) {
            let tooltip = document.getElementById('marketChartTooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'marketChartTooltip';
                tooltip.className = 'market-chart-tooltip';
                if (this.canvas && this.canvas.parentElement) {
                    this.canvas.parentElement.appendChild(tooltip);
                }
            }

            const isBull = candle.close >= candle.open;
            const diff = candle.close - candle.open;
            const diffPct = candle.open > 0 ? (diff / candle.open) * 100 : 0;
            const timeStr = new Date(candle.timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            tooltip.innerHTML = `
                <div class="tt-header">${timeStr} · <strong>${this.activeInterval}</strong></div>
                <div class="tt-grid">
                    <div><span>O:</span> <strong>KSh ${candle.open.toFixed(4)}</strong></div>
                    <div><span>H:</span> <strong>KSh ${candle.high.toFixed(4)}</strong></div>
                    <div><span>L:</span> <strong>KSh ${candle.low.toFixed(4)}</strong></div>
                    <div><span>C:</span> <strong style="color:${isBull ? '#00e676' : '#ff1744'}">KSh ${candle.close.toFixed(4)}</strong></div>
                </div>
                <div class="tt-footer">
                    <span>Vol: <strong>${candle.volume ? candle.volume.toLocaleString('en-US') : 0} PLAY</strong></span>
                    <span style="color:${isBull ? '#00e676' : '#ff1744'}">${isBull ? '+' : ''}${diffPct.toFixed(2)}%</span>
                </div>
            `;

            tooltip.style.display = 'block';

            // Positioning within container
            const tooltipW = 190;
            let leftPos = x + 15;
            if (leftPos + tooltipW > canvasW) {
                leftPos = x - tooltipW - 15;
            }

            tooltip.style.left = `${Math.max(10, leftPos)}px`;
            tooltip.style.top = `${Math.max(10, Math.min(y - 30, 200))}px`;
        },

        hideFloatingTooltip: function () {
            const tooltip = document.getElementById('marketChartTooltip');
            if (tooltip) tooltip.style.display = 'none';
        },

        renderChartState: function (type) {
            let stateEl = document.getElementById('marketChartStateOverlay');
            if (!stateEl && this.canvas && this.canvas.parentElement) {
                stateEl = document.createElement('div');
                stateEl.id = 'marketChartStateOverlay';
                stateEl.className = 'market-chart-state-overlay';
                this.canvas.parentElement.appendChild(stateEl);
            }
            if (!stateEl) return;

            stateEl.style.display = 'flex';
            if (type === 'loading') {
                stateEl.innerHTML = `<div class="market-spinner"></div><span>Loading PLAYCOIN Candlestick Data...</span>`;
            } else if (type === 'empty') {
                stateEl.innerHTML = `<span>📊 Data unavailable for this timeframe.</span>`;
            } else if (type === 'error') {
                stateEl.innerHTML = `<span>⚠️ Unable to load market data.</span><button onclick="window.MarketEngine.fetchCandles(false)">Retry</button>`;
            }
        },

        hideChartState: function () {
            const stateEl = document.getElementById('marketChartStateOverlay');
            if (stateEl) stateEl.style.display = 'none';
        },

        /**
         * Canvas Interactive Listeners (Crosshairs, Pan, Zoom)
         */
        _bindCanvasEvents: function () {
            if (!this.canvas) return;

            // Mouse Move (Crosshair & Tooltip)
            this.canvas.addEventListener('mousemove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                this.hoverPos = { x, y };

                const paddingLeft = 10;
                const paddingRight = 65;
                const plotWidth = rect.width - paddingLeft - paddingRight;

                const total = this.candles.length;
                const count = Math.min(Math.max(15, this.visibleCandlesCount), total);
                let endIndex = total - this.panOffset;
                endIndex = Math.min(total, Math.max(count, endIndex));
                let startIndex = Math.max(0, endIndex - count);
                const visibleCount = endIndex - startIndex;

                if (x >= paddingLeft && x <= paddingLeft + plotWidth && visibleCount > 0) {
                    const step = plotWidth / visibleCount;
                    const idx = Math.floor((x - paddingLeft) / step);
                    this.hoveredIndex = Math.min(visibleCount - 1, Math.max(0, idx));
                } else {
                    this.hoveredIndex = -1;
                }

                if (this.isDragging) {
                    const dx = e.clientX - this.dragStartX;
                    const candleStep = plotWidth / count;
                    const shift = Math.round(dx / candleStep);
                    this.panOffset = Math.max(0, Math.min(total - count, this.dragStartOffset + shift));
                }

                this.drawChart();
            });

            this.canvas.addEventListener('mouseleave', () => {
                this.hoverPos = null;
                this.hoveredIndex = -1;
                this.isDragging = false;
                this.drawChart();
            });

            // Drag to Pan
            this.canvas.addEventListener('mousedown', (e) => {
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
                    this.drawChart();
                }
            }, { passive: true });

            this.canvas.addEventListener('touchend', () => {
                this.isDragging = false;
            });
        },

        /**
         * Bind UI Controls
         */
        _bindUIEvents: function () {
            // Timeframe tabs
            document.querySelectorAll('.market-time-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const interval = e.currentTarget.getAttribute('data-interval');
                    if (interval) this.setInterval(interval);
                });
            });

            // Redeem Buttons
            document.querySelectorAll('.trigger-redeem-playcoin').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openRedeemConfirmation();
                });
            });

            // Pay & Trade Buttons
            document.querySelectorAll('.trigger-pay-and-trade').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.triggerPayAndTrade();
                });
            });
        },

        /**
         * Trigger Pay & Trade entry point using the existing authoritative M-Pesa payment system
         */
        triggerPayAndTrade: function () {
            if (window.showToast) {
                window.showToast('Opening secure M-Pesa STK Deposit terminal...', 'info');
            }
            if (typeof window.openDepositModal === 'function') {
                window.openDepositModal();
            } else {
                const depositModal = document.getElementById('depositModal');
                if (depositModal) {
                    depositModal.classList.add('open', 'active');
                    depositModal.setAttribute('style', 'display: flex !important; z-index: 99999999;');
                }
            }
        },


        /**
         * Open Telegram Redemption Confirmation Modal
         */
        openRedeemConfirmation: function () {
            const modal = document.getElementById('redeemConfirmModal');
            if (!modal) return;

            // Obtain authoritative balance
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

        /**
         * Close Redeem Modal
         */
        closeRedeemConfirmation: function () {
            const modal = document.getElementById('redeemConfirmModal');
            if (modal) {
                modal.classList.remove('open', 'active');
                modal.setAttribute('style', 'display: none !important;');
            }
        },

        /**
         * Execute Redirect to Telegram Destination safely
         */
        proceedToTelegramRedemption: function () {
            const targetUrl = this.redeemTelegramUrl || 'https://t.me/PlayCoinRedemptionBot';
            
            // Show feedback toast
            if (window.showToast) {
                window.showToast('Opening official Telegram Coin Redemption Desk...', 'info');
            }

            // Close confirmation modal
            this.closeRedeemConfirmation();

            // Open Telegram destination
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
    };

    // Expose Globally
    window.MarketEngine = MarketEngine;

    // Auto-init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            MarketEngine.init();
        });
    } else {
        MarketEngine.init();
    }

})(window, document);
