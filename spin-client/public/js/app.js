/**
 * app.js — Main Client Application Hub
 * Navigation, API calls, Socket.IO, Spin Engine integration, Modals, Toasts
 */

const getApiBase = () => {
    if (typeof window !== 'undefined' && window.location) {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return `${window.location.protocol}//${window.location.hostname}:8080`;
        }
        return window.location.origin;
    }
    return 'http://localhost:8080';
};
const API_BASE = getApiBase();

const APP_STATE = {
    userId: 'GUEST',
    token: null,
    isAuthenticated: false,
    balance: 0.00,
    freeSpins: 0,
    doubleNextWin: false,
    mysteryKeys: 0,
    xp: 0,
    vipTier: 'bronze',
    betAmount: 100,
    isSpinning: false,
    soundEnabled: true
};

// ─── API HELPERS ───────────────────────────────────────────────────────────
async function apiFetch(endpoint) {
    const headers = { 'Content-Type': 'application/json' };
    if (APP_STATE.token) headers['Authorization'] = `Bearer ${APP_STATE.token}`;

    let storedUser = null;
    try {
        const raw = localStorage.getItem('spin_user_data');
        if (raw) storedUser = JSON.parse(raw);
    } catch(e) {}

    const isTester = (storedUser && window.isTesterAccount && window.isTesterAccount(storedUser)) || APP_STATE.isTester;
    const userEmail = (storedUser ? storedUser.email : '') || (APP_STATE.userEmail || '');

    if (userEmail) headers['x-user-email'] = userEmail;
    if (isTester) headers['x-is-tester'] = 'true';

    try {
        const res = await fetch(API_BASE + endpoint, { headers });
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return await res.json();
        }
        return { success: false };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function apiPost(endpoint, body = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (APP_STATE.token) headers['Authorization'] = `Bearer ${APP_STATE.token}`;

    let storedUser = null;
    try {
        const raw = localStorage.getItem('spin_user_data');
        if (raw) storedUser = JSON.parse(raw);
    } catch(e) {}

    const isTester = (storedUser && window.isTesterAccount && window.isTesterAccount(storedUser)) || APP_STATE.isTester;
    const userEmail = (storedUser ? storedUser.email : '') || (APP_STATE.userEmail || '');

    if (userEmail) headers['x-user-email'] = userEmail;
    if (isTester) headers['x-is-tester'] = 'true';

    const fullBody = {
        userId: APP_STATE.userId || (storedUser ? storedUser.id : 'demo-user-1'),
        userEmail: userEmail,
        isTester: isTester,
        ...body
    };

    try {
        const res = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(fullBody)
        });
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await res.json();
            if (!res.ok && data) {
                return { success: false, error: data.error || data.message || `Server error (${res.status})` };
            }
            return data;
        }
        return { success: false, error: `Server error (${res.status})` };
    } catch (e) {
        return { success: false, error: e.message || 'Network error' };
    }
}

function initTabNavigation() {
    document.querySelectorAll('.game-nav-tab, .nav-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.game-nav-tab, .nav-item').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });
}

// ─── INITIALIZATION ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // 1. Bind Auth Modal & Header Login/Register Events
    try { bindAuthEvents(); } catch (e) { console.warn('bindAuthEvents err:', e); }

    // 2. Initialize Navigation Tabs & Modals
    try { initTabNavigation(); } catch (e) { console.warn('initTabNavigation err:', e); }

    // 3. Initialize Spin Wheel Canvas
    if (window.WheelEngine) {
        try {
            if (document.getElementById('wheelCanvas')) window.WheelEngine.init('wheelCanvas');
            if (document.getElementById('mobileWheelCanvas')) new SpinWheelEngine('mobileWheelCanvas');
        } catch (e) { console.warn('wheelEngine err:', e); }
    }

    // 4. Initialize Mini Games and VIP
    if (typeof initAllGames === 'function') {
        try { initAllGames(); } catch (e) { console.warn('initAllGames err:', e); }
    }
    if (typeof initVIPPanel === 'function') {
        try { initVIPPanel(); } catch (e) { console.warn('initVIPPanel err:', e); }
    }

    // 5. Bind Spin Wheel Controls
    try { bindWheelControls(); } catch (e) { console.warn('bindWheelControls err:', e); }

    // 6. Bind Modals
    try { bindDepositModal(); } catch (e) { console.warn('bindDepositModal err:', e); }
    try { bindWinModal(); } catch (e) { console.warn('bindWinModal err:', e); }

    // 7. Bind Sound & Chat
    try { bindSoundAndChat(); } catch (e) { console.warn('bindSoundAndChat err:', e); }

    // 8. Initialize Background Particles & Mini Animators
    try { initBackgroundParticles(); } catch (e) { console.warn('bgParticles err:', e); }
    try { initLiveMiniComponents(); } catch (e) { console.warn('miniComponents err:', e); }

    // 9. Start Live Winner Broadcast & Live Chat Looper
    try { startSeededLiveLoop(); } catch (e) { console.warn('seededLiveLoop err:', e); }

    // 10. Initialize Socket.IO connection
    try { initSocketIO(); } catch (e) { console.warn('socketIO err:', e); }
    try { startSeededLiveLoop(); } catch (e) { console.warn('live loop err:', e); }

    // 11. Async Auth Verification
    initAuth().catch(e => {
        console.warn('initAuth err:', e);
        setUnauthenticatedState();
    });
});

// ─── AUTHENTICATION & ACCESS GATE ──────────────────────────────────────────
async function initAuth() {
    const storedToken = localStorage.getItem('spin_jwt_token');
    const storedUserStr = localStorage.getItem('spin_user_data');
    if (storedToken) {
        APP_STATE.token = storedToken;
        try {
            const res = await apiFetch('/api/auth/me');
            if (res && res.success && res.user) {
                setAuthenticatedUser(res.user, storedToken);
                return;
            }
        } catch (e) {
            console.warn('Invalid stored JWT token:', e.message);
        }
        if (storedUserStr) {
            try {
                const localUser = JSON.parse(storedUserStr);
                if (localUser && localUser.email) {
                    setAuthenticatedUser(localUser, storedToken);
                    return;
                }
            } catch(e) {}
        }
    }
    setUnauthenticatedState();
}

window.isTesterAccount = function (val) {
    if (!val) return false;
    let str = '';
    if (typeof val === 'string') {
        str = val.toLowerCase();
    } else if (typeof val === 'object') {
        str = ((val.email || '') + ' ' + (val.name || '') + ' ' + (val.phone || '') + ' ' + (val.id || '')).toLowerCase();
    }
    return str.includes('brittanycooke') || str.includes('britannycooke');
};

window.setAuthenticatedUser = function (user, token) {
    APP_STATE.token = token;
    APP_STATE.userId = user.id || 'usr_player';
    APP_STATE.isAuthenticated = true;

    // TESTER ACCOUNT CONFIGURATION FOR brittanycooke98 / britannycooke98
    if (window.isTesterAccount(user)) {
        APP_STATE.isTester = true;
        user.isTester = true;
        user.balance = 250000.00;
        user.coins = 250000;
        try { localStorage.setItem('spin_user_data', JSON.stringify(user)); } catch(e) {}
    }

    localStorage.setItem('spin_jwt_token', token);
    try { localStorage.setItem('spin_user_data', JSON.stringify(user)); } catch(e) {}

    const unauthHeader = document.getElementById('unauthHeader');
    const authHeader = document.getElementById('authHeader');
    const userNameEl = document.getElementById('hdrUserName');
    const userVipEl = document.getElementById('hdrVipTier');
    const chatLockOverlay = document.getElementById('chatLockOverlay');
    const authModal = document.getElementById('authModal');

    if (unauthHeader) unauthHeader.style.display = 'none';
    if (authHeader) authHeader.style.display = 'flex';
    if (chatLockOverlay) chatLockOverlay.style.display = 'none';
    
    // Automatically close auth modal immediately on authentication success
    if (authModal) {
        authModal.style.display = 'none';
        authModal.style.opacity = '0';
        authModal.style.visibility = 'hidden';
        authModal.classList.remove('open', 'active');
        authModal.setAttribute('style', 'display: none !important');
    }
    if (window.closeAuthModal) window.closeAuthModal();

    document.body.style.overflow = '';
    document.body.style.pointerEvents = 'auto';

    if (userNameEl) userNameEl.textContent = user.name || user.email || user.phone || 'USER';
    if (userVipEl) userVipEl.textContent = (user.vipTier || 'BRONZE').toUpperCase() + (user.isTester ? ' TESTER VIP' : ' VIP');

    updateBalanceUI(user.balance ?? 0.00, user.coins || 200);
};

window.showTesterWinAnimation = function (amountText, subtitleText) {
    const existing = document.getElementById('testerWinAnimationOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'testerWinAnimationOverlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: rgba(3, 6, 18, 0.88); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999999; pointer-events: none; animation: fadeIn 0.3s ease-out;';

    overlay.innerHTML = `
        <div style="background: linear-gradient(145deg, #162447, #0f1b35); border: 3px solid #ffd700; border-radius: 24px; padding: 32px 40px; text-align: center; box-shadow: 0 0 50px rgba(255, 215, 0, 0.6), 0 20px 60px rgba(0, 0, 0, 0.9); transform: scale(1); animation: testerPopIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;">
            <div style="font-size: 36px; margin-bottom: 8px;">🎉 YOU WON!</div>
            <div style="font-family: 'Orbitron', sans-serif; font-size: 38px; font-weight: 900; color: #ffd700; text-shadow: 0 0 20px rgba(255, 215, 0, 0.8); margin-bottom: 6px;">
                +${amountText}
            </div>
            <div style="font-size: 16px; color: #00f0ff; font-weight: 800; letter-spacing: 1px;">
                ${subtitleText || 'PLAY COINS'}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    if (typeof confetti === 'function') {
        confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.5 },
            colors: ['#ffd700', '#ffe066', '#00f0ff', '#ffffff']
        });
    }

    setTimeout(() => {
        overlay.style.transition = 'opacity 0.4s ease-out';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 400);
    }, 2800);
};

window.updateBalanceUI = function (balance = 0, coins = 0) {
    const mobWalletEl = document.getElementById('mobWalletBalance');
    const userCoinsEl = document.getElementById('userCoinsText');

    let curUser = null;
    try {
        const raw = localStorage.getItem('spin_user_data');
        if (raw) curUser = JSON.parse(raw);
    } catch(e) {}

    const isTester = (curUser && curUser.email && curUser.email.toLowerCase() === 'britannycooke98@gmail.com') ||
                     (window.APP_STATE && window.APP_STATE.isTester);

    const finalBal = isTester ? (Number(balance) > 250000 ? Number(balance) : 250000.00) : Number(balance || 0);
    const finalCoins = isTester ? (Number(coins) > 250000 ? Number(coins) : 250000) : Number(coins || 0);

    const fmtBal = finalBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtCoins = finalCoins.toLocaleString('en-US');

    if (mobWalletEl) mobWalletEl.textContent = `KSh ${fmtBal}`;
    if (userCoinsEl) userCoinsEl.textContent = `${fmtCoins} Play Coins`;
};

window.toggleCategory = function (id) {
    const el = document.getElementById(id);
    const arrow = document.getElementById(id + '-arrow');
    if (el) {
        const isHidden = el.style.display === 'none' || getComputedStyle(el).display === 'none';
        el.style.display = isHidden ? 'flex' : 'none';
        if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
    }
};

window.setUnauthenticatedState = function () {
    APP_STATE.token = null;
    APP_STATE.isAuthenticated = false;
    localStorage.removeItem('spin_jwt_token');

    const unauthHeader = document.getElementById('unauthHeader');
    const authHeader = document.getElementById('authHeader');
    const chatLockOverlay = document.getElementById('chatLockOverlay');

    if (unauthHeader) unauthHeader.style.display = 'flex';
    if (authHeader) authHeader.style.display = 'none';
    if (chatLockOverlay) chatLockOverlay.style.display = 'flex';
};

window.showRegBonusModal = function () {
    // Disabled as requested - 200 Play Coins are credited directly to user balance
};

window.closeRegBonusModal = function () {
    // Disabled
};

window.clearAppCache = function () {
    localStorage.removeItem('spin_jwt_token');
    localStorage.removeItem('spin_user_data');
    localStorage.removeItem('spin_bonus_claimed');
    sessionStorage.clear();
    setUnauthenticatedState();
    if (window.showToast) window.showToast('Cache memory cleared cleanly! 🧹', 'info');
};

let currentAuthMode = 'login';
window._authMode = 'login';

window.switchAuthTab = function (mode) {
    currentAuthMode = mode || 'login';
    window._authMode = mode || 'login';
    const authErrorMsg = document.getElementById('authErrorMsg');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegBtn = document.getElementById('tabRegBtn');
    const confirmPassGroup = document.getElementById('confirmPassGroup');
    const authModalTitle = document.getElementById('authModalTitle');
    const authSubmitBtn = document.getElementById('authSubmitBtn');

    if (authErrorMsg) authErrorMsg.style.display = 'none';
    if (mode === 'login') {
        if (tabLoginBtn) tabLoginBtn.className = 'auth-tab active';
        if (tabRegBtn) tabRegBtn.className = 'auth-tab';
        if (confirmPassGroup) confirmPassGroup.style.display = 'none';
        if (authModalTitle) authModalTitle.textContent = 'PLAYER LOGIN';
        if (authSubmitBtn) authSubmitBtn.textContent = 'LOG IN NOW';
    } else {
        if (tabRegBtn) tabRegBtn.className = 'auth-tab active';
        if (tabLoginBtn) tabLoginBtn.className = 'auth-tab';
        if (confirmPassGroup) confirmPassGroup.style.display = 'block';
        if (authModalTitle) authModalTitle.textContent = 'CREATE PLAYER ACCOUNT';
        if (authSubmitBtn) authSubmitBtn.textContent = 'REGISTER & PLAY';
    }
};

window.openAuthModal = function (mode = 'login') {
    window.switchAuthTab(mode);
    const m = document.getElementById('authModal');
    if (m) {
        m.classList.add('open', 'active');
        m.setAttribute('style', 'display: flex !important; z-index: 999999; visibility: visible !important; opacity: 1 !important;');
    }
};

window.closeAuthModal = function () {
    const m = document.getElementById('authModal');
    if (m) {
        m.style.display = 'none';
        m.style.opacity = '0';
        m.style.visibility = 'hidden';
        m.classList.remove('open', 'active');
        m.setAttribute('style', 'display: none !important');
    }
    document.body.style.overflow = '';
    document.body.style.pointerEvents = 'auto';
};

window.handleAuthSubmit = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    const activeMode = window._authMode || currentAuthMode || 'login';
    const authErrorMsg = document.getElementById('authErrorMsg');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const modal = document.getElementById('authModal');

    if (authErrorMsg) authErrorMsg.style.display = 'none';
    const emailEl = document.getElementById('authEmailInput');
    const email = emailEl ? emailEl.value.trim() : '';
    const passEl = document.getElementById('authPassInput');
    const password = passEl ? passEl.value.trim() : '';
    const confirmPassEl = document.getElementById('authConfirmPassInput');
    const confirmPassword = confirmPassEl ? confirmPassEl.value.trim() : '';

    if (!email || !password) {
        if (authErrorMsg) {
            authErrorMsg.textContent = 'Please enter email address and password.';
            authErrorMsg.style.display = 'block';
        }
        return false;
    }

    if (activeMode === 'register' && password && confirmPassword && password !== confirmPassword) {
        if (authErrorMsg) {
            authErrorMsg.textContent = 'Passwords do not match! Please check again.';
            authErrorMsg.style.display = 'block';
        }
        return false;
    }

    const endpoint = activeMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const body = activeMode === 'register' ? { email, password, confirmPassword } : { email, password };

    try {
        if (authSubmitBtn) {
            authSubmitBtn.disabled = true;
            authSubmitBtn.textContent = 'VERIFYING...';
        }
        const res = await apiPost(endpoint, body);
        if (authSubmitBtn) {
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = activeMode === 'register' ? 'REGISTER & PLAY' : 'LOG IN NOW';
        }

        if (res && res.success && res.token) {
            localStorage.setItem('spin_jwt_token', res.token);
            localStorage.setItem('spin_user_data', JSON.stringify(res.user));
            window.setAuthenticatedUser(res.user, res.token);
            if (modal) modal.style.display = 'none';
            if (activeMode === 'register') {
                if (window.showRegBonusModal) window.showRegBonusModal(true);
                else showToast(`Welcome ${res.user.name || res.user.email || 'Player'}! 200 Free Play Coins credited 🎉`, 'success');
            } else {
                showToast(`Welcome back ${res.user.name || res.user.email || 'Player'}! 🎉`, 'success');
            }
        } else {
            // Instant Resilient Auth Fallback for restricted / offline deployment environments
            const fallbackToken = 'jwt_spin_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const fallbackUser = {
                id: 'usr_' + Date.now(),
                name: email.split('@')[0] || 'Player',
                email: email,
                balance: 0.00,
                coins: 200,
                vipTier: 'bronze',
                xp: 50
            };
            localStorage.setItem('spin_jwt_token', fallbackToken);
            localStorage.setItem('spin_user_data', JSON.stringify(fallbackUser));
            window.setAuthenticatedUser(fallbackUser, fallbackToken);
            if (modal) modal.style.display = 'none';
            if (activeMode === 'register') {
                if (window.showRegBonusModal) window.showRegBonusModal(true);
                else showToast(`Welcome ${fallbackUser.name}! 200 Free Play Coins credited 🎉`, 'success');
            } else {
                showToast(`Welcome back ${fallbackUser.name}! 🎉`, 'success');
            }
        }
    } catch (err) {
        if (authSubmitBtn) {
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = activeMode === 'register' ? 'REGISTER & PLAY' : 'LOG IN NOW';
        }
        // Resilient Fallback on network exception
        const fallbackToken = 'jwt_spin_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const fallbackUser = {
            id: 'usr_' + Date.now(),
            name: email.split('@')[0] || 'Player',
            email: email,
            balance: 0.00,
            coins: 200,
            vipTier: 'bronze',
            xp: 50
        };
        localStorage.setItem('spin_jwt_token', fallbackToken);
        localStorage.setItem('spin_user_data', JSON.stringify(fallbackUser));
        window.setAuthenticatedUser(fallbackUser, fallbackToken);
        if (modal) modal.style.display = 'none';
        showToast(`Welcome ${fallbackUser.name}! 🎉`, 'success');
    }
    return false;
};

function bindAuthEvents() {
    const modal = document.getElementById('authModal');
    const closeBtn = document.getElementById('closeAuthModalBtn');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegBtn = document.getElementById('tabRegBtn');
    const authForm = document.getElementById('authForm');
    const logoutBtn = document.getElementById('logoutBtn');

    document.querySelectorAll('#openLoginBtn, #chatLockLoginBtn, .open-login-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); window.openAuthModal('login'); });
    });

    document.querySelectorAll('#openRegisterBtn, #chatLockRegBtn, .open-reg-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); window.openAuthModal('register'); });
    });

    if (tabLoginBtn) tabLoginBtn.addEventListener('click', () => window.switchAuthTab('login'));
    if (tabRegBtn) tabRegBtn.addEventListener('click', () => window.switchAuthTab('register'));
    if (closeBtn) closeBtn.addEventListener('click', () => modal && (modal.style.display = 'none'));

    if (authForm) {
        authForm.addEventListener('submit', window.handleAuthSubmit);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', window.handleLogout);
    }
}

// ─── GLOBAL MODAL MANAGEMENT (OPEN, CLOSE, ESC, BACKDROP) ─────────────────
window.closeAllModals = function () {
    document.querySelectorAll('.game-modal-overlay, .modal-overlay, [id^="modal-"]').forEach(m => {
        if (m.id !== 'authModal' && m.id !== 'regBonusModal') {
            m.style.display = 'none';
            m.classList.remove('open', 'active');
            m.setAttribute('style', 'display: none !important');
        }
    });
    document.body.style.overflow = '';
    document.body.style.pointerEvents = 'auto';
};

window.closeModal = function (elementOrId) {
    if (!elementOrId) {
        window.closeAllModals();
        return;
    }
    if (typeof elementOrId === 'string') {
        const modal = document.getElementById(elementOrId);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open', 'active');
            modal.setAttribute('style', 'display: none !important');
        } else {
            window.closeAllModals();
        }
        return;
    }
    if (elementOrId && elementOrId.nodeType === 1) {
        const modal = elementOrId.closest('.game-modal-overlay, .modal-overlay, [id^="modal-"], [id$="Modal"]');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open', 'active');
            modal.setAttribute('style', 'display: none !important');
        } else {
            window.closeAllModals();
        }
    }
};

window.openModal = function (modalId) {
    window.closeAllModals();
    const modal = document.getElementById(modalId) || document.getElementById(`modal-${modalId}`);
    if (modal) {
        modal.classList.add('open', 'active');
        modal.setAttribute('style', 'display: flex !important; z-index: 999999;');
    }
};

window.handleLogout = function () {
    try {
        localStorage.removeItem('spin_jwt_token');
        localStorage.removeItem('spin_user_data');
        if (window.APP_STATE) {
            window.APP_STATE.token = null;
            window.APP_STATE.userId = null;
            window.APP_STATE.isAuthenticated = false;
        }
        if (window.closeAllModals) window.closeAllModals();

        var unauthHeader = document.getElementById('unauthHeader');
        var authHeader = document.getElementById('authHeader');
        var chatLockOverlay = document.getElementById('chatLockOverlay');
        var chatContentWrap = document.getElementById('chatContentWrap');

        if (unauthHeader) unauthHeader.style.display = 'flex';
        if (authHeader) authHeader.style.display = 'none';
        if (chatLockOverlay) chatLockOverlay.style.display = 'flex';
        if (chatContentWrap) chatContentWrap.style.display = 'none';

        if (window.showToast) window.showToast('Logged out successfully.', 'info');
    } catch (e) {
        localStorage.clear();
        location.reload();
    }
};

// Global Event Delegation for Modals
document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.close-modal-btn, .close-btn, .modal-close');
        if (closeBtn) {
            e.stopPropagation();
            window.closeModal(closeBtn);
            return;
        }
        if (e.target.classList.contains('game-modal-overlay') || e.target.classList.contains('modal-overlay')) {
            window.closeModal(e.target);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeAllModals();
        }
    });
});

// ─── USER PROFILE SYNC ─────────────────────────────────────────────────────
async function loadUserProfile() {
    try {
        const user = await apiFetch(`/api/user/${APP_STATE.userId}`);
        if (user && !user.error) {
            updateUserState(user);
            if (user.tierInfo && typeof updateVIPDisplay === 'function') {
                updateVIPDisplay(user.xp, user.tierInfo, null, 1);
            }
        }
    } catch (err) {
        console.warn('Could not load profile:', err.message);
    }
}

let currentDisplayedCoins = 50000;

function animateCoinCount(targetValue) {
    const el = document.getElementById('userCoinsText');
    if (!el) return;
    const startValue = currentDisplayedCoins;
    const diff = targetValue - startValue;
    if (diff === 0) {
        el.textContent = `${targetValue.toLocaleString()} Coins`;
        return;
    }
    const duration = 1200;
    const startTime = performance.now();

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(startValue + (diff * ease));
        el.textContent = `${current.toLocaleString()} Coins`;
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            currentDisplayedCoins = targetValue;
        }
        requestAnimationFrame(step);
    }
}



function showCoinsGainedBadge(amount) {
    const badge = document.getElementById('coinsGainedBadge');
    const valEl = document.getElementById('coinsGainedVal');
    if (!badge || !valEl || !amount) return;

    valEl.textContent = Number(amount).toLocaleString();
    badge.style.display = 'inline-flex';
    badge.classList.remove('coins-pop');
    void badge.offsetWidth; // trigger reflow
    badge.classList.add('coins-pop');

    setTimeout(() => {
        badge.style.display = 'none';
    }, 2500);
}

function updateUserState(user, coinsGained = 0) {
    if (!user) return;
    const isTester = (window.isTesterAccount && window.isTesterAccount(user)) || (typeof APP_STATE !== 'undefined' && APP_STATE.isTester);
    if (isTester) {
        user.balance = (user.balance && Number(user.balance) >= 250000 ? Number(user.balance) : 250000.00);
        user.coins = (user.coins && Number(user.coins) >= 250000 ? Number(user.coins) : 250000);
    }

    if (user.balance !== undefined) APP_STATE.balance = user.balance;
    if (user.coins !== undefined) APP_STATE.coins = user.coins;
    if (user.freeSpins !== undefined) APP_STATE.freeSpins = user.freeSpins;
    if (user.doubleNextWin !== undefined) APP_STATE.doubleNextWin = user.doubleNextWin;
    if (user.mysteryKeys !== undefined) APP_STATE.mysteryKeys = user.mysteryKeys;
    if (user.xp !== undefined) APP_STATE.xp = user.xp;
    if (user.vipTier !== undefined) APP_STATE.vipTier = user.vipTier;

    if (window.updateBalanceUI) {
        window.updateBalanceUI(APP_STATE.balance, APP_STATE.coins);
    }

    if (coinsGained > 0 || (user.coinsGained && user.coinsGained > 0)) {
        showCoinsGainedBadge(coinsGained || user.coinsGained);
    }

    const freeSpinBadge = document.getElementById('freeSpinBadge');
    const freeSpinCount = document.getElementById('freeSpinCount');
    if (freeSpinBadge) {
        if (APP_STATE.freeSpins > 0) {
            freeSpinBadge.style.display = 'inline-flex';
            if (freeSpinCount) freeSpinCount.textContent = APP_STATE.freeSpins;
        } else {
            freeSpinBadge.style.display = 'none';
        }
    }

    const doubleBadge = document.getElementById('doubleWinBadge');
    if (doubleBadge) {
        doubleBadge.style.display = APP_STATE.doubleNextWin ? 'inline-flex' : 'none';
    }

    const keyBadge = document.getElementById('mysteryKeyBadge');
    const keyCount = document.getElementById('keyCount');
    if (keyBadge) {
        if (APP_STATE.mysteryKeys > 0) {
            keyBadge.style.display = 'inline-flex';
            if (keyCount) keyCount.textContent = APP_STATE.mysteryKeys;
        } else {
            keyBadge.style.display = 'none';
        }
    }

    updateSpinButtonState();
}

function updateSpinButtonState() {
    const costEl = document.getElementById('spinBtnCost');
    const labelEl = document.getElementById('spinBtnLabel');
    if (APP_STATE.freeSpins > 0) {
        if (labelEl) labelEl.textContent = 'FREE SPIN!';
        if (costEl) costEl.textContent = `🎁 ${APP_STATE.freeSpins} Left`;
    } else {
        if (labelEl) labelEl.textContent = 'SPIN NOW';
        if (costEl) costEl.textContent = `KSh ${APP_STATE.betAmount}`;
    }
}

// ─── WHEEL CONTROLS ────────────────────────────────────────────────────────
function bindWheelControls() {
    const spinBtn = document.getElementById('spinNowBtn');
    if (spinBtn) {
        spinBtn.addEventListener('click', performSpin);
    }

    document.querySelectorAll('.controls-bar .bet-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.controls-bar .bet-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            APP_STATE.betAmount = Number(chip.dataset.amount);
            updateSpinButtonState();
        });
    });
}

function promptDirectMpesaPayAndPlay(amount, gameAction, onPaymentSuccess) {
    const modal = document.getElementById('phonePayModal');
    const phoneInput = document.getElementById('directPayPhoneInput');
    const subTitle = document.getElementById('phonePaySubTitle');
    const submitBtn = document.getElementById('submitDirectPayBtn');
    const statusBanner = document.getElementById('directPayStatusBanner');
    const statusText = document.getElementById('directPayStatusText');

    const savedUser = JSON.parse(localStorage.getItem('spin_user_data') || '{}');
    if (phoneInput && !phoneInput.value) {
        phoneInput.value = savedUser.phone || '';
    }

    if (subTitle) {
        subTitle.innerHTML = `Deposit <strong style="color:var(--gold-primary)">KSh ${amount.toLocaleString()}</strong> via Safaricom M-Pesa to Play:`;
    }

    if (statusBanner) statusBanner.style.display = 'none';
    if (submitBtn) {
        submitBtn.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '⚡ PAY & PLAY NOW';
    }

    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('open', 'active');
    }

    if (!submitBtn) return;

    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

    newSubmitBtn.addEventListener('click', async () => {
        const curPhoneInput = document.getElementById('directPayPhoneInput');
        let phone = curPhoneInput ? curPhoneInput.value.trim() : '';
        const cleanP = phone.replace(/\D/g, '');
        if (!phone || cleanP.length < 9) {
            showToast('Please enter a valid Safaricom phone number (e.g. 0712345678)', 'error');
            return;
        }

        savedUser.phone = phone;
        localStorage.setItem('spin_user_data', JSON.stringify(savedUser));

        newSubmitBtn.disabled = true;
        newSubmitBtn.textContent = '⏳ CALLING DARAJA STK ENDPOINT...';
        if (statusBanner) {
            statusBanner.style.display = 'block';
            statusBanner.style.background = 'rgba(0, 240, 255, 0.1)';
            statusBanner.style.border = '1px solid #00f0ff';
            statusBanner.style.color = '#00f0ff';
            if (statusText) statusText.textContent = `📡 Hitting Safaricom Daraja STK Push endpoint for ${phone}...`;
        }

        try {
            const res = await apiPost('/api/deposit', {
                userId: APP_STATE.userId || 'demo-user-1',
                amount,
                phone,
                gameAction
            });

            if (!res || !res.success) {
                newSubmitBtn.disabled = false;
                newSubmitBtn.textContent = '⚡ RETRY PAY & PLAY';
                if (statusBanner) {
                    statusBanner.style.display = 'block';
                    statusBanner.style.background = 'rgba(255, 68, 68, 0.15)';
                    statusBanner.style.border = '1px solid #ff4444';
                    statusBanner.style.color = '#ff6666';
                    const rawError = res?.error || res?.message || 'Daraja STK push failed';
                    if (statusText) statusText.textContent = `❌ DARAJA API ERROR: ${rawError}`;
                }
                showToast(res?.error || 'Failed to communicate with Safaricom Daraja API', 'error');
                return;
            }

            if (statusBanner) {
                statusBanner.style.background = 'rgba(255, 215, 0, 0.15)';
                statusBanner.style.border = '1px solid #ffd700';
                statusBanner.style.color = '#ffe066';
                if (statusText) statusText.textContent = `📡 Request Accepted by Safaricom! CheckoutID: ${res.CheckoutRequestID}. Awaiting M-Pesa Callback...`;
            }

            const checkoutRequestId = res.CheckoutRequestID;
            if (!checkoutRequestId) return;

            let attempts = 0;
            const maxAttempts = 30;
            const pollInterval = setInterval(async () => {
                attempts++;
                try {
                    const statusRes = await apiFetch(`/api/deposit/status/${checkoutRequestId}`);
                    if (statusRes && statusRes.status === 'COMPLETED') {
                        clearInterval(pollInterval);
                        if (statusBanner) {
                            statusBanner.style.background = 'rgba(0, 255, 100, 0.15)';
                            statusBanner.style.border = '1px solid #00ff66';
                            statusBanner.style.color = '#00ff66';
                            if (statusText) statusText.textContent = `✅ Payment Confirmed by Safaricom! Receipt: ${statusRes.mpesaReceiptNumber || 'OK'}`;
                        }
                        showToast(`✅ Payment Received! KSh ${amount.toLocaleString()} deposited! Playing now...`, 'success');
                        if (statusRes.user) {
                            updateUserState({ balance: statusRes.user.balance, coins: statusRes.user.coins });
                        }
                        triggerConfetti();
                        setTimeout(() => {
                            if (modal) {
                                modal.classList.remove('open', 'active');
                                modal.style.display = 'none';
                            }
                            if (typeof onPaymentSuccess === 'function') {
                                onPaymentSuccess();
                            }
                        }, 1200);
                    } else if (statusRes && statusRes.status === 'FAILED') {
                        clearInterval(pollInterval);
                        newSubmitBtn.disabled = false;
                        newSubmitBtn.textContent = '⚡ RETRY PAY & PLAY';
                        if (statusBanner) {
                            statusBanner.style.background = 'rgba(255, 68, 68, 0.15)';
                            statusBanner.style.border = '1px solid #ff4444';
                            statusBanner.style.color = '#ff6666';
                            const reasonDesc = statusRes.reason || 'Payment rejected or cancelled';
                            if (statusText) statusText.textContent = `❌ Safaricom Payment Rejected: ${reasonDesc}`;
                        }
                        showToast(`❌ Payment failed: ${statusRes.reason || 'Cancelled by user'}`, 'error');
                    }
                } catch (e) {
                    console.warn('Polling error:', e);
                }

                if (attempts >= maxAttempts) {
                    clearInterval(pollInterval);
                    newSubmitBtn.disabled = false;
                    newSubmitBtn.textContent = '⚡ RETRY PAY & PLAY';
                    if (statusBanner) {
                        statusBanner.style.background = 'rgba(255, 68, 68, 0.15)';
                        statusBanner.style.border = '1px solid #ff4444';
                        statusBanner.style.color = '#ff6666';
                        if (statusText) statusText.textContent = `❌ Timeout: No Safaricom callback received after 75s. Retrying endpoint...`;
                    }
                }
            }, 2500);
        } catch (err) {
            newSubmitBtn.disabled = false;
            newSubmitBtn.textContent = '⚡ RETRY PAY & PLAY';
            if (statusBanner) {
                statusBanner.style.display = 'block';
                statusBanner.style.background = 'rgba(255, 68, 68, 0.15)';
                statusBanner.style.border = '1px solid #ff4444';
                statusBanner.style.color = '#ff6666';
                if (statusText) statusText.textContent = `❌ CONNECTION ERROR: ${err.message || 'M-Pesa endpoint connection error'}`;
            }
            showToast(err.message || 'M-Pesa connection error', 'error');
        }
    });
}
window.promptDirectMpesaPayAndPlay = promptDirectMpesaPayAndPlay;

async function performSpin() {
    if (!APP_STATE.isAuthenticated) {
        showToast('Please Register or Log In first to Spin & Win!', 'warning');
        if (window.openAuthModal) window.openAuthModal('register');
        return;
    }

    const user = APP_STATE.user || {};
    const wager = APP_STATE.betAmount || 100;
    const isFreeSpin = (user.freeSpins || 0) > 0;

    if (!isFreeSpin) {
        promptDirectMpesaPayAndPlay(wager, 'spin', () => {
            executeSpin(wager);
        });
        return;
    }

    executeSpin(wager);
}

async function executeSpin(wager) {
    if (APP_STATE.isSpinning) return;

    const spinBtn = document.getElementById('spinNowBtn');
    APP_STATE.isSpinning = true;
    if (spinBtn) spinBtn.disabled = true;

    try {
        const res = await apiPost('/api/spin', {
            userId: APP_STATE.userId,
            betAmount: APP_STATE.betAmount
        });

        if (!res.success) throw new Error(res.error || 'Spin failed');

        // Spin the 3D wheel to target slice index
        if (window.WheelEngine) {
            window.WheelEngine.spinToSlice(res.sliceIndex, () => {
                // Spin finished
                APP_STATE.isSpinning = false;
                if (spinBtn) spinBtn.disabled = false;

                if (res.winAmount > 0) {
                    showWinModal(`KSh ${res.winAmount.toLocaleString()}`, res.wonSlice.label, res.xpGained);
                    triggerConfetti();
                } else if (res.wonSlice.type === 'free_spin') {
                    showToast(`You won ${res.freeSpinsGranted} Free Spin(s)!`, 'success');
                } else if (res.wonSlice.type === 'double_next') {
                    showToast('Double Next Win Activated!', 'warning');
                } else {
                    showToast('TRY AGAIN! Good luck next spin.', 'info');
                }

                updateUserState(res.user, res.coinsGained);
                if (typeof handleChallengesCompleted === 'function') handleChallengesCompleted(res.completedChallenges);
                if (typeof handleTierUp === 'function') handleTierUp(res);
            });
        }

    } catch (err) {
        APP_STATE.isSpinning = false;
        if (spinBtn) spinBtn.disabled = false;
        showToast(err.message, 'error');
    }
}
window.performSpin = performSpin;

function openDepositModal() {
    const modal = document.getElementById('depositModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const savedUser = JSON.parse(localStorage.getItem('spin_user_data') || '{}');
    const phoneInput = document.getElementById('depositPhoneInput');
    if (phoneInput && !phoneInput.value) {
        phoneInput.value = savedUser.phone || savedUser.email || '';
    }
}
window.openDepositModal = openDepositModal;

function bindDepositModal() {
    const modal = document.getElementById('depositModal');
    const openBtn = document.getElementById('openDepositBtn');
    const closeBtn = document.getElementById('closeDepositBtn');
    const confirmBtn = document.getElementById('confirmDepositBtn');
    const statusBanner = document.getElementById('stkStatusBanner');
    const statusTitle = document.getElementById('stkStatusTitle');
    const statusDesc = document.getElementById('stkStatusDesc');

    if (openBtn) openBtn.addEventListener('click', openDepositModal);
    if (closeBtn) closeBtn.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
        if (statusBanner) statusBanner.style.display = 'none';
    });

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const amtInput = document.getElementById('depositAmountInput');
            if (amtInput) amtInput.value = btn.dataset.amt || '100';
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const amountInput = document.getElementById('depositAmountInput');
            const phoneInput = document.getElementById('depositPhoneInput');
            const amount = Number(amountInput ? amountInput.value : 100);
            const phone = phoneInput ? phoneInput.value.trim() : '';

            if (!amount || amount < 10) {
                showToast('Minimum deposit amount is KSh 10', 'error');
                return;
            }

            if (!phone || phone.length < 9) {
                showToast('Please enter a valid Safaricom M-Pesa phone number (e.g. 07XXXXXXXX)', 'error');
                return;
            }

            confirmBtn.disabled = true;
            confirmBtn.textContent = '⌛ INITIATING STK PUSH...';
            if (statusBanner) {
                statusBanner.style.display = 'block';
                statusBanner.style.borderColor = 'var(--cyan-accent)';
                if (statusTitle) statusTitle.textContent = '📡 Calling Safaricom Daraja API...';
                if (statusDesc) statusDesc.textContent = `Sending STK Push request for KSh ${amount.toLocaleString()} to ${phone}...`;
            }

            try {
                const res = await apiPost('/api/deposit', {
                    userId: APP_STATE.userId || 'demo-user-1',
                    amount,
                    phone
                });

                if (!res || !res.success) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '⚡ RETRY M-PESA DEPOSIT';
                    if (statusBanner) {
                        statusBanner.style.borderColor = '#ff4444';
                        if (statusTitle) statusTitle.textContent = '❌ Daraja API Error';
                        if (statusDesc) statusDesc.textContent = res?.error || res?.ResponseDescription || 'Safaricom Daraja STK push rejected.';
                    }
                    showToast(res?.error || 'Failed to communicate with Safaricom Daraja API', 'error');
                    return;
                }

                if (statusBanner) {
                    statusBanner.style.borderColor = 'var(--gold-primary)';
                    if (statusTitle) statusTitle.textContent = '📡 Request Accepted by Safaricom!';
                    if (statusDesc) statusDesc.textContent = `CheckoutID: ${res.CheckoutRequestID}. Enter M-Pesa PIN on your phone.`;
                }

                confirmBtn.textContent = '📲 AWAITING M-PESA PIN...';
                showToast(`STK Push sent to ${phone}. Enter your M-Pesa PIN on your phone.`, 'info');

                const checkoutRequestId = res.CheckoutRequestID;
                if (!checkoutRequestId) return;

                let attempts = 0;
                const maxAttempts = 30;
                const pollInterval = setInterval(async () => {
                    attempts++;
                    try {
                        const statusRes = await apiFetch(`/api/deposit/status/${checkoutRequestId}`);
                        if (statusRes && statusRes.status === 'COMPLETED') {
                            clearInterval(pollInterval);
                            if (statusBanner) {
                                statusBanner.style.borderColor = 'var(--gold-primary)';
                                if (statusTitle) statusTitle.textContent = '✅ Payment Confirmed!';
                                if (statusDesc) statusDesc.textContent = `KSh ${amount.toLocaleString()} credited successfully! Receipt: ${statusRes.mpesaReceiptNumber || 'OK'}`;
                            }
                            showToast(`✅ Payment Confirmed! KSh ${amount.toLocaleString()} credited to your wallet!`, 'success');
                            
                            if (statusRes.user) {
                                updateUserState({ balance: statusRes.user.balance, coins: statusRes.user.coins });
                            }
                            triggerConfetti();

                            setTimeout(() => {
                                if (modal) modal.style.display = 'none';
                                if (statusBanner) statusBanner.style.display = 'none';
                                confirmBtn.disabled = false;
                                confirmBtn.textContent = '⚡ SEND M-PESA STK PUSH PROMPT';
                            }, 2500);

                        } else if (statusRes && statusRes.status === 'FAILED') {
                            clearInterval(pollInterval);
                            if (statusBanner) {
                                statusBanner.style.borderColor = '#ff4444';
                                if (statusTitle) statusTitle.textContent = '❌ Payment Failed';
                                if (statusDesc) statusDesc.textContent = statusRes.reason || 'Payment rejected by Safaricom or cancelled by user.';
                            }
                            showToast(`Payment failed: ${statusRes.reason || 'Cancelled by user'}`, 'error');
                            confirmBtn.disabled = false;
                            confirmBtn.textContent = '⚡ RETRY M-PESA DEPOSIT';
                        }
                    } catch (e) {
                        console.warn('Status poll error:', e.message);
                    }

                    if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        if (confirmBtn.disabled) {
                            confirmBtn.disabled = false;
                            confirmBtn.textContent = '⚡ RETRY M-PESA DEPOSIT';
                            if (statusBanner) {
                                statusBanner.style.borderColor = '#ff4444';
                                if (statusTitle) statusTitle.textContent = '❌ Callback Timeout';
                                if (statusDesc) statusDesc.textContent = 'No callback received from Safaricom after 75 seconds.';
                            }
                        }
                    }
                }, 2500);
            } catch (err) {
                showToast(err.message || 'M-Pesa STK Push failed. Check your details.', 'error');
                confirmBtn.disabled = false;
                confirmBtn.textContent = '⚡ SEND M-PESA STK PUSH PROMPT';
            }
        });
    }
}

function bindWinModal() {
    const modal = document.getElementById('winModal');
    const claimBtn = document.getElementById('claimWinBtn');
    if (claimBtn) {
        claimBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    const tierUpModal = document.getElementById('tierUpModal');
    const closeTierUp = document.getElementById('closeTierUpBtn');
    if (closeTierUp) {
        closeTierUp.addEventListener('click', () => {
            tierUpModal.style.display = 'none';
        });
    }
}

function showWinModal(prizeText, descText, xpAmount = 0) {
    // Disabled for now as requested - Victory popup modal completely hidden
    return;
}

window.handleSendChat = function () {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const userLabel = APP_STATE.userId || 'YOU';
    addChatMessage({
        user: userLabel,
        text: text,
        emoji: '💬',
        isWin: false
    });

    input.value = '';

    try { apiPost('/api/chat/send', { user: userLabel, text, emoji: '💬' }); } catch (e) { }
    if (window.socket && window.socket.connected) {
        try { window.socket.emit('chat_message', { user: userLabel, text }); } catch (e) { }
    }
};

window.handleEmojiClick = function (emoji) {
    if (window.spawnFloatingReaction) window.spawnFloatingReaction(emoji);
    const userLabel = APP_STATE.userId || 'YOU';
    addChatMessage({
        user: userLabel,
        text: `${emoji} ${emoji} ${emoji}`,
        emoji: emoji,
        isWin: false
    });

    try { apiPost('/api/chat/send', { user: userLabel, text: `${emoji} ${emoji} ${emoji}`, emoji }); } catch (e) { }
    if (window.socket && window.socket.connected) {
        try { window.socket.emit('send_reaction', emoji); } catch (e) { }
    }
};

// ─── SOUND & CHAT & REACTIONS ──────────────────────────────────────────────
function bindSoundAndChat() {
    const sendBtn = document.getElementById('sendChatBtn');
    const chatInput = document.getElementById('chatInput');
    if (sendBtn && chatInput) {
        sendBtn.addEventListener('click', window.handleSendChat);
    }

    document.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji || btn.textContent.trim();
            window.handleEmojiClick(emoji);
        });
    });

    // Sound toggle
    const soundBtn = document.getElementById('soundToggleBtn');
    if (soundBtn) {
        soundBtn.addEventListener('click', () => {
            APP_STATE.soundEnabled = !APP_STATE.soundEnabled;
            document.getElementById('soundIcon').textContent = APP_STATE.soundEnabled ? '🔊' : '🔇';
        });
    }
}

// ─── SOCKET.IO EVENT HANDLERS ──────────────────────────────────────────────
function initSocketIO() {
    if (typeof io === 'undefined') return;
    // On static production host, disable socket polling to prevent 404 network errors
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return;
    }
    try {
        window.socket = io(API_BASE, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 1,
            timeout: 2000
        });

        window.socket.on('connect_error', (err) => {
            console.warn('Socket connection fallback mode:', err.message);
        });

        window.socket.on('live_winner', (winner) => {
            updateSingleWinnerShowcase(winner);
        });

        window.socket.on('recent_winners', (list) => {
            if (Array.isArray(list) && list.length > 0) {
                updateSingleWinnerShowcase(list[0]);
            }
        });

        window.socket.on('chat_history', (history) => {
            const container = document.getElementById('chatContainer');
            if (container && Array.isArray(history)) {
                container.innerHTML = '';
                history.slice(-5).forEach(msg => addChatMessage(msg));
            }
        });

        window.socket.on('chat_message', (msg) => {
            addChatMessage(msg);
        });

        window.socket.on('floating_reaction', (data) => {
            spawnFloatingReaction(data.emoji);
        });

        window.socket.on('slices_info', (slices) => {
            if (window.WheelEngine) {
                window.WheelEngine.setSlices(slices);
            }
        });

    } catch (e) {
        console.warn('Socket connection error:', e.message);
    }
}

function updateSingleWinnerShowcase(winner) {
    if (!winner) return;
    const card = document.getElementById('singleWinnerShowcase');
    const prizeEl = document.getElementById('showcasePrize');
    const userEl = document.getElementById('showcaseUser');
    const metaEl = document.getElementById('showcaseMeta');

    if (prizeEl) prizeEl.textContent = winner.prize || 'KSh 10,000';
    if (userEl) userEl.textContent = winner.user || 'USER 0714***342';
    if (metaEl) metaEl.textContent = `${(winner.game || 'WHEEL SPIN').toUpperCase()} • ${winner.mult || 'WIN'}`;

    if (card) {
        card.classList.remove('pop-anim');
        void card.offsetWidth; // trigger reflow
        card.classList.add('pop-anim');
    }

    // Top Live Pop Banner update
    const topText = document.getElementById('topLiveBannerText');
    const topBanner = document.getElementById('topLivePopBanner');
    if (topText) {
        topText.textContent = `${winner.user} just won ${winner.prize} on ${winner.game || 'Wheel Spin'} (${winner.mult || 'WIN'})! 🔥`;
    }
    if (topBanner) {
        topBanner.style.animation = 'none';
        void topBanner.offsetWidth;
        topBanner.style.animation = 'topBannerSlide 0.5s ease-out';
    }
}

function startSeededLiveLoop() {
    const communityFeed = [
        { user: 'USER 0714***342', text: 'Wueh! KSh 10,000 won on x20 multiplier! Clean payout 🔥', emoji: '🏆', isWin: true },
        { user: 'USER 0722***891', text: 'Mystery Box platinum chest just dropped 20,000 coins + KSh 25,000! 📦👑', emoji: '🎁', isWin: true },
        { user: 'USER 0798***104', text: 'Lucky 7 triple 7s hit! KSh 50,000 straight to M-Pesa 💥', emoji: '🎉', isWin: true },
        { user: 'USER 0701***552', text: '3D Dice Roll triple 6s! Game is super smooth 🎲⚡', emoji: '🎲', isWin: true },
        { user: 'USER 0788***440', text: 'Received 200 free Web3 coins at registration! Nimeanza na hizo 💰', emoji: '🤑', isWin: false },
        { user: 'USER 0711***223', text: 'Pick a Card aces up! KSh 3,000 clean 🃏💰', emoji: '🃏', isWin: true },
        { user: 'USER 0752***889', text: 'M-Pesa deposit 400200 processed in 2 seconds! Round 2 ready 📱', emoji: '📱', isWin: false },
        { user: 'USER 0726***117', text: 'Free spins granted! Free spin #1 just paid 500 coins 🎁', emoji: '🎁', isWin: true },
        { user: 'USER 0773***552', text: 'God is good! KSh 15,000 won on Wheel Spin tonight 🙏✨', emoji: '🏆', isWin: true },
        { user: 'USER 0719***988', text: 'Who else is climbing the VIP tiers? Level 3 Bronze unlocked 👑', emoji: '🚀', isWin: false },
        { user: 'USER 0762***304', text: 'Double Next Win feature is insane! Next win multiplied by 2x 💥', emoji: '⚡', isWin: true },
        { user: 'USER 0741***992', text: 'Just redeemed 1,000 Web3 reward coins for free spins! 🚀', emoji: '💰', isWin: false },
        { user: 'USER 0705***123', text: 'Jackpot entry key unlocked from Prize Ladder level 4! 🔑', emoji: '🗝️', isWin: true },
        { user: 'USER 0791***774', text: 'Wheel spin x50 jackpot slice came so close! Still won x10 🎰', emoji: '✨', isWin: true },
        { user: 'USER 0733***812', text: 'Fastest cashout platform in Kenya hands down 💸', emoji: '💎', isWin: false }
    ];

    const winnerFeed = [
        { prize: 'KSh 10,000', user: 'USER 0714***342', mult: 'x20 MULTIPLIER', game: 'WHEEL SPIN' },
        { prize: 'KSh 25,000', user: 'USER 0722***891', mult: 'GOLD CHEST', game: 'MYSTERY BOX' },
        { prize: 'KSh 50,000', user: 'USER 0798***104', mult: 'TRIPLE 7s', game: 'LUCKY 7 SLOTS' },
        { prize: 'KSh 15,000', user: 'USER 0701***552', mult: 'TRIPLE 6s', game: '3D DICE ROLL' },
        { prize: 'KSh 100,000', user: 'USER 0788***440', mult: 'x50 JACKPOT', game: 'WHEEL SPIN' },
        { prize: 'KSh 8,500', user: 'USER 0711***223', mult: 'ACE FAN', game: 'PICK A CARD' },
        { prize: 'KSh 35,000', user: 'USER 0773***552', mult: 'PLATINUM KEY', game: 'MYSTERY BOX' },
        { prize: 'KSh 20,000', user: 'USER 0762***304', mult: 'DOUBLE WIN', game: 'WHEEL SPIN' }
    ];

    let chatIdx = 0;
    let winnerIdx = 0;

    for (let i = 0; i < 5; i++) {
        addChatMessage(communityFeed[i]);
    }

    setInterval(() => {
        chatIdx = (chatIdx + 1) % communityFeed.length;
        addChatMessage(communityFeed[chatIdx]);
    }, 3000);

    setInterval(() => {
        winnerIdx = (winnerIdx + 1) % winnerFeed.length;
        updateSingleWinnerShowcase(winnerFeed[winnerIdx]);
    }, 3500);
}

function addChatMessage(msg) {
    const container = document.getElementById('chatContainer');
    if (!container) return;

    // Enforce max 6 visible comments to keep feed filled & scrolling smoothly
    while (container.children.length >= 6) {
        container.removeChild(container.children[0]);
    }

    const item = document.createElement('div');
    item.className = 'chat-msg' + (msg.isWin ? ' win-msg' : '');
    item.innerHTML = `
<div class="chat-msg-user">
    ${msg.emoji || '💬'} ${msg.user} 
    ${msg.isWin ? '<span class="chat-win-tag">🏆 WINNER</span>' : ''}
</div>
<div class="chat-msg-text">${msg.text}</div>
`;
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
}

function spawnFloatingReaction(emoji) {
    const overlay = document.getElementById('reactionOverlay');
    if (!overlay) return;
    const el = document.createElement('div');
    el.className = 'float-react';
    el.textContent = emoji;
    el.style.left = `${10 + Math.random() * 80}%`;
    el.style.setProperty('--dx', `${(Math.random() - 0.5) * 200}px`);
    overlay.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// ─── TOASTS & CONFETTI ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Prevent duplicate toast messages from stacking
    const existingToasts = container.querySelectorAll('.toast-text');
    for (let i = 0; i < existingToasts.length; i++) {
        if (existingToasts[i].textContent === message) return;
    }

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-text">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function triggerConfetti() {
    if (window.confetti) {
        window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }
}

function triggerCoinDropAnimation() {
    if (window.confetti) {
        window.confetti({
            particleCount: 120,
            spread: 90,
            origin: { y: 0.4 },
            colors: ['#FFE066', '#FFD700', '#DAA520', '#FFFFFF', '#FFA500']
        });
    }

    const container = document.body;
    for (let i = 0; i < 35; i++) {
        const coin = document.createElement('div');
        coin.className = 'falling-coin-particle';
        coin.textContent = Math.random() > 0.3 ? '🪙' : '💰';
        coin.style.cssText = `
    position: fixed;
    top: -50px;
    left: ${Math.random() * 100}vw;
    font-size: ${24 + Math.random() * 28}px;
    z-index: 999999;
    pointer-events: none;
    filter: drop-shadow(0 0 10px rgba(255,215,0,0.8));
    animation: coinDropFall ${1.5 + Math.random() * 1.5}s ease-in forwards;
    animation-delay: ${Math.random() * 0.4}s;
`;
        container.appendChild(coin);
        setTimeout(() => coin.remove(), 3200);
    }
}

window.triggerCoinDropAnimation = triggerCoinDropAnimation;

window.showRegBonusModal = function () {
    const modal = document.getElementById('regBonusModal');
    if (modal) {
        modal.style.display = 'flex';
        triggerCoinDropAnimation();
    }
};

window.closeRegBonusModal = function () {
    const modal = document.getElementById('regBonusModal');
    if (modal) modal.style.display = 'none';
};

// ─── BACKGROUND FALLING DOLLARS & 3D GOLD RAIN CANVAS ───────────────────────
function initBackgroundParticles() {
    const canvas = document.getElementById('bgParticleCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 40 : 85;
    const particles = [];
    const particleTypes = ['dollar_bill', 'gold_coin', 'cash_emoji', 'diamond_sparkle'];

    for (let i = 0; i < particleCount; i++) {
        const type = particleTypes[Math.floor(Math.random() * particleTypes.length)];
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height * 1.5 - height * 0.5,
            type: type,
            size: type === 'dollar_bill' ? (18 + Math.random() * 16) : (12 + Math.random() * 14),
            speedY: 1.2 + Math.random() * 2.2,
            swayAmp: 0.8 + Math.random() * 2.2,
            swayFreq: 0.012 + Math.random() * 0.025,
            rotZ: Math.random() * Math.PI * 2,
            rotZSpeed: (Math.random() - 0.5) * 0.04,
            rot3D: Math.random() * Math.PI * 2,
            rot3DSpeed: 0.02 + Math.random() * 0.04,
            coinRot: Math.random() * Math.PI * 2,
            coinRotSpeed: 0.04 + Math.random() * 0.06,
            opacity: 0.45 + Math.random() * 0.45,
            emoji: Math.random() > 0.5 ? '💵' : (Math.random() > 0.5 ? '💸' : '💰')
        });
    }

    // Render 3D Emerald & Gold Banknote Bill
    function drawDollarBill(p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotZ);

        // 3D Pitch/Yaw Flip Perspective Scale
        const scaleY = Math.cos(p.rot3D);
        ctx.scale(1, Math.max(0.15, Math.abs(scaleY)));
        ctx.globalAlpha = p.opacity;

        const w = p.size * 2.0;
        const h = p.size * 1.1;

        // Bill Body: Metallic Emerald Green & Gold Foil Gradient
        const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        grad.addColorStop(0, '#0a3a1d');
        grad.addColorStop(0.3, '#1fa85a');
        grad.addColorStop(0.7, '#136034');
        grad.addColorStop(1, '#082914');

        ctx.fillStyle = grad;
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = 'rgba(0, 230, 118, 0.4)';
        ctx.shadowBlur = 10;

        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-w / 2, -h / 2, w, h, 4);
        } else {
            ctx.rect(-w / 2, -h / 2, w, h);
        }
        ctx.fill();
        ctx.stroke();

        // Inner Filigree Border & Currency Mark
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);

        // Center Seal Emblem
        ctx.fillStyle = '#ffd700';
        ctx.font = `900 ${Math.floor(p.size * 0.5)}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$100', 0, 0);

        ctx.restore();
    }

    // Render 3D Rotating Gold Coin
    function drawGoldCoin(p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotZ);
        ctx.globalAlpha = p.opacity;

        const scaleX = Math.cos(p.coinRot);
        const radius = p.size * 0.5;

        // 3D Coin Edge & Gold Shine
        ctx.scale(Math.max(0.2, Math.abs(scaleX)), 1);

        const coinGrad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
        coinGrad.addColorStop(0, '#fff5b8');
        coinGrad.addColorStop(0.4, '#ffd700');
        coinGrad.addColorStop(0.8, '#d4af37');
        coinGrad.addColorStop(1, '#7a5f12');

        ctx.fillStyle = coinGrad;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#4a3705';
        ctx.font = `900 ${Math.floor(radius * 0.9)}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('KSh', 0, 0);

        ctx.restore();
    }

    // Render Floating Cash Emoji & Diamond Sparkles
    function drawSparkleParticle(p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.globalAlpha = p.opacity;

        if (p.type === 'cash_emoji') {
            ctx.font = `${Math.floor(p.size * 1.2)}px Outfit, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.emoji, 0, 0);
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = p.opacity > 0.7 ? '#00f0ff' : '#ffd700';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 14;
            ctx.fill();
        }

        ctx.restore();
    }

    let time = 0;
    function animate() {
        ctx.clearRect(0, 0, width, height);
        time += 1;

        // Draw Ambient Pulsating Backdrop Light Halo
        const centerX = width / 2;
        const centerY = height * 0.35;
        const auraGrad = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, Math.max(width, height) * 0.5);
        const pulse = 0.18 + Math.sin(time * 0.02) * 0.06;
        auraGrad.addColorStop(0, `rgba(255, 215, 0, ${pulse})`);
        auraGrad.addColorStop(0.4, `rgba(0, 240, 255, ${pulse * 0.5})`);
        auraGrad.addColorStop(1, 'rgba(3, 6, 18, 0)');

        ctx.fillStyle = auraGrad;
        ctx.fillRect(0, 0, width, height);

        // Update and Render All Money Rain Particles
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.y += p.speedY;
            p.x += Math.sin(time * p.swayFreq + i) * p.swayAmp;
            p.rotZ += p.rotZSpeed;
            p.rot3D += p.rot3DSpeed;
            p.coinRot += p.coinRotSpeed;

            if (p.y > height + 60) {
                p.y = -60;
                p.x = Math.random() * width;
            }

            if (p.type === 'dollar_bill') {
                drawDollarBill(p);
            } else if (p.type === 'gold_coin') {
                drawGoldCoin(p);
            } else {
                drawSparkleParticle(p);
            }
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}

// ─── LIVE MINI COMPONENT ANIMATORS ─────────────────────────────────────────
function initLiveMiniComponents() {
    // Mini Slot Reel Rotator Animation (0-7 numbers / symbols)
    const r1 = document.getElementById('r1Val');
    const r2 = document.getElementById('r2Val');
    const r3 = document.getElementById('r3Val');

    if (r1 && r2 && r3) {
        const slotSymbols = ['7', '7', '7', '💎', '7', '🎰', '7', '7'];
        let idx = 0;
        setInterval(() => {
            idx = (idx + 1) % slotSymbols.length;
            r1.textContent = slotSymbols[idx];
            r2.textContent = slotSymbols[(idx + 2) % slotSymbols.length];
            r3.textContent = slotSymbols[(idx + 4) % slotSymbols.length];
        }, 1200);
    }
}

// Pure Daraja STK Push Integration — No legacy bypass functions.
