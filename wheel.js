/**
 * wheel.js — Luxury Canvas 3D Spin Wheel Engine v2.0
 * Renders smooth metallic gold rim, 28 LED bulbs, vibrant gradient slices, clear typography,
 * and physics-based easing animation.
 */

class SpinWheelEngine {
    constructor(canvasId, slices = []) {
        this.canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
        if (!this.canvas) {
            console.warn('[WHEEL] Canvas element not found:', canvasId);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.slices = (Array.isArray(slices) && slices.length > 0) ? slices : this.getDefaultSlices();

        this.currentAngle = 0;
        this.isSpinning = false;
        this.soundEnabled = true;
        this.audioCtx = null;
        this.ledOffset = 0;

        this.initAudio();
        this.startAnimationLoop();
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
            { id: 'double_win',  label: 'DOUBLE WIN',    type: 'double_next',                  color: '#e63946', text: '#ffffff' },
            { id: 'jackpot_50',  label: 'x50 JACKPOT',   type: 'jackpot',    multiplier: 50.0, color: '#ffe600', text: '#000000' },
            { id: 'mult_1_0',    label: 'x1 DOUBLE UP',  type: 'win',        multiplier: 1.0,  color: '#0a3d62', text: '#ffffff' }
        ];
    }

    initAudio() {
        try {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            if (AudioCtxClass) { this.audioCtx = new AudioCtxClass(); }
        } catch (e) {
            console.log("AudioContext disabled/blocked");
        }
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

    startAnimationLoop() {
        let lastLedToggle = performance.now();
        const loop = (now) => {
            if (now - lastLedToggle > 250) {
                this.ledOffset = (this.ledOffset + 1) % 2;
                lastLedToggle = now;
            }
            if (!this.isSpinning) {
                this.currentAngle = (this.currentAngle + 0.0015) % (2 * Math.PI);
                this.draw();
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    draw() {
        if (!this.canvas || !this.ctx) return;
        const width = this.canvas.width || 500;
        const height = this.canvas.height || 500;
        const centerX = width / 2;
        const centerY = height / 2;
        const outerRadius = Math.min(width, height) / 2 - 20;
        const innerRadius = Math.max(28, Math.round(outerRadius * 0.28));
        const numSlices = this.slices.length;
        const sliceAngle = (2 * Math.PI) / numSlices;

        this.ctx.clearRect(0, 0, width, height);

        // 1. Draw Outer Gold Metallic Rim
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

        // 2. 28 Animated Glowing LED Bulbs
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
            this.ctx.shadowBlur = isLit ? 12 : 5;
            this.ctx.fill();
        }
        this.ctx.restore();

        // 3. Render Slices
        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(this.currentAngle);

        for (let i = 0; i < numSlices; i++) {
            const startAngle = i * sliceAngle;
            const endAngle = startAngle + sliceAngle;
            const slice = this.slices[i] || {};

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

    spinToTargetIndex(targetIndex, durationMs = 3600, onComplete) {
        if (this.isSpinning) return;
        this.isSpinning = true;

        const numSlices = this.slices.length;
        const sliceAngle = (2 * Math.PI) / numSlices;
        const sliceCenterAngle = targetIndex * sliceAngle + sliceAngle / 2;
        const targetLandingAngle = (1.5 * Math.PI) - sliceCenterAngle;
        
        // 18 full fast energetic revolutions for real casino excitement
        const extraRevolutions = 18 * 2 * Math.PI;

        const startAngle = this.currentAngle;
        const currentMod = startAngle % (2 * Math.PI);
        let angleDiff = targetLandingAngle - currentMod;

        while (angleDiff < 0) {
            angleDiff += 2 * Math.PI;
        }

        const totalAngleChange = extraRevolutions + angleDiff;
        const endAngle = startAngle + totalAngleChange;
        const startTime = performance.now();
        let lastSliceCrossed = -1;

        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / durationMs, 1);
            
            // Progressive natural deceleration curve: rapid blur start -> suspenseful slowdown -> crisp peg lock
            const easeProgress = 1 - Math.pow(1 - progress, 3.6);

            this.currentAngle = startAngle + (totalAngleChange * easeProgress);
            this.draw();

            const currentModAngle = (this.currentAngle) % (2 * Math.PI);
            const pointerAngle = (1.5 * Math.PI - currentModAngle + 4 * Math.PI) % (2 * Math.PI);
            const currentSliceIndex = Math.floor(pointerAngle / sliceAngle);

            if (currentSliceIndex !== lastSliceCrossed) {
                const speedFactor = (1 - progress);
                this.playTickSound(speedFactor);
                lastSliceCrossed = currentSliceIndex;
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isSpinning = false;
                this.currentAngle = endAngle;
                this.draw();
                if (typeof onComplete === 'function') onComplete();
            }
        };

        requestAnimationFrame(animate);
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
    spinToSlice(targetIndex, onComplete) {
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
            inst.spinToTargetIndex(targetIndex, 3600, handleComplete);
        });
    }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        _initAllWheels();
    }, 100);
});
