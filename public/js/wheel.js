/**
 * wheel.js — Luxury Canvas 3D Spin Wheel Engine v3.5 (Interactive Pre-Payment Preview & Real Spin Engine)
 * Features:
 * 1. Pre-payment Presentation Animation (smooth preview rotation, LED pulse, click-to-stop deceleration).
 * 2. Complete isolation between Landing Preview and Real Server-Verified Game Spins.
 * 3. Zero fake rewards, zero unauthorized /api/spin calls, zero CPU/battery drain when resting.
 * 4. High-DPI crisp Canvas 3D rendering with gold rim, dynamic LEDs, and vibrant gradient slices.
 */

class SpinWheelEngine {
    constructor(canvasEl, slices = []) {
        this.canvas = typeof canvasEl === 'string' ? document.getElementById(canvasEl) : canvasEl;
        if (!this.canvas) return;

        // Prevent duplicate competing instances on the same DOM element
        if (this.canvas.__wheelEngine) {
            return this.canvas.__wheelEngine;
        }
        this.canvas.__wheelEngine = this;

        this.ctx = this.canvas.getContext('2d');
        this.slices = (Array.isArray(slices) && slices.length > 0) ? slices : this.getDefaultSlices();

        this.currentAngle = 0;
        this.isSpinning = false;
        this.soundEnabled = true;
        this.audioCtx = null;
        this.ledOffset = 0;
        this.spinState = null;
        this.animFrameId = null;

        // Pre-payment Preview Presentation State: 'IDLE' | 'PREVIEW_SPINNING' | 'PREVIEW_STOPPING' | 'PREVIEW_STOPPED'
        this.previewState = 'IDLE';
        this.previewSpeed = 0.045; // Smooth angular velocity (~2.6 rad/sec)
        this.previewStartTime = 0;
        this.previewMaxDuration = 15000; // 15 seconds presentation auto-duration
        this.previewDecelStartTime = 0;
        this.previewDecelDuration = 2200; // 2.2s smooth physics friction deceleration
        this.previewInitialSpeed = 0;
        this.previewRafId = null;

        this.initAudio();
        this.initInteraction();
        this.draw();
    }

    getDefaultSlices() {
        return [
            { id: 'try_again_1', label: 'TRY AGAIN',    type: 'loss',       multiplier: 0,    color: '#8b0000', text: '#ffffff' },
            { id: 'mult_0_1',    label: 'x0.1',          type: 'win',        multiplier: 0.1,  color: '#0d4a52', text: '#00f0ff' },
            { id: 'free_spin_1', label: 'FREE SPIN',     type: 'free_spin',  count: 1,         color: '#0f7568', text: '#ffffff' },
            { id: 'mult_0_5',    label: 'x0.5',          type: 'win',        multiplier: 0.5,  color: '#1c7582', text: '#ffffff' },
            { id: 'mult_2_0',    label: 'x2 MULTIPLIER', type: 'win',        multiplier: 2.0,  color: '#00a8cc', text: '#ffffff' },
            { id: 'try_again_2', label: 'TRY AGAIN',    type: 'loss',       multiplier: 0,    color: '#560e0e', text: '#ffffff' },
            { id: 'mult_5_0',    label: 'x5 MULTIPLIER', type: 'win',        multiplier: 5.0,  color: '#d4af37', text: '#000000' },
            { id: 'free_spin_2', label: '2 FREE SPINS',  type: 'free_spin', count: 2,         color: '#0c574d', text: '#ffffff' },
            { id: 'mult_10_0',   label: 'x10 MEGA WIN',  type: 'win',        multiplier: 10.0, color: '#00d2ff', text: '#000000' },
            { id: 'mult_0_2',    label: 'x0.2',          type: 'win',        multiplier: 0.2,  color: '#135c66', text: '#ffffff' },
            { id: 'mult_20_0',   label: 'x20 SUPER WIN', type: 'win',        multiplier: 20.0, color: '#ffb700', text: '#000000' },
            { id: 'double_win',  label: 'DOUBLE SPIN',   type: 'double_next',                  color: '#e63946', text: '#ffffff' },
            { id: 'jackpot_50',  label: 'x50 JACKPOT',   type: 'jackpot',    multiplier: 50.0, color: '#ffe600', text: '#000000' },
            { id: 'mult_1_0',    label: 'x1 DOUBLE UP',  type: 'win',        multiplier: 1.0,  color: '#0a3d62', text: '#ffffff' }
        ];
    }

    initAudio() {
        try {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            if (AudioCtxClass) { this.audioCtx = new AudioCtxClass(); }
        } catch (e) {}
    }

    playTickSound(speedFactor = 1.0) {
        if (!this.soundEnabled || !this.audioCtx) return;
        try {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const now = this.audioCtx.currentTime;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            const baseFreq = 520 + Math.min(speedFactor * 180, 300);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(baseFreq, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.035);

            const vol = Math.min(0.24, 0.12 + speedFactor * 0.12);
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.035);
        } catch (e) {}
    }

    updateSlices(newSlices) {
        if (Array.isArray(newSlices) && newSlices.length > 0) {
            this.slices = newSlices;
            this.draw();
        }
    }

    initInteraction() {
        if (!this.canvas) return;
        this.canvas.style.cursor = 'pointer';
        this.canvas.setAttribute('aria-label', 'Interactive PLAYCOIN wheel — tap to stop or spin');

        const handleTap = (e) => {
            if (this.isSpinning) return; // Real spin currently underway
            if (window.WheelEngine && typeof window.WheelEngine.handlePreviewTap === 'function') {
                if (e && e.cancelable) e.preventDefault();
                window.WheelEngine.handlePreviewTap();
            }
        };

        this.canvas.addEventListener('click', handleTap);
        this.canvas.addEventListener('touchend', handleTap, { passive: false });
    }

    // ─── PREVIEW PRESENTATION ANIMATION ENGINE ────────────────────────────────
    startPreview() {
        if (this.isSpinning || this.previewState === 'PREVIEW_SPINNING') return;

        this.previewState = 'PREVIEW_SPINNING';
        this.previewStartTime = performance.now();

        if (this.previewRafId) {
            cancelAnimationFrame(this.previewRafId);
            this.previewRafId = null;
        }

        this.updatePreviewBadge('PREVIEW_SPINNING');

        const frame = (now) => {
            if (this.isSpinning) {
                // Real spin has taken control, immediately abort preview
                this.cancelPreview();
                return;
            }

            if (this.previewState === 'PREVIEW_SPINNING') {
                this.currentAngle += this.previewSpeed;
                this.ledOffset = Math.floor(now / 160) % 2;

                // Auto-decelerate after 15 seconds of unattended presentation
                if (now - this.previewStartTime >= this.previewMaxDuration) {
                    this.stopPreview();
                } else {
                    this.draw();
                    this.previewRafId = requestAnimationFrame(frame);
                }
            } else if (this.previewState === 'PREVIEW_STOPPING') {
                const elapsed = now - this.previewDecelStartTime;
                const p = Math.min(elapsed / this.previewDecelDuration, 1);
                // Cubic deceleration curve (smooth gradual stop)
                const ease = Math.pow(1 - p, 2.5);
                const currentSpeed = this.previewInitialSpeed * ease;
                this.currentAngle += currentSpeed;
                this.ledOffset = Math.floor(now / (160 + p * 300)) % 2;

                if (p >= 1) {
                    // Complete permanent stop
                    this.previewState = 'PREVIEW_STOPPED';
                    this.previewRafId = null;
                    this.ledOffset = 0; // Solid rest LEDs
                    this.draw();
                    this.updatePreviewBadge('PREVIEW_STOPPED');
                    return;
                }

                this.draw();
                this.previewRafId = requestAnimationFrame(frame);
            }
        };

        this.previewRafId = requestAnimationFrame(frame);
    }

    stopPreview() {
        if (this.previewState !== 'PREVIEW_SPINNING') return;
        this.previewState = 'PREVIEW_STOPPING';
        this.previewDecelStartTime = performance.now();
        this.previewInitialSpeed = this.previewSpeed;
        this.updatePreviewBadge('PREVIEW_STOPPING');
    }

    cancelPreview() {
        this.previewState = 'IDLE';
        if (this.previewRafId) {
            cancelAnimationFrame(this.previewRafId);
            this.previewRafId = null;
        }
        this.updatePreviewBadge('IDLE');
    }

    updatePreviewBadge(state) {
        const textDesktop = document.getElementById('desktopWheelPreviewText');
        const textMobile = document.getElementById('mobileWheelPreviewText');
        const badgeDesktop = document.getElementById('desktopWheelPreviewBadge');
        const badgeMobile = document.getElementById('mobileWheelPreviewBadge');

        let msg = '';
        let show = true;
        let isReady = false;

        if (state === 'PREVIEW_SPINNING') {
            msg = 'Tap the wheel to stop';
        } else if (state === 'PREVIEW_STOPPING') {
            msg = 'Slowing down...';
        } else if (state === 'PREVIEW_STOPPED') {
            msg = 'Ready to Play? Deposit or Spin Now!';
            isReady = true;
        } else {
            show = false;
        }

        [textDesktop, textMobile].forEach(el => {
            if (el) el.textContent = msg;
        });

        [badgeDesktop, badgeMobile].forEach(b => {
            if (!b) return;
            b.style.display = show ? 'block' : 'none';
            if (isReady) {
                b.style.color = '#00e676';
                b.style.textShadow = '0 0 10px rgba(0,230,118,0.4)';
            } else {
                b.style.color = '#ffd700';
                b.style.textShadow = 'none';
            }
        });
    }

    // ─── WHEEL CANVAS RENDERING ───────────────────────────────────────────────
    draw() {
        if (!this.canvas || !this.ctx) return;
        const width = this.canvas.width || 300;
        const height = this.canvas.height || 300;
        const centerX = width / 2;
        const centerY = height / 2;
        const outerRadius = Math.min(width, height) / 2 - 20;
        const innerRadius = Math.max(28, Math.round(outerRadius * 0.28));
        const numSlices = this.slices.length;
        const sliceAngle = (2 * Math.PI) / numSlices;

        this.ctx.clearRect(0, 0, width, height);

        // 1. Outer Gold Metallic Rim
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, outerRadius + 18, 0, 2 * Math.PI);
        const rimGrad = this.ctx.createRadialGradient(centerX, centerY, outerRadius, centerX, centerY, outerRadius + 18);
        rimGrad.addColorStop(0, '#D4AF37');
        rimGrad.addColorStop(0.3, '#FFF5B8');
        rimGrad.addColorStop(0.7, '#AA7C11');
        rimGrad.addColorStop(1, '#59440E');
        this.ctx.fillStyle = rimGrad;
        this.ctx.fill();
        this.ctx.strokeStyle = '#2a1f0a';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // 2. 28 LED Bulbs
        const numLeds = 28;
        for (let i = 0; i < numLeds; i++) {
            const ledAngle = (i * 2 * Math.PI) / numLeds;
            const lx = centerX + (outerRadius + 9) * Math.cos(ledAngle);
            const ly = centerY + (outerRadius + 9) * Math.sin(ledAngle);
            const isLit = (i + this.ledOffset) % 2 === 0;

            this.ctx.beginPath();
            this.ctx.arc(lx, ly, 4.5, 0, 2 * Math.PI);
            this.ctx.fillStyle = isLit ? '#00f0ff' : '#ffd700';
            this.ctx.shadowColor = isLit ? '#00f0ff' : '#ffd700';
            this.ctx.shadowBlur = isLit ? 10 : 4;
            this.ctx.fill();
        }
        this.ctx.restore();

        // 3. Render Slices
        this.ctx.save();
        this.ctx.translate(centerX, centerY);

        for (let i = 0; i < numSlices; i++) {
            const slice = this.slices[i];
            const startAngle = this.currentAngle + i * sliceAngle;
            const endAngle = startAngle + sliceAngle;

            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, outerRadius, startAngle, endAngle);
            this.ctx.closePath();

            const midAngle = startAngle + sliceAngle / 2;
            const gx = outerRadius * Math.cos(midAngle);
            const gy = outerRadius * Math.sin(midAngle);

            const sliceColor = slice.color || (i % 2 === 0 ? '#0d4a52' : '#0a3d62');
            const sliceGrad = this.ctx.createLinearGradient(0, 0, gx, gy);
            sliceGrad.addColorStop(0, sliceColor);
            sliceGrad.addColorStop(1, this.darkenHexColor(sliceColor, 0.3));

            this.ctx.fillStyle = sliceGrad;
            this.ctx.fill();

            this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Slice Text Label
            this.ctx.save();
            this.ctx.rotate(midAngle);
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';

            const rawLabel = String(slice.label || 'WIN').trim();
            const fontSize = Math.max(10, Math.min(13, Math.round(outerRadius * 0.08)));
            this.ctx.font = slice.type === 'jackpot' ? `900 ${fontSize}px Orbitron, sans-serif` : `700 ${fontSize}px Outfit, sans-serif`;
            this.ctx.fillStyle = slice.text || '#ffffff';
            this.ctx.shadowColor = '#000000';
            this.ctx.shadowBlur = 6;

            this.ctx.fillText(rawLabel, outerRadius - 14, 0);
            this.ctx.restore();
        }

        // Inner Cutout Backdrop
        this.ctx.beginPath();
        this.ctx.arc(0, 0, innerRadius, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#060c16';
        this.ctx.fill();

        this.ctx.restore();

        // 4. Center Gold Hub & Top Pointer Peg
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, innerRadius - 6, 0, 2 * Math.PI);
        const centerGrad = this.ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, innerRadius - 6);
        centerGrad.addColorStop(0, '#FFF5B8');
        centerGrad.addColorStop(0.6, '#D4AF37');
        centerGrad.addColorStop(1, '#59440E');
        this.ctx.fillStyle = centerGrad;
        this.ctx.fill();
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();

        // Top Gold Pointer Peg Indicator
        const pointerY = centerY - outerRadius - 4;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - 14, pointerY - 12);
        this.ctx.lineTo(centerX + 14, pointerY - 12);
        this.ctx.lineTo(centerX, pointerY + 16);
        this.ctx.closePath();
        this.ctx.fillStyle = '#FFE066';
        this.ctx.shadowColor = '#FFD700';
        this.ctx.shadowBlur = 16;
        this.ctx.fill();
        this.ctx.strokeStyle = '#59440E';
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();

        this.ctx.restore();
    }

    darkenHexColor(hex, factor = 0.3) {
        if (!hex || typeof hex !== 'string') return '#000000';
        let clean = hex.replace('#', '');
        if (clean.length === 3) {
            clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
        }
        let num = parseInt(clean, 16);
        if (isNaN(num)) return '#000000';
        let r = Math.max(0, Math.floor((num >> 16) * (1 - factor)));
        let g = Math.max(0, Math.floor(((num >> 8) & 0xFF) * (1 - factor)));
        let b = Math.max(0, Math.floor((num & 0xFF) * (1 - factor)));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    // ─── REAL SERVER-VERIFIED GAME SPIN ENGINE ────────────────────────────────
    spinToTargetIndex(targetIndex, durationMs = 3600, onComplete) {
        this.cancelPreview();

        if (this.isSpinning) return;

        const numSlices = this.slices.length;
        const sliceAngle = (2 * Math.PI) / numSlices;
        const sliceCenterAngle = targetIndex * sliceAngle + sliceAngle / 2;
        const targetLandingAngle = (1.5 * Math.PI) - sliceCenterAngle;

        // 18 full fast energetic revolutions
        const extraRevolutions = 18 * 2 * Math.PI;

        const startAngle = this.currentAngle;
        const currentMod = ((startAngle % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        const targetMod = ((targetLandingAngle % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        
        let angleDiff = targetMod - currentMod;
        while (angleDiff <= 0) {
            angleDiff += 2 * Math.PI;
        }

        const totalAngleChange = extraRevolutions + angleDiff;
        const endAngle = startAngle + totalAngleChange;

        this.spinState = {
            startAngle,
            totalAngleChange,
            endAngle,
            durationMs,
            startTime: performance.now(),
            sliceAngle,
            lastSliceCrossed: -1,
            onComplete
        };
        this.isSpinning = true;

        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }

        const frame = (now) => {
            if (!this.isSpinning || !this.spinState) {
                this.draw();
                return;
            }

            const elapsed = now - this.spinState.startTime;
            const progress = Math.min(elapsed / this.spinState.durationMs, 1);

            // Progressive friction deceleration curve (cubic-quartic ease-out)
            const easeProgress = 1 - Math.pow(1 - progress, 3.8);
            this.currentAngle = this.spinState.startAngle + (this.spinState.totalAngleChange * easeProgress);

            // Audio tick on crossing slice boundaries
            const currentModAngle = ((this.currentAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            const pointerAngle = (1.5 * Math.PI - currentModAngle + 4 * Math.PI) % (2 * Math.PI);
            const currentSliceIndex = Math.floor(pointerAngle / this.spinState.sliceAngle) % numSlices;

            if (currentSliceIndex !== this.spinState.lastSliceCrossed) {
                if (this.soundEnabled) {
                    this.playTickSound(1 - progress);
                }
                this.spinState.lastSliceCrossed = currentSliceIndex;
            }

            // Rapid LED flashing during real spin
            this.ledOffset = Math.floor(now / 90) % 2;

            if (progress >= 1) {
                // 100% COMPLETE PERMANENT STOP — ZERO DRIFT, LOCKED ROTATION
                this.isSpinning = false;
                this.currentAngle = this.spinState.endAngle;
                this.ledOffset = 0; // Solid stationary LEDs
                const cb = this.spinState.onComplete;
                this.spinState = null;
                this.animFrameId = null;

                // Final static render
                this.draw();

                if (typeof cb === 'function') {
                    cb();
                }
                return;
            }

            this.draw();
            this.animFrameId = requestAnimationFrame(frame);
        };

        this.animFrameId = requestAnimationFrame(frame);
    }
}

// Global Export Bridge & Multi-Canvas Auto-Initialization
const _wheelInstances = new Map();

function _getOrInitWheel(canvasId, slices = []) {
    const el = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
    if (!el) return null;
    const id = el.id || 'wheelCanvas';
    if (!_wheelInstances.has(id)) {
        _wheelInstances.set(id, new SpinWheelEngine(el, slices));
    }
    return _wheelInstances.get(id);
}

function _initAllWheels(slices = []) {
    const canvasIds = ['wheelCanvas', 'mobileWheelCanvas'];
    canvasIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) _getOrInitWheel(el, slices);
    });
}

window.WheelEngine = {
    init(canvasId = 'wheelCanvas', slices = []) {
        _initAllWheels(slices);
        return _getOrInitWheel(canvasId, slices);
    },
    setSlices(slices) {
        _wheelInstances.forEach(inst => {
            if (inst && typeof inst.updateSlices === 'function') inst.updateSlices(slices);
        });
    },
    startPreviewAll() {
        _wheelInstances.forEach(inst => {
            if (inst && typeof inst.startPreview === 'function') inst.startPreview();
        });
    },
    stopPreviewAll() {
        _wheelInstances.forEach(inst => {
            if (inst && typeof inst.stopPreview === 'function') inst.stopPreview();
        });
    },
    cancelPreviewAll() {
        _wheelInstances.forEach(inst => {
            if (inst && typeof inst.cancelPreview === 'function') inst.cancelPreview();
        });
    },
    handlePreviewTap() {
        let isAnyPreviewing = false;
        _wheelInstances.forEach(inst => {
            if (inst && inst.previewState === 'PREVIEW_SPINNING') {
                isAnyPreviewing = true;
            }
        });

        if (isAnyPreviewing) {
            this.stopPreviewAll();
        } else {
            // Already at rest, trigger real game flow
            if (window.performSpin) window.performSpin();
        }
    },
    spinToSlice(target, onComplete) {
        this.cancelPreviewAll();
        _initAllWheels();

        const activeInstances = Array.from(_wheelInstances.values()).filter(inst => inst && inst.canvas);
        if (activeInstances.length === 0) {
            console.warn('[WheelEngine] No active wheel canvas found to spin!');
            if (typeof onComplete === 'function') setTimeout(onComplete, 1500);
            return;
        }

        let completed = false;
        const handleComplete = () => {
            if (!completed) {
                completed = true;
                if (typeof onComplete === 'function') onComplete();
            }
        };

        // Spin ALL wheel canvas instances synchronously across desktop & mobile
        activeInstances.forEach((inst, index) => {
            inst.soundEnabled = (index === 0);
            let idx = 0;
            if (typeof target === 'number') {
                idx = target;
            } else if (typeof target === 'string') {
                const found = inst.slices.findIndex(s => s.id === target);
                idx = found >= 0 ? found : 0;
            } else if (typeof target === 'object' && target) {
                if (target.id) {
                    const found = inst.slices.findIndex(s => s.id === target.id);
                    idx = found >= 0 ? found : (typeof target.sliceIndex === 'number' ? target.sliceIndex : 0);
                } else if (typeof target.sliceIndex === 'number') {
                    idx = target.sliceIndex;
                }
            }
            inst.spinToTargetIndex(idx, 3600, handleComplete);
        });
    }
};

// Auto-initialize & start presentation preview on page load
function _bootWheelPresentation() {
    _initAllWheels();
    // Start presentation animation automatically
    if (window.WheelEngine) {
        window.WheelEngine.startPreviewAll();
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(_bootWheelPresentation, 80);
} else {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(_bootWheelPresentation, 80);
    });
}
window.addEventListener('load', _bootWheelPresentation);
