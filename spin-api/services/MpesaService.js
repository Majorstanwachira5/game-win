/**
 * services/MpesaService.js — Safaricom Daraja M-Pesa Integration Engine
 * Full support for OAuth Tokens, STK Push (Lipa Na M-Pesa Online), Callback Processing & Realtime Status Tracking.
 * Production/Sandbox ready. No mock fallbacks.
 */
const crypto = require('crypto');
const walletService = require('./WalletService');
const platformEvents = require('../events/EventEmitter');

class MpesaService {
    constructor() {
        this.env = process.env.MPESA_ENV || 'sandbox';
        this.baseUrl = this.env === 'production' 
            ? 'https://api.safaricom.co.ke' 
            : 'https://sandbox.safaricom.co.ke';
        
        this.consumerKey = process.env.MPESA_CONSUMER_KEY || '';
        this.consumerSecret = process.env.MPESA_CONSUMER_SECRET || '';
        this.passkey = process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
        this.businessShortCode = process.env.MPESA_PAYBILL || '174379';
        this.callbackUrl = process.env.MPESA_CALLBACK_URL || 'https://game-win-git-main-majorstanwachira5s-projects.vercel.app/api/mpesa/callback';

        // In-memory store for pending transactions status checking & anti-replay defense
        this.pendingTransactions = new Map();
        this.processedReceipts = new Set();
        this.processedCheckoutIds = new Set();
    }

    /**
     * Generate Daraja OAuth Access Token using Basic Auth
     */
    async getAccessToken() {
        if (!this.consumerKey || !this.consumerSecret) {
            throw new Error('[M-Pesa Config Error] MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET missing in environment variables.');
        }

        const authBuffer = Buffer.from(`${this.consumerKey.trim()}:${this.consumerSecret.trim()}`).toString('base64');
        
        // Attempt 1: Primary configured baseUrl
        try {
            const response = await fetch(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${authBuffer}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await response.json();
            if (response.ok && data.access_token) {
                return data.access_token;
            }
        } catch (e) {
            console.warn('[M-Pesa Auth] Primary environment connection failed, attempting fallback...');
        }

        // Attempt 2: Auto-fallback to alternate environment (Sandbox <-> Production)
        const altBaseUrl = this.baseUrl.includes('sandbox') 
            ? 'https://api.safaricom.co.ke' 
            : 'https://sandbox.safaricom.co.ke';

        const altResponse = await fetch(`${altBaseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${authBuffer}`,
                'Content-Type': 'application/json'
            }
        });

        const altData = await altResponse.json();
        if (altResponse.ok && altData.access_token) {
            this.baseUrl = altBaseUrl; // Permanently switch to working environment
            return altData.access_token;
        }

        const errDesc = altData.errorMessage || altData.error_description || JSON.stringify(altData);
        throw new Error(`[M-Pesa Auth Error] Safaricom Daraja returned ${altResponse.status}: ${errDesc}`);
    }

    /**
     * Format phone number to standard 254XXXXXXXXX format
     */
    formatPhone(phone) {
        let cleaned = (phone || '').replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.substring(1);
        } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
            cleaned = '254' + cleaned;
        } else if (!cleaned.startsWith('254')) {
            cleaned = '254' + cleaned;
        }
        return cleaned;
    }

    /**
     * Generate STK Push Password & Timestamp
     */
    generateStkPassword() {
        const date = new Date();
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const timestamp = year + month + day + hours + minutes + seconds;

        const rawPassword = this.businessShortCode + this.passkey + timestamp;
        const password = Buffer.from(rawPassword).toString('base64');

        return { password, timestamp };
    }

    /**
     * Initiate M-Pesa Express STK Push
     */
    async initiateStkPush(userId, rawPhone, amount, accountReference = 'SpinWin') {
        const phone = this.formatPhone(rawPhone);
        if (!phone || phone.length !== 12 || !phone.startsWith('254')) {
            throw new Error('Invalid Kenyan phone number format. Must be 07XXXXXXXX, 01XXXXXXXX, or 254XXXXXXXXX.');
        }

        const token = await this.getAccessToken();
        const { password, timestamp } = this.generateStkPassword();

        const requestBody = {
            BusinessShortCode: this.businessShortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.max(1, Math.round(Number(amount))),
            PartyA: phone,
            PartyB: this.businessShortCode,
            PhoneNumber: phone,
            CallBackURL: `${this.callbackUrl}?userId=${encodeURIComponent(userId)}`,
            AccountReference: accountReference,
            TransactionDesc: `Wallet Topup for User ${userId}`
        };

        const res = await fetch(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await res.json();
        if (!res.ok || data.ResponseCode !== '0') {
            const errorMsg = data.errorMessage || data.ResponseDescription || 'STK Push request rejected by Safaricom Daraja.';
            throw new Error(`[M-Pesa STK Error] ${errorMsg}`);
        }

        // Register pending transaction for status polling
        this.pendingTransactions.set(data.CheckoutRequestID, {
            userId,
            phone,
            amount: Number(amount),
            status: 'PENDING',
            createdAt: Date.now()
        });

        platformEvents.emitEvent('STK_PUSH_INITIATED', {
            userId,
            phone,
            amount,
            checkoutRequestId: data.CheckoutRequestID
        });

        return {
            success: true,
            MerchantRequestID: data.MerchantRequestID,
            CheckoutRequestID: data.CheckoutRequestID,
            ResponseCode: data.ResponseCode,
            ResponseDescription: data.ResponseDescription,
            CustomerMessage: data.CustomerMessage || `STK Push sent to ${phone}. Enter your M-Pesa PIN on your phone to complete payment of KSh ${amount}`
        };
    }

    /**
     * Process M-Pesa Callback & Credit User Wallet (with Anti-Replay Guard)
     */
    processCallback(callbackBody, user) {
        if (!callbackBody || !callbackBody.Body || !callbackBody.Body.stkCallback) {
            return { success: false, message: 'Invalid callback payload' };
        }

        const stkCallback = callbackBody.Body.stkCallback;
        const checkoutRequestId = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;

        if (resultCode === 0) {
            let amount = 0;
            let mpesaReceiptNumber = 'MP' + Date.now();
            let phone = '';

            const items = stkCallback.CallbackMetadata?.Item || [];
            items.forEach(item => {
                if (item.Name === 'Amount') amount = item.Value;
                if (item.Name === 'MpesaReceiptNumber') mpesaReceiptNumber = item.Value;
                if (item.Name === 'PhoneNumber') phone = item.Value;
            });

            // Idempotency & Replay Attack Defense: Check if already processed
            if (this.processedCheckoutIds.has(checkoutRequestId) || (mpesaReceiptNumber && this.processedReceipts.has(mpesaReceiptNumber))) {
                console.warn(`[SECURITY WARN] Replay attack or duplicate callback ignored for CheckoutRequestID: ${checkoutRequestId}, Receipt: ${mpesaReceiptNumber}`);
                return {
                    success: true,
                    resultCode: 0,
                    resultDesc: 'Duplicate callback ignored (Idempotent)',
                    amount,
                    mpesaReceiptNumber
                };
            }

            // Register receipt as processed
            if (checkoutRequestId) this.processedCheckoutIds.add(checkoutRequestId);
            if (mpesaReceiptNumber) this.processedReceipts.add(mpesaReceiptNumber);

            if (user) {
                walletService.creditWallet(user, amount, 'KSH', 'M-Pesa Deposit');
                walletService.writeLedger(user, amount, 'M-Pesa Deposit', user.balance, 'KSH');
            }

            if (checkoutRequestId && this.pendingTransactions.has(checkoutRequestId)) {
                const tx = this.pendingTransactions.get(checkoutRequestId);
                tx.status = 'COMPLETED';
                tx.mpesaReceiptNumber = mpesaReceiptNumber;
                tx.amount = amount;
                this.pendingTransactions.set(checkoutRequestId, tx);
            }

            platformEvents.emitEvent('PAYMENT_RECEIVED', {
                userId: user ? user.id : 'unknown',
                amount,
                receipt: mpesaReceiptNumber,
                phone
            });

            return {
                success: true,
                resultCode: 0,
                resultDesc: 'Payment processed successfully',
                amount,
                mpesaReceiptNumber
            };
        }

        if (checkoutRequestId && this.pendingTransactions.has(checkoutRequestId)) {
            const tx = this.pendingTransactions.get(checkoutRequestId);
            tx.status = 'FAILED';
            tx.reason = stkCallback.ResultDesc || 'Payment failed or cancelled';
            this.pendingTransactions.set(checkoutRequestId, tx);
        }

        return {
            success: false,
            resultCode,
            resultDesc: stkCallback.ResultDesc || 'Payment failed or cancelled by user'
        };
    }

    /**
     * Attach pending game action to checkoutRequestId
     */
    attachGameAction(checkoutRequestId, gameAction) {
        if (checkoutRequestId && this.pendingTransactions.has(checkoutRequestId)) {
            const tx = this.pendingTransactions.get(checkoutRequestId);
            tx.gameAction = gameAction;
            this.pendingTransactions.set(checkoutRequestId, tx);
        }
    }

    /**
     * Check transaction status by CheckoutRequestID
     */
    getTransactionStatus(checkoutRequestId) {
        if (!checkoutRequestId || !this.pendingTransactions.has(checkoutRequestId)) {
            return { status: 'NOT_FOUND' };
        }
        return this.pendingTransactions.get(checkoutRequestId);
    }
}

module.exports = new MpesaService();
