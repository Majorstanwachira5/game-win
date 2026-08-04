document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const totalRevenueText = document.getElementById('totalRevenueText');
    const totalPayoutText = document.getElementById('totalPayoutText');
    const houseProfitText = document.getElementById('houseProfitText');
    const profitMarginText = document.getElementById('profitMarginText');
    const rtpText = document.getElementById('rtpText');
    const totalSpinsText = document.getElementById('totalSpinsText');
    const socketCountText = document.getElementById('socketCountText');

    const probabilityTableBody = document.getElementById('probabilityTableBody');
    const saveProbabilitiesBtn = document.getElementById('saveProbabilitiesBtn');

    const rigSliceSelect = document.getElementById('rigSliceSelect');
    const setRigBtn = document.getElementById('setRigBtn');
    const rigStatusMessage = document.getElementById('rigStatusMessage');

    const mpesaPaybillInput = document.getElementById('mpesaPaybillInput');
    const mpesaKeyInput = document.getElementById('mpesaKeyInput');
    const mpesaSecretInput = document.getElementById('mpesaSecretInput');
    const stripeKeyInput = document.getElementById('stripeKeyInput');
    const savePaymentKeysBtn = document.getElementById('savePaymentKeysBtn');

    let currentSlices = [];

    // Fetch Stats
    function loadAdminStats() {
        fetch('/api/admin/stats')
            .then(res => res.json())
            .then(data => {
                totalRevenueText.textContent = `KSh ${data.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                totalPayoutText.textContent = `KSh ${data.totalPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                houseProfitText.textContent = `KSh ${data.houseNetProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                
                profitMarginText.textContent = `House Margin: ${data.profitMarginPercent}% (TARGET: 85.00%)`;
                rtpText.textContent = `Realized RTP: ${data.rtpPercent}%`;
                
                totalSpinsText.textContent = data.totalSpins.toLocaleString();
                socketCountText.textContent = `Active Sockets: ${data.activeSockets}`;

                currentSlices = data.slices;
                renderProbabilityTable(currentSlices);
                populateRigSelect(currentSlices, data.activeRigSlice);

                // Populate payment keys
                if (data.paymentSettings) {
                    mpesaPaybillInput.value = data.paymentSettings.mpesaPaybill || '400200';
                    mpesaKeyInput.value = data.paymentSettings.mpesaConsumerKey || '';
                    mpesaSecretInput.value = data.paymentSettings.mpesaConsumerSecret || '';
                    stripeKeyInput.value = data.paymentSettings.stripePublicKey || '';
                }
            })
            .catch(err => console.log('Error fetching stats', err));
    }

    loadAdminStats();
    setInterval(loadAdminStats, 5000); // refresh every 5 seconds

    function renderProbabilityTable(slices) {
        const totalWeight = slices.reduce((sum, s) => sum + Number(s.weight), 0);

        probabilityTableBody.innerHTML = '';
        slices.forEach((s, index) => {
            const probPct = ((s.weight / totalWeight) * 100).toFixed(3);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${s.id}</code></td>
                <td><strong>${s.label}</strong></td>
                <td><span class="type-pill ${s.type}">${s.type.toUpperCase()}</span></td>
                <td>${s.multiplier !== undefined ? '×' + s.multiplier : '-'}</td>
                <td>
                    <input type="number" class="weight-input" data-index="${index}" value="${s.weight}" step="1" min="1">
                </td>
                <td><strong>${probPct}%</strong></td>
            `;
            probabilityTableBody.appendChild(tr);
        });

        // Listen for live input changes
        document.querySelectorAll('.weight-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = Number(e.target.getAttribute('data-index'));
                const newWeight = Number(e.target.value);
                if (newWeight > 0) {
                    currentSlices[idx].weight = newWeight;
                    renderProbabilityTable(currentSlices);
                }
            });
        });
    }

    function populateRigSelect(slices, activeRigId) {
        // Save current selection if user was editing
        const currentVal = rigSliceSelect.value;
        rigSliceSelect.innerHTML = '<option value="">-- DISABLED (Random Crypto RNG) --</option>';

        slices.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.label} (${s.id})`;
            if (activeRigId === s.id) opt.selected = true;
            rigSliceSelect.appendChild(opt);
        });

        if (activeRigId) {
            rigStatusMessage.textContent = `⚠️ DEMO RIG ACTIVE: Target Slice forced to "${activeRigId}"`;
            rigStatusMessage.style.color = '#ff5252';
        } else {
            rigStatusMessage.textContent = '✅ Status: Normal Random Mode (Cryptographic RNG)';
            rigStatusMessage.style.color = '#00e676';
        }
    }

    // Save Probabilities
    saveProbabilitiesBtn.addEventListener('click', () => {
        saveProbabilitiesBtn.disabled = true;
        saveProbabilitiesBtn.textContent = 'SAVING...';

        fetch('/api/admin/probabilities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slices: currentSlices })
        })
        .then(res => res.json())
        .then(data => {
            saveProbabilitiesBtn.disabled = false;
            saveProbabilitiesBtn.textContent = 'SAVE PROBABILITIES';
            alert(data.message || 'Probabilities updated!');
            loadAdminStats();
        })
        .catch(err => {
            saveProbabilitiesBtn.disabled = false;
            saveProbabilitiesBtn.textContent = 'SAVE PROBABILITIES';
            alert('Error updating probabilities');
        });
    });

    // Apply Rig Override
    setRigBtn.addEventListener('click', () => {
        const sliceId = rigSliceSelect.value;

        fetch('/api/admin/rig', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sliceId })
        })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadAdminStats();
        });
    });

    // Save Payment Settings
    savePaymentKeysBtn.addEventListener('click', () => {
        const body = {
            mpesaPaybill: mpesaPaybillInput.value,
            mpesaConsumerKey: mpesaKeyInput.value,
            mpesaConsumerSecret: mpesaSecretInput.value,
            stripePublicKey: stripeKeyInput.value
        };

        fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(res => res.json())
        .then(data => {
            alert(data.message || 'Payment API settings saved successfully!');
        });
    });
});
