/**
 * market.js — Authoritative PLAYCOIN Professional Binary & Prediction Options Terminal Engine
 * 
 * Features:
 * - Real-Time Multi-Asset Feeds (BTC/USD, ETH/USD, SOL/USD, PLAY/KES)
 * - High-DPI HTML5 Canvas Chart with Pan, Zoom & Drawing Tools
 * - Interactive On-Chart Trade Entry Markers, Target Price Lines & Expiry Badges
 * - Timeframe Expiry Intervals (30s, 1m, 2m, 5m, 10m, 15m, 30m, 1h)
 * - Dual Direction Prediction Actions (CALL / UP vs PUT / DOWN) with 85% Profit Return
 * - Touch-Friendly Wager Steppers & Quick Chips
 * - Order Confirmation Ticket Bottom Sheet Modal
 * - Live Active Predictions Manager with Dynamic Floating P/L & Early Close Action
 * - Complete Settled Prediction History & Lifetime/Daily Performance Analytics
 * - Real-Time Order Book Depth Visualizer
 * - Authoritative Server-Side Wallet & Direct M-Pesa Deposit / Withdrawal Integration
 */

(function (window, document) {
    'use strict';

    const MarketEngine = {
        // Multi-Asset State
        activePair: 'BTC/USD',
        activeInterval: '30s',
        activeChartType: 'candles',
        activeIndicators: { ma: true, ema: false, boll: false, rsi: false, vol: true },
        activeDrawingTool: 'crosshair',
        drawings: [],
        tempDrawing: null,
        isFullscreenChart: false,

        // Binary Trading State
        activeTimeframe: '30s',
        activeWager: 1000,
        selectedDirection: 'CALL',
        activeWorkspaceTab: 'panePositions',
        activePredictions: [],
        tradeHistory: [],
        performanceStats: null,
        orderBook: { bids: [], asks: [] },

        // Chart & Data Buffers
        candles: [],
        marketOverview: null,
        allPairs: {},
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
        redeemTelegramUrl: 'https://t.me/playcoinapp_bot',

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
            this._setupSocketListeners();
            this.calculateOrderPreview();
            this.fetchMarketConfig();
        },

        _bindUIEvents: function () {
            document.addEventListener('click', (e) => {
                const depositBtn = e.target.closest('.trigger-trading-deposit, .btn-micro-deposit, .btn-quick-deposit, [data-action="deposit"], .action-deposit');
                if (depositBtn) {
                    e.preventDefault();
                    this.triggerDeposit();
                }
            });
        },

        _setupSocketListeners: function () {
            if (window.io && typeof window.io === 'function') {
                try {
                    const socket = window.io();
                    socket.on('binary:tick', (summary) => {
                        if (summary) {
                            this.allPairs = summary;
                            if (summary[this.activePair]) {
                                this.renderMarketOverview(summary[this.activePair]);
                            }
                        }
                    });
                    socket.on('binary:settled', (trade) => {
                        let storedUser = null;
                        try {
                            const raw = localStorage.getItem('spin_user_data');
                            if (raw) storedUser = JSON.parse(raw);
                        } catch (e) {}
                        const myUserId = storedUser ? storedUser.id : (window.APP_STATE ? window.APP_STATE.userId : '');
                        
                        if (trade && trade.userId === myUserId) {
                            if (window.showToast) {
                                const isWin = trade.result === 'WON' || trade.result === 'WON_EARLY';
                                const toastType = isWin ? 'success' : (trade.result === 'TIE' ? 'info' : 'error');
                                const msg = isWin 
                                    ? `🎉 Prediction WON! +${Number(trade.payout || 0).toLocaleString()} PLAY credited to your balance!`
                                    : (trade.result === 'TIE' ? `⚖️ Prediction Tied: ${trade.amount} PLAY refunded.` : `Prediction Expired: ${trade.pair} ${trade.direction}`);
                                window.showToast(msg, toastType);
                            }
                            this.fetchActivePredictions();
                            this.fetchTradeHistory();
                            this.fetchPerformanceStats();
                            this.fetchMarketOverview(true);
                        }
                    });
                } catch (e) {}
            }
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

            // Start polling (every 1.5 seconds)
            this.startPolling();
        },

        /**
         * Close the Market Dashboard Modal
         */
        closeMarket: function () {
            const modal = document.getElementById('modal-market');
            if (modal) {
                modal.classList.remove('open', 'active');
                modal.setAttribute('style', 'display: none !important;');
            }
            this.stopPolling();
            if (this.isFullscreenChart) this.toggleFullscreenChart(false);
        },

        /**
         * Start active polling loop
         */
        startPolling: function () {
            this.stopPolling();
            this.pollTimer = setInterval(() => {
                this.fetchMarketOverview(true);
                this.fetchCandles(true);
                this.fetchActivePredictions(true);
                this.fetchOrderBook(true);
            }, 1500);
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
            this.fetchActivePredictions(false);
            this.fetchTradeHistory();
            this.fetchPerformanceStats();
            this.fetchOrderBook();
        },

        /**
         * Set Active Trading Pair
         */
        setAssetPair: function (pair) {
            if (!pair) return;
            this.activePair = pair;
            const selectEl = document.getElementById('terminalAssetPairSelect');
            if (selectEl && selectEl.value !== pair) selectEl.value = pair;

            this.candles = [];
            this.fetchMarketOverview(false);
            this.fetchCandles(false);
            this.fetchOrderBook();
            this.calculateOrderPreview();
        },

        /**
         * Set Active Expiry Timeframe for Predictions
         */
        setTimeframe: function (tf, btnEl) {
            if (!tf) return;
            this.activeTimeframe = tf;
            document.querySelectorAll('#binaryIntervalTabs .interval-chip').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-interval') === tf);
            });
            if (btnEl) btnEl.classList.add('active');

            const countdownInd = document.getElementById('binaryCountdownIndicator');
            if (countdownInd) countdownInd.textContent = `⏱️ ${tf.toUpperCase()} READY`;

            this.calculateOrderPreview();
        },

        /**
         * Set Active Candlestick Chart Interval
         */
        setChartInterval: function (interval, btnEl) {
            if (!interval) return;
            this.activeInterval = interval;
            document.querySelectorAll('#chartIntervalTabs .market-time-tab').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-interval') === interval);
            });
            if (btnEl) btnEl.classList.add('active');
            this.fetchCandles(false);
        },


        /**
         * Set Wager Amount
         */
        setWagerAmount: function (amt, btnEl) {
            const input = document.getElementById('tradeOrderAmount');
            if (input) input.value = amt;
            document.querySelectorAll('.trade-quick-chips.binary-chips .quick-chip').forEach(b => b.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');
            this.calculateOrderPreview();
        },

        /**
         * Step Wager Amount (+ / -)
         */
        stepTradeAmount: function (delta) {
            const input = document.getElementById('tradeOrderAmount');
            if (!input) return;
            let current = parseFloat(input.value) || 1000;
            current = Math.max(100, Math.min(50000, current + delta));
            input.value = current;
            this.calculateOrderPreview();
        },

        /**
         * Calculate Potential Payout and Return Preview
         */
        calculateOrderPreview: function () {
            const input = document.getElementById('tradeOrderAmount');
            const previewPayout = document.getElementById('tradePreviewPayout');
            const previewTotalReturn = document.getElementById('tradePreviewTotalReturn');
            if (!input) return;

            const wager = parseFloat(input.value) || 1000;
            const potentialProfit = wager * 0.85;
            const totalReturn = wager * 1.85;

            if (previewPayout) previewPayout.textContent = `+${potentialProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLAY`;
            if (previewTotalReturn) previewTotalReturn.textContent = `${totalReturn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLAY`;
        },

        /**
         * Prompt Binary Order Ticket Bottom Sheet
         */
        promptPredictionOrder: function (direction) {
            this.selectedDirection = direction;
            const input = document.getElementById('tradeOrderAmount');
            const wager = parseFloat(input ? input.value : 1000) || 1000;

            if (wager < 100) {
                if (window.showToast) window.showToast('Minimum prediction wager is 100 PLAY.', 'error');
                return;
            }
            if (wager > 50000) {
                if (window.showToast) window.showToast('Maximum prediction wager is 50,000 PLAY.', 'error');
                return;
            }

            const currentPrice = this.marketOverview ? Number(this.marketOverview.price || 0) : 0;
            const decimals = this.marketOverview ? (this.marketOverview.decimals || 2) : 2;
            const prefix = this.activePair === 'PLAY/KES' ? 'KSh ' : '$';

            const modal = document.getElementById('binaryOrderTicketModal');
            if (!modal) return;

            const assetEl = document.getElementById('ticketAssetPair');
            const dirEl = document.getElementById('ticketDirection');
            const wagerEl = document.getElementById('ticketWagerAmount');
            const tfEl = document.getElementById('ticketTimeframe');
            const priceEl = document.getElementById('ticketEntryPrice');
            const profitEl = document.getElementById('ticketPotentialProfit');
            const totalEl = document.getElementById('ticketTotalPayout');
            const confirmBtn = document.getElementById('btnConfirmPredictionWager');

            if (assetEl) assetEl.textContent = this.activePair;
            if (dirEl) {
                dirEl.textContent = direction === 'CALL' ? '▲ CALL (UP)' : '▼ PUT (DOWN)';
                dirEl.style.color = direction === 'CALL' ? '#00e676' : '#ff1744';
            }
            if (wagerEl) wagerEl.textContent = `${wager.toLocaleString('en-US', { minimumFractionDigits: 2 })} PLAY`;
            if (tfEl) tfEl.textContent = `${this.activeTimeframe.toUpperCase()} EXPIRY`;
            if (priceEl) priceEl.textContent = `${prefix}${currentPrice.toFixed(decimals)}`;
            if (profitEl) profitEl.textContent = `+${(wager * 0.85).toLocaleString('en-US', { minimumFractionDigits: 2 })} PLAY (+85%)`;
            if (totalEl) totalEl.textContent = `${(wager * 1.85).toLocaleString('en-US', { minimumFractionDigits: 2 })} PLAY`;

            if (confirmBtn) {
                confirmBtn.style.background = direction === 'CALL' 
                    ? 'linear-gradient(135deg, #00e676 0%, #00b0ff 100%)' 
                    : 'linear-gradient(135deg, #ff1744 0%, #ff5252 100%)';
                confirmBtn.style.boxShadow = direction === 'CALL'
                    ? '0 0 20px rgba(0,230,118,0.4)'
                    : '0 0 20px rgba(255,23,68,0.4)';
                confirmBtn.textContent = direction === 'CALL' ? '▲ CONFIRM CALL (UP)' : '▼ CONFIRM PUT (DOWN)';
            }

            modal.style.display = 'flex';
            modal.classList.add('open', 'active');
        },

        /**
         * Close Binary Order Ticket
         */
        closeOrderTicket: function () {
            const modal = document.getElementById('binaryOrderTicketModal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('open', 'active');
            }
        },

        /**
         * Execute Confirmed Binary Prediction Wager
         */
        executePredictionWager: function () {
            const input = document.getElementById('tradeOrderAmount');
            const amount = parseFloat(input ? input.value : 1000) || 1000;
            const btn = document.getElementById('btnConfirmPredictionWager');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'PLACING PREDICTION...';
            }

            const idempotencyKey = 'bin_wager_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

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

            fetch('/api/trade/binary/place', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    pair: this.activePair,
                    direction: this.selectedDirection,
                    amount,
                    timeframe: this.activeTimeframe,
                    idempotencyKey
                })
            })
            .then(res => res.json())
            .then(data => {
                if (btn) btn.disabled = false;
                if (data && data.success) {
                    this.closeOrderTicket();
                    if (window.showToast) {
                        window.showToast(`⚡ Prediction Placed: ${data.trade.direction} on ${data.trade.pair} for ${data.trade.amount} PLAY!`, 'success');
                    }

                    if (data.user) {
                        if (window.APP_STATE) {
                            window.APP_STATE.balance = data.user.balance;
                            window.APP_STATE.coins = data.user.coins;
                        }
                        if (window.updateBalanceUI) window.updateBalanceUI();
                    }

                    this.setWorkspaceTab('panePositions');
                    this.fetchActivePredictions();
                    this.fetchMarketOverview(true);
                } else {
                    if (btn) btn.textContent = 'RETRY WAGER';
                    if (window.showToast) window.showToast(data.error || 'Prediction placement failed.', 'error');
                }
            })
            .catch(err => {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'RETRY WAGER';
                }
                if (window.showToast) window.showToast(err.message || 'Network error placing prediction.', 'error');
            });
        },

        /**
         * Fetch 24H Overview Stats & Prices for Active Pair
         */
        fetchMarketOverview: function (isBackground = false) {
            fetch(`/api/market/realtime/${encodeURIComponent(this.activePair)}`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.success) {
                        this.marketOverview = data;
                        this.renderMarketOverview(data);
                    }
                })
                .catch(() => {});
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
            const userBalEl = document.getElementById('marketUserCoinBal');
            const headerBalEl = document.getElementById('terminalHeaderCoinBal');
            const tradeCoinsEl = document.getElementById('tradeAvailableCoins');
            const headerPrice = document.getElementById('marketHeaderPrice');
            const btnCallPrice = document.getElementById('btnCallTargetPrice');
            const btnPutPrice = document.getElementById('btnPutTargetPrice');

            const price = Number(data.price || 0);
            const decimals = data.decimals !== undefined ? data.decimals : 2;
            const prefix = this.activePair === 'PLAY/KES' ? 'KSh ' : '$';
            const priceStr = `${prefix}${price.toFixed(decimals)}`;

            const changePct = Number(data.changePercent || 0);
            const isPos = changePct >= 0;

            if (priceEl) priceEl.textContent = priceStr;
            if (headerPrice) headerPrice.textContent = priceStr;
            if (btnCallPrice) btnCallPrice.textContent = priceStr;
            if (btnPutPrice) btnPutPrice.textContent = priceStr;

            if (changeEl) {
                changeEl.textContent = `${isPos ? '▲ +' : '▼ '}${changePct.toFixed(2)}%`;
                changeEl.className = `market-stat-badge ${isPos ? 'bullish' : 'bearish'}`;
            }

            if (highEl) highEl.textContent = data.high24h ? `${prefix}${Number(data.high24h).toFixed(decimals)}` : `${prefix}0.00`;
            if (lowEl) lowEl.textContent = data.low24h ? `${prefix}${Number(data.low24h).toFixed(decimals)}` : `${prefix}0.00`;
            if (volEl) volEl.textContent = data.volume24h ? `${Number(data.volume24h).toLocaleString('en-US')} ${this.activePair.split('/')[0]}` : '0';
            if (statusEl) statusEl.textContent = data.status === 'PLAYCOIN_INTERNAL' ? '● INTERNAL FEED' : '● LIVE MARKET';

            // Authoritative User Coin Balance
            let currentCoins = 0;
            try {
                const stored = localStorage.getItem('spin_user_data');
                if (stored) {
                    const u = JSON.parse(stored);
                    currentCoins = Number(u.coins || 0);
                }
            } catch (e) {}

            if (window.APP_STATE && window.APP_STATE.coins !== undefined) {
                currentCoins = window.APP_STATE.coins;
            }

            const balFormatted = `${Number(currentCoins).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLAY`;
            if (userBalEl) userBalEl.textContent = balFormatted;
            if (headerBalEl) headerBalEl.textContent = balFormatted;
            if (tradeCoinsEl) tradeCoinsEl.textContent = balFormatted;
        },

        /**
         * Fetch Candlestick Data for Active Pair and Interval
         */
        fetchCandles: function (isBackground = false) {
            if (!isBackground) {
                this.isLoading = true;
                this.renderChartState('loading');
            }

            fetch(`/api/market/candles/${encodeURIComponent(this.activePair)}/${this.activeInterval}`)
                .then(res => res.json())
                .then(data => {
                    this.isLoading = false;
                    if (data && data.success && Array.isArray(data.candles)) {
                        this.candles = data.candles;
                        this.drawChart();
                    } else if (!isBackground) {
                        this.renderChartState('empty');
                    }
                })
                .catch(() => {
                    this.isLoading = false;
                    if (!isBackground) this.renderChartState('error');
                });
        },

        /**
         * Fetch Active Predictions
         */
        fetchActivePredictions: function (isBackground = false) {
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

            fetch('/api/trade/binary/active', { headers })
                .then(res => res.json())
                .then(data => {
                    if (data && data.success) {
                        this.activePredictions = data.trades || [];
                        this.renderActivePredictions();
                        this.drawChart();
                    }
                })
                .catch(() => {});
        },

        /**
         * Render Active Predictions List
         */
        renderActivePredictions: function () {
            const listEl = document.getElementById('marketPositionsList');
            const badgeEl = document.getElementById('posCountBadge');
            if (!listEl) return;

            if (badgeEl) badgeEl.textContent = this.activePredictions.length;

            if (this.activePredictions.length === 0) {
                listEl.innerHTML = `
                    <div class="market-empty-activity">
                        <span>⚡</span>
                        <p>No active predictions. Select an expiry interval, choose CALL or PUT, and place your wager below.</p>
                    </div>
                `;
                return;
            }

            const prefix = this.activePair === 'PLAY/KES' ? 'KSh ' : '$';
            const decimals = this.marketOverview ? (this.marketOverview.decimals || 2) : 2;

            listEl.innerHTML = this.activePredictions.map(trade => {
                const isCall = trade.direction === 'CALL';
                const isWinning = trade.isWinning;
                const statusClass = isWinning ? 'winning' : 'losing';
                const floatingPnl = isWinning ? `+${Number(trade.floatingProfit).toLocaleString()} PLAY` : `-${Number(trade.amount).toLocaleString()} PLAY`;
                const floatingColor = isWinning ? '#00e676' : '#ff1744';

                return `
                    <div class="binary-active-card ${statusClass}">
                        <div class="binary-card-header">
                            <div class="binary-card-title">
                                <span>${trade.pair}</span>
                                <span class="${isCall ? 'binary-badge-call' : 'binary-badge-put'}">${isCall ? '▲ CALL' : '▼ PUT'}</span>
                                <span style="font-size:11px; color:#ffd700;">${Number(trade.amount).toLocaleString()} PLAY</span>
                            </div>
                            <div class="binary-card-timer">⏱️ ${trade.remainingSec}s left</div>
                        </div>
                        <div class="binary-card-body">
                            <div class="binary-body-item">
                                <span class="lbl">ENTRY TARGET</span>
                                <span class="val">${prefix}${Number(trade.entryPrice).toFixed(decimals)}</span>
                            </div>
                            <div class="binary-body-item">
                                <span class="lbl">CURRENT PRICE</span>
                                <span class="val" style="color:${isWinning ? '#00e676' : '#ff1744'};">${prefix}${Number(trade.currentPrice).toFixed(decimals)}</span>
                            </div>
                            <div class="binary-body-item">
                                <span class="lbl">FLOATING P/L</span>
                                <span class="val" style="color:${floatingColor};">${floatingPnl}</span>
                            </div>
                        </div>
                        <div class="binary-card-footer">
                            <span style="font-size:10px; color:#94a3b8;">Potential Return: <strong style="color:#ffd700;">${Number(trade.potentialReturn).toLocaleString()} PLAY</strong></span>
                            <button type="button" class="btn-close-early" onclick="window.MarketEngine.closePredictionEarly('${trade.id}');">
                                ⚡ CLOSE EARLY
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        },

        /**
         * Early Close Prediction
         */
        closePredictionEarly: function (tradeId) {
            if (!tradeId) return;

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

            fetch(`/api/trade/binary/close/${tradeId}`, {
                method: 'POST',
                headers
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    if (window.showToast) {
                        window.showToast(`Prediction Closed Early! ${Number(data.trade.totalReturn).toLocaleString()} PLAY credited.`, 'success');
                    }
                    if (data.user) {
                        if (window.APP_STATE) {
                            window.APP_STATE.balance = data.user.balance;
                            window.APP_STATE.coins = data.user.coins;
                        }
                        if (window.updateBalanceUI) window.updateBalanceUI();
                    }
                    this.fetchActivePredictions();
                    this.fetchTradeHistory();
                    this.fetchPerformanceStats();
                    this.fetchMarketOverview(true);
                } else {
                    if (window.showToast) window.showToast(data.error || 'Failed to close prediction early.', 'error');
                }
            })
            .catch(err => {
                if (window.showToast) window.showToast(err.message || 'Error closing prediction.', 'error');
            });
        },

        /**
         * Fetch Settled Prediction History
         */
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

            fetch('/api/trade/binary/history?limit=50', { headers })
                .then(res => res.json())
                .then(data => {
                    if (data && data.success) {
                        this.tradeHistory = data.history || [];
                        this.renderTradeHistory();
                    }
                })
                .catch(() => {});
        },

        /**
         * Render Settled Trade History
         */
        renderTradeHistory: function () {
            const listEl = document.getElementById('marketHistoryList');
            if (!listEl) return;

            if (this.tradeHistory.length === 0) {
                listEl.innerHTML = `
                    <div class="market-empty-activity">
                        <span>🕒</span>
                        <p>No completed prediction history.</p>
                    </div>
                `;
                return;
            }

            const prefix = this.activePair === 'PLAY/KES' ? 'KSh ' : '$';
            const decimals = this.marketOverview ? (this.marketOverview.decimals || 2) : 2;

            listEl.innerHTML = this.tradeHistory.map(trade => {
                const isWin = trade.result === 'WON' || trade.result === 'WON_EARLY';
                const isTie = trade.result === 'TIE';
                const statusClass = isWin ? 'won' : (isTie ? 'tie' : 'lost');
                const resultBadge = isWin ? '✅ WON (+85%)' : (isTie ? '⚖️ TIE (REFUND)' : '❌ LOST');
                const returnText = isWin ? `+${Number(trade.payout || 0).toLocaleString()} PLAY` : (isTie ? '0.00 PLAY' : `-${Number(trade.amount).toLocaleString()} PLAY`);
                const returnColor = isWin ? '#00e676' : (isTie ? '#94a3b8' : '#ff1744');
                const timeStr = new Date(trade.settlementTime || trade.entryTime).toLocaleTimeString();

                return `
                    <div class="binary-history-card ${statusClass}">
                        <div>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <strong style="color:#fff; font-size:12px;">${trade.pair}</strong>
                                <span class="${trade.direction === 'CALL' ? 'binary-badge-call' : 'binary-badge-put'}">${trade.direction}</span>
                                <span style="font-size:10px; color:#64748b;">${trade.timeframe.toUpperCase()}</span>
                            </div>
                            <div style="font-size:10px; color:#94a3b8; margin-top:2px;">
                                Entry: ${prefix}${Number(trade.entryPrice).toFixed(decimals)} • Exit: ${prefix}${Number(trade.exitPrice || 0).toFixed(decimals)}
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px; font-weight:800; color:${returnColor};">${returnText}</div>
                            <div style="font-size:9.5px; color:#64748b; margin-top:2px;">${resultBadge} • ${timeStr}</div>
                        </div>
                    </div>
                `;
            }).join('');
        },

        /**
         * Fetch Performance Statistics
         */
        fetchPerformanceStats: function () {
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

            fetch('/api/trade/performance', { headers })
                .then(res => res.json())
                .then(data => {
                    if (data && data.success && data.stats) {
                        this.performanceStats = data.stats;
                        this.renderPerformanceStats(data.stats);
                    }
                })
                .catch(() => {});
        },

        /**
         * Render Performance Statistics
         */
        renderPerformanceStats: function (stats) {
            const totalEl = document.getElementById('perfTotalTrades');
            const winRateEl = document.getElementById('perfWinRate');
            const winsLossesEl = document.getElementById('perfWinsLosses');
            const netPnlEl = document.getElementById('perfNetPnL');
            const streakEl = document.getElementById('perfStreak');
            const bestStreakEl = document.getElementById('perfBestStreak');

            if (totalEl) totalEl.textContent = stats.totalTrades || 0;
            if (winRateEl) winRateEl.textContent = `${Number(stats.winRate || 0).toFixed(1)}%`;
            if (winsLossesEl) winsLossesEl.textContent = `${stats.wins || 0}W / ${stats.losses || 0}L`;
            if (netPnlEl) {
                const net = Number(stats.totalProfitLoss || 0);
                netPnlEl.textContent = `${net >= 0 ? '+' : ''}${net.toLocaleString('en-US', { minimumFractionDigits: 2 })} PLAY`;
                netPnlEl.style.color = net >= 0 ? '#00e676' : '#ff1744';
            }
            if (streakEl) streakEl.textContent = `${stats.currentStreak || 0} 🔥`;
            if (bestStreakEl) bestStreakEl.textContent = `${stats.bestStreak || 0} 👑`;
        },

        /**
         * Fetch Live Order Book Depth
         */
        fetchOrderBook: function (isBackground = false) {
            fetch(`/api/market/orderbook/${encodeURIComponent(this.activePair)}`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.success) {
                        this.orderBook = data;
                        this.renderOrderBook(data);
                    }
                })
                .catch(() => {});
        },

        /**
         * Render Live Order Book
         */
        renderOrderBook: function (data) {
            const rowsEl = document.getElementById('marketOrderbookRows');
            if (!rowsEl) return;

            const bids = data.bids || [];
            const asks = data.asks || [];
            const maxRows = Math.min(bids.length, asks.length, 6);
            const decimals = this.marketOverview ? (this.marketOverview.decimals || 2) : 2;

            let html = '';
            for (let i = 0; i < maxRows; i++) {
                const bid = bids[i] || {};
                const ask = asks[i] || {};

                html += `
                    <div class="orderbook-row">
                        <span class="bid-col">${Number(bid.size || 0).toFixed(2)}</span>
                        <span class="mid-col">${Number(bid.price || 0).toFixed(decimals)}</span>
                        <span class="ask-col">${Number(ask.size || 0).toFixed(2)}</span>
                    </div>
                `;
            }

            rowsEl.innerHTML = html || '<div style="color:#64748b; font-size:11px; padding:10px;">No depth data available</div>';
        },

        /**
         * Set Chart Type
         */
        setChartType: function (type) {
            if (!['candles', 'line', 'area', 'ohlc'].includes(type)) return;
            this.activeChartType = type;
            sessionStorage.setItem('market_chart_type', type);
            this.drawChart();
        },

        /**
         * Toggle Technical Indicators
         */
        toggleIndicatorFromDropdown: function (ind) {
            if (this.activeIndicators[ind] !== undefined) {
                this.activeIndicators[ind] = !this.activeIndicators[ind];
                sessionStorage.setItem('market_indicators', JSON.stringify(this.activeIndicators));
                this.drawChart();
            }
        },

        /**
         * Switch Workspace Tabs
         */
        setWorkspaceTab: function (tabId) {
            this.activeWorkspaceTab = tabId;
            document.querySelectorAll('.workspace-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-target-pane') === tabId);
            });
            document.querySelectorAll('.workspace-pane').forEach(pane => {
                if (pane.id === tabId) {
                    pane.style.display = 'block';
                    pane.classList.add('active');
                } else {
                    pane.style.display = 'none';
                    pane.classList.remove('active');
                }
            });

            if (tabId === 'paneHistory') this.fetchTradeHistory();
            if (tabId === 'paneStats') this.fetchPerformanceStats();
            if (tabId === 'paneOrderbook') this.fetchOrderBook();
        },

        /**
         * Switch View Section
         */
        switchSection: function (section) {
            const chartSection = document.getElementById('marketChartSection');
            const tradingPanel = document.getElementById('marketTradingPanel');
            const activityCard = document.getElementById('marketActivityCard');

            if (section === 'chart') {
                if (chartSection) chartSection.style.display = 'flex';
                if (tradingPanel) tradingPanel.style.display = 'none';
                if (activityCard) activityCard.style.display = 'none';
            } else if (section === 'predict') {
                if (chartSection) chartSection.style.display = 'none';
                if (tradingPanel) tradingPanel.style.display = 'flex';
                if (activityCard) activityCard.style.display = 'none';
            } else if (section === 'positions') {
                if (chartSection) chartSection.style.display = 'none';
                if (tradingPanel) tradingPanel.style.display = 'none';
                if (activityCard) activityCard.style.display = 'flex';
            } else {
                if (chartSection) chartSection.style.display = 'flex';
                if (tradingPanel) tradingPanel.style.display = 'flex';
                if (activityCard) activityCard.style.display = 'flex';
            }

            setTimeout(() => this.resizeCanvas(), 50);
        },

        /**
         * Handle Menu Action Select
         */
        handleActionSelect: function (selectEl) {
            if (!selectEl) return;
            const val = selectEl.value;
            selectEl.value = '';

            if (val === 'expand') {
                this.toggleFullscreenChart();
            } else if (val === 'deposit') {
                this.triggerDeposit();
            } else if (val === 'stats') {
                this.setWorkspaceTab('paneStats');
            } else if (val === 'exit') {
                this.closeMarket();
            }
        },

        /**
         * Toggle Fullscreen Chart Expansion
         */
        toggleFullscreenChart: function (forceState) {
            const modal = document.getElementById('marketDashboardModal');
            if (!modal) return;
            this.isFullscreenChart = forceState !== undefined ? forceState : !this.isFullscreenChart;
            modal.classList.toggle('fullscreen-chart-mode', this.isFullscreenChart);
            setTimeout(() => {
                this.resizeCanvas();
                this.drawChart();
            }, 50);
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
            let ema = sum / period;
            result[period - 1] = ema;

            for (let i = period; i < data.length; i++) {
                ema = (data[i].close * k) + (ema * (1 - k));
                result[i] = ema;
            }
            return result;
        },

        /**
         * Draw Indicator Line Helper
         */
        _drawIndicatorLine: function (ctx, visibleSlice, startIndex, candleStep, paddingLeft, indicatorData, getY, color, lineWidth = 1) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            let started = false;

            for (let i = 0; i < visibleSlice.length; i++) {
                const fullIdx = startIndex + i;
                const val = indicatorData[fullIdx];
                if (val !== null && val !== undefined) {
                    const x = paddingLeft + (i * candleStep) + (candleStep / 2);
                    const y = getY(val);
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
            }
            if (started) ctx.stroke();
            ctx.restore();
        },

        /**
         * Render HTML5 Canvas Chart with Active Trade Markers
         */
        drawChart: function () {
            if (!this.canvas || !this.ctx || !this.candles || this.candles.length === 0) return;

            const ctx = this.ctx;
            const width = parseFloat(this.canvas.style.width) || 600;
            const height = parseFloat(this.canvas.style.height) || 280;

            ctx.clearRect(0, 0, width, height);

            const paddingLeft = 10;
            const paddingRight = 65;
            const paddingTop = 20;
            const paddingBottom = 25;

            const plotWidth = Math.max(10, width - paddingLeft - paddingRight);
            const plotHeight = Math.max(10, height - paddingTop - paddingBottom);

            const rsiPaneHeight = this.activeIndicators.rsi ? Math.min(60, plotHeight * 0.25) : 0;
            const mainPlotHeight = plotHeight - rsiPaneHeight - (this.activeIndicators.rsi ? 10 : 0);

            const totalCandles = this.candles.length;
            const count = Math.min(totalCandles, Math.max(15, this.visibleCandlesCount));
            const maxPan = Math.max(0, totalCandles - count);
            const clampedPan = Math.max(0, Math.min(maxPan, this.panOffset));

            const startIndex = Math.max(0, totalCandles - count - clampedPan);
            const endIndex = Math.min(totalCandles, startIndex + count);
            const visibleSlice = this.candles.slice(startIndex, endIndex);

            if (visibleSlice.length === 0) return;

            let minPrice = Infinity;
            let maxPrice = -Infinity;
            let maxVolume = 0;

            visibleSlice.forEach(c => {
                if (c.low < minPrice) minPrice = c.low;
                if (c.high > maxPrice) maxPrice = c.high;
                if (c.volume > maxVolume) maxVolume = c.volume;
            });

            if (minPrice === maxPrice) {
                minPrice *= 0.98;
                maxPrice *= 1.02;
            }

            const priceMargin = (maxPrice - minPrice) * 0.08;
            minPrice -= priceMargin;
            maxPrice += priceMargin;
            const priceRange = maxPrice - minPrice;

            const getY = (price) => paddingTop + (mainPlotHeight * (1 - ((price - minPrice) / priceRange)));
            const getPriceFromY = (y) => maxPrice - (((y - paddingTop) / mainPlotHeight) * priceRange);
            const getVolY = (vol) => (paddingTop + mainPlotHeight) - ((vol / (maxVolume || 1)) * (mainPlotHeight * 0.22));

            const candleStep = plotWidth / visibleSlice.length;
            const candleWidth = Math.max(2, candleStep * 0.68);
            const decimals = this.marketOverview ? (this.marketOverview.decimals || 2) : 2;
            const prefix = this.activePair === 'PLAY/KES' ? 'KSh ' : '$';

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

                ctx.fillText(`${prefix}${p.toFixed(decimals)}`, paddingLeft + plotWidth + 6, y);
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

                    // Open tick
                    const openY = getY(c.open);
                    ctx.beginPath();
                    ctx.moveTo(x - tickSize, openY);
                    ctx.lineTo(x, openY);
                    ctx.stroke();

                    // Close tick
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

            // 5. Current Live Price Line (Horizontal)
            if (visibleSlice.length > 0) {
                const latestCandle = visibleSlice[visibleSlice.length - 1];
                const currentY = getY(latestCandle.close);

                ctx.save();
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.75)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(paddingLeft, currentY);
                ctx.lineTo(paddingLeft + plotWidth, currentY);
                ctx.stroke();

                // Current Price Pill on Right Axis
                ctx.fillStyle = '#00f0ff';
                ctx.fillRect(paddingLeft + plotWidth, currentY - 8, paddingRight - 4, 16);
                ctx.fillStyle = '#06101e';
                ctx.font = 'bold 9.5px Sora, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${prefix}${latestCandle.close.toFixed(decimals)}`, paddingLeft + plotWidth + 4, currentY);
                ctx.restore();
            }

            // 6. Interactive Active Prediction Trade Entry Markers
            if (Array.isArray(this.activePredictions) && this.activePredictions.length > 0) {
                this.activePredictions.forEach(trade => {
                    if (trade.pair !== this.activePair) return;
                    const entryY = getY(trade.entryPrice);
                    if (entryY >= paddingTop && entryY <= paddingTop + mainPlotHeight) {
                        ctx.save();
                        const isCall = trade.direction === 'CALL';
                        const markerColor = isCall ? '#00e676' : '#ff1744';

                        // Dashed entry level line
                        ctx.strokeStyle = isCall ? 'rgba(0, 230, 118, 0.6)' : 'rgba(255, 23, 68, 0.6)';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([4, 4]);
                        ctx.beginPath();
                        ctx.moveTo(paddingLeft, entryY);
                        ctx.lineTo(paddingLeft + plotWidth, entryY);
                        ctx.stroke();

                        // Entry marker badge
                        const badgeText = `${isCall ? '▲ CALL' : '▼ PUT'} @ ${prefix}${Number(trade.entryPrice).toFixed(decimals)}`;
                        ctx.font = 'bold 9.5px Sora, sans-serif';
                        const textW = ctx.measureText(badgeText).width;
                        ctx.fillStyle = markerColor;
                        ctx.fillRect(paddingLeft + plotWidth - textW - 14, entryY - 9, textW + 10, 18);
                        ctx.fillStyle = '#06101e';
                        ctx.fillText(badgeText, paddingLeft + plotWidth - textW - 9, entryY);
                        ctx.restore();
                    }
                });
            }

            // 7. Crosshair
            if (this.hoverPos && this.hoverPos.x >= paddingLeft && this.hoverPos.x <= paddingLeft + plotWidth) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 2]);

                // Vertical
                ctx.beginPath();
                ctx.moveTo(this.hoverPos.x, paddingTop);
                ctx.lineTo(this.hoverPos.x, paddingTop + mainPlotHeight);
                ctx.stroke();

                // Horizontal
                ctx.beginPath();
                ctx.moveTo(paddingLeft, this.hoverPos.y);
                ctx.lineTo(paddingLeft + plotWidth, this.hoverPos.y);
                ctx.stroke();

                ctx.restore();
            }
        },

        /**
         * Render Chart Loading / Empty / Error State
         */
        renderChartState: function (state) {
            if (!this.canvas || !this.ctx) return;
            const ctx = this.ctx;
            const width = parseFloat(this.canvas.style.width) || 600;
            const height = parseFloat(this.canvas.style.height) || 280;

            ctx.clearRect(0, 0, width, height);
            ctx.font = '12px Sora, sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (state === 'loading') {
                ctx.fillText('⏳ Connecting to live market feed...', width / 2, height / 2);
            } else if (state === 'empty') {
                ctx.fillText('📊 Awaiting live ticks...', width / 2, height / 2);
            } else if (state === 'error') {
                ctx.fillText('⚠️ Feed reconnection in progress...', width / 2, height / 2);
            }
        },

        _updateHoverHud: function () {
            if (!this.hoverPos || !this.candles || this.candles.length === 0 || !this.canvas) return;
            const width = parseFloat(this.canvas.style.width) || 600;
            const paddingLeft = 10;
            const paddingRight = 65;
            const plotWidth = Math.max(10, width - paddingLeft - paddingRight);
            const totalCandles = this.candles.length;
            const count = Math.min(totalCandles, Math.max(15, this.visibleCandlesCount));
            const maxPan = Math.max(0, totalCandles - count);
            const clampedPan = Math.max(0, Math.min(maxPan, this.panOffset));
            const startIndex = Math.max(0, totalCandles - count - clampedPan);
            const endIndex = Math.min(totalCandles, startIndex + count);
            const visibleSlice = this.candles.slice(startIndex, endIndex);
            if (visibleSlice.length === 0) return;

            const candleStep = plotWidth / visibleSlice.length;
            const relX = this.hoverPos.x - paddingLeft;
            const idx = Math.floor(relX / candleStep);
            if (idx >= 0 && idx < visibleSlice.length) {
                const c = visibleSlice[idx];
                const decimals = this.marketOverview ? (this.marketOverview.decimals || 2) : 2;
                const prefix = this.activePair === 'PLAY/KES' ? 'KSh ' : '$';
                const hOpen = document.getElementById('hudOpen');
                const hHigh = document.getElementById('hudHigh');
                const hLow = document.getElementById('hudLow');
                const hClose = document.getElementById('hudClose');
                const hVol = document.getElementById('hudVol');
                if (hOpen) hOpen.textContent = `${prefix}${c.open.toFixed(decimals)}`;
                if (hHigh) hHigh.textContent = `${prefix}${c.high.toFixed(decimals)}`;
                if (hLow) hLow.textContent = `${prefix}${c.low.toFixed(decimals)}`;
                if (hClose) hClose.textContent = `${prefix}${c.close.toFixed(decimals)}`;
                if (hVol) hVol.textContent = Number(c.volume || 0).toLocaleString();
            }
        },

        _bindCanvasEvents: function () {
            if (!this.canvas) return;

            // 1. Desktop Mouse Events
            this.canvas.addEventListener('mousedown', (e) => {
                this.isDragging = true;
                this.dragStartX = e.clientX;
                this.dragStartOffset = this.panOffset;
            });

            window.addEventListener('mouseup', () => {
                this.isDragging = false;
            });

            this.canvas.addEventListener('mousemove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                this.hoverPos = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };

                if (this.isDragging) {
                    const deltaX = e.clientX - this.dragStartX;
                    const candleStep = (rect.width - 75) / Math.max(1, this.visibleCandlesCount);
                    const offsetDelta = Math.round(deltaX / candleStep);
                    this.panOffset = Math.max(0, this.dragStartOffset + offsetDelta);
                }

                this._updateHoverHud();
                this.drawChart();
            });

            this.canvas.addEventListener('mouseleave', () => {
                this.hoverPos = null;
                this.drawChart();
            });

            this.canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
                this.visibleCandlesCount = Math.max(15, Math.min(150, Math.round(this.visibleCandlesCount * zoomFactor)));
                this.drawChart();
            }, { passive: false });

            // 2. Native Android Mobile Touch Gestures (Drag, Pinch-to-Zoom, Tap Selection)
            let lastTouchDist = null;

            this.canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    const rect = this.canvas.getBoundingClientRect();
                    this.isDragging = true;
                    this.dragStartX = touch.clientX;
                    this.dragStartOffset = this.panOffset;
                    this.hoverPos = {
                        x: touch.clientX - rect.left,
                        y: touch.clientY - rect.top
                    };
                    this._updateHoverHud();
                    this.drawChart();
                } else if (e.touches.length === 2) {
                    this.isDragging = false;
                    const t1 = e.touches[0];
                    const t2 = e.touches[1];
                    lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                }
            }, { passive: true });

            this.canvas.addEventListener('touchmove', (e) => {
                if (e.touches.length === 1 && this.isDragging) {
                    const touch = e.touches[0];
                    const rect = this.canvas.getBoundingClientRect();
                    const deltaX = touch.clientX - this.dragStartX;
                    const candleStep = (rect.width - 75) / Math.max(1, this.visibleCandlesCount);
                    const offsetDelta = Math.round(deltaX / candleStep);
                    this.panOffset = Math.max(0, this.dragStartOffset + offsetDelta);

                    this.hoverPos = {
                        x: touch.clientX - rect.left,
                        y: touch.clientY - rect.top
                    };
                    this._updateHoverHud();
                    this.drawChart();
                } else if (e.touches.length === 2 && lastTouchDist) {
                    const t1 = e.touches[0];
                    const t2 = e.touches[1];
                    const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    const diff = currentDist - lastTouchDist;
                    if (Math.abs(diff) > 5) {
                        const zoomDelta = diff > 0 ? -2 : 2;
                        this.visibleCandlesCount = Math.max(15, Math.min(150, this.visibleCandlesCount + zoomDelta));
                        lastTouchDist = currentDist;
                        this.drawChart();
                    }
                }
            }, { passive: true });

            this.canvas.addEventListener('touchend', (e) => {
                if (e.touches.length === 0) {
                    this.isDragging = false;
                    lastTouchDist = null;
                } else if (e.touches.length === 1) {
                    lastTouchDist = null;
                    this.isDragging = true;
                    this.dragStartX = e.touches[0].clientX;
                    this.dragStartOffset = this.panOffset;
                }
            }, { passive: true });
        },


        /**
         * Trigger Universal Trading Deposit (Min 500 KSh)
         */
        triggerDeposit: function () {
            const modal = document.getElementById('tradeDepositPromptModal');
            if (!modal) return;

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
            if (amtInput && (!amtInput.value || Number(amtInput.value) < 500)) amtInput.value = '500';
            this.setTradeDepositAmount(500);
            if (statusBanner) statusBanner.style.display = 'none';
            if (btn) {
                btn.disabled = false;
                btn.textContent = '⚡ FUND ACCOUNT';
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
            document.querySelectorAll('.deposit-chip').forEach(b => {
                if (Number(b.dataset.amt) === Number(amt)) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
            if (btnEl) btnEl.classList.add('active');
        },

        submitTradeDeposit: async function () {
            const amtInput = document.getElementById('tradeDepositAmountInput');
            const phoneInput = document.getElementById('tradeDepositPhoneInput');
            const statusBanner = document.getElementById('tradeDepositStatusBanner');
            const statusText = document.getElementById('tradeDepositStatusText');
            const btn = document.getElementById('btnSubmitTradeDeposit');

            const amount = Number(amtInput ? amtInput.value : 500);
            let phone = phoneInput ? phoneInput.value.trim() : '';

            if (!amount || amount < 500) {
                if (window.showToast) window.showToast('Minimum deposit amount is KSh 500', 'error');
                return;
            }

            const cleanP = phone.replace(/\D/g, '');
            if (!phone || cleanP.length < 9) {
                if (window.showToast) window.showToast('Please enter a valid phone number (e.g. 07XXXXXXXX)', 'error');
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
                btn.textContent = 'Initializing Payment...';
            }
            if (statusBanner) {
                statusBanner.style.display = 'block';
                statusBanner.style.borderColor = 'var(--cyan-accent)';
                statusBanner.style.background = 'rgba(0, 240, 255, 0.1)';
                if (statusText) statusText.textContent = '📲 Sending payment prompt to your phone...';
            }

            try {
                let headers = { 'Content-Type': 'application/json' };
                const token = localStorage.getItem('spin_jwt_token');
                if (token) headers['Authorization'] = `Bearer ${token}`;

                let storedUser = null;
                try {
                    const raw = localStorage.getItem('spin_user_data');
                    if (raw) storedUser = JSON.parse(raw);
                } catch (e) {}

                const userId = storedUser ? storedUser.id : (window.APP_STATE ? window.APP_STATE.userId : 'demo-user-1');
                if (userId) headers['x-user-id'] = userId;

                const res = await fetch('/api/deposit', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ userId, phone, amount })
                });

                const data = await res.json();
                if (!data || !data.success) {
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Retry Deposit';
                    }
                    const errMsg = data?.error || 'Deposit initialization failed.';
                    if (statusBanner) {
                        statusBanner.style.borderColor = '#ff4444';
                        statusBanner.style.background = 'rgba(255, 68, 68, 0.15)';
                        if (statusText) statusText.textContent = `❌ ${errMsg}`;
                    }
                    if (window.showToast) window.showToast(errMsg, 'error');
                    return;
                }

                if (statusBanner) {
                    statusBanner.style.borderColor = 'var(--gold-primary)';
                    statusBanner.style.background = 'rgba(255, 215, 0, 0.12)';
                    if (statusText) statusText.textContent = '📱 Payment Request Sent! Enter PIN on your phone to complete deposit.';
                }
                if (btn) btn.textContent = 'Awaiting PIN Verification...';
                if (window.showToast) window.showToast('Prompt sent! Enter PIN on your phone.', 'info');

                const chkId = data.CheckoutRequestID || data.checkoutRequestId;
                if (!chkId) return;

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
                        const checkRes = await fetch(`/api/deposit/status/${chkId}`);
                        const statusRes = await checkRes.json();
                        const statusUpper = (statusRes?.status || '').toUpperCase();
                        const isConfirmed = statusUpper === 'COMPLETED' || statusUpper === 'SUCCESS' || statusUpper === 'CONFIRMED' || (statusRes?.success === true && statusRes?.amount > 0);

                        if (isConfirmed) {
                            isResolved = true;
                            clearInterval(pollInterval);
                            if (statusBanner) {
                                statusBanner.style.borderColor = '#00e676';
                                statusBanner.style.background = 'rgba(0, 230, 118, 0.15)';
                                if (statusText) statusText.textContent = `✅ Payment Confirmed! KSh ${amount.toLocaleString()} credited successfully.`;
                            }
                            if (btn) {
                                btn.disabled = false;
                                btn.textContent = '✅ Payment Confirmed!';
                            }
                            if (window.showToast) window.showToast(`Payment Confirmed: KSh ${amount.toLocaleString()}`, 'success');

                            if (statusRes.user) {
                                if (window.updateUserState) {
                                    window.updateUserState(statusRes.user, statusRes.coinsGained || amount);
                                } else if (window.APP_STATE) {
                                    window.APP_STATE.balance = statusRes.user.balance;
                                    window.APP_STATE.coins = statusRes.user.coins;
                                    if (window.updateBalanceUI) window.updateBalanceUI();
                                }
                            }
                            if (typeof window.triggerConfetti === 'function') window.triggerConfetti();

                            setTimeout(() => {
                                this.closeTradeDepositModal();
                                if (btn) {
                                    btn.disabled = false;
                                    btn.textContent = '⚡ FUND ACCOUNT';
                                }
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
        }
    };

    window.MarketEngine = MarketEngine;

    document.addEventListener('DOMContentLoaded', () => {
        MarketEngine.init();
    });

})(window, document);
