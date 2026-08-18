-- ============================================================================
-- 🎰 SPIN & WIN (RAM) POSTGRESQL DATABASE SCHEMA — ENTERPRISE ADMIN ARCHITECTURE
-- ============================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(128),
    display_name VARCHAR(128) DEFAULT 'Player',
    balance NUMERIC(15, 2) DEFAULT 0.00,
    coins NUMERIC(15, 2) DEFAULT 200.00,
    currency VARCHAR(8) DEFAULT 'KSh',
    free_spins INT DEFAULT 1,
    double_next_win BOOLEAN DEFAULT FALSE,
    xp INT DEFAULT 50,
    vip_tier VARCHAR(32) DEFAULT 'bronze',
    total_spins INT DEFAULT 0,
    total_wagered NUMERIC(15, 2) DEFAULT 0.00,
    total_won NUMERIC(15, 2) DEFAULT 0.00,
    referral_code VARCHAR(32) UNIQUE,
    referred_by VARCHAR(64),
    referral_balance NUMERIC(15, 2) DEFAULT 0.00,
    referral_earnings NUMERIC(15, 2) DEFAULT 0.00,
    referral_count INT DEFAULT 0,
    indirect_referral_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_banned BOOLEAN DEFAULT FALSE,
    is_tester BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- 2. Probability Weights Table (85% House Profit Engine)
CREATE TABLE IF NOT EXISTS probability_slices (
    id VARCHAR(32) PRIMARY KEY,
    label VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL,
    multiplier NUMERIC(8, 2) DEFAULT 0.00,
    count INT DEFAULT 0,
    weight INT NOT NULL,
    color VARCHAR(16) NOT NULL,
    text_color VARCHAR(16) DEFAULT '#ffffff',
    display_order INT NOT NULL
);

-- 3. Spin History Log Table
CREATE TABLE IF NOT EXISTS spins_log (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    bet_amount NUMERIC(15, 2) NOT NULL,
    win_amount NUMERIC(15, 2) NOT NULL,
    slice_id VARCHAR(32) NOT NULL,
    was_free_spin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spins_user ON spins_log(user_id);
CREATE INDEX IF NOT EXISTS idx_spins_created ON spins_log(created_at DESC);

-- 4. Deposits & M-Pesa Transactions Log Table
CREATE TABLE IF NOT EXISTS deposits_log (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    amount NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(8) DEFAULT 'KSh',
    method VARCHAR(32) DEFAULT 'M-Pesa Daraja',
    phone_or_email VARCHAR(64),
    status VARCHAR(32) DEFAULT 'COMPLETED', -- PENDING, COMPLETED, FAILED, REFUNDED
    mpesa_checkout_request_id VARCHAR(128),
    mpesa_receipt_number VARCHAR(64),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits_log(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits_log(status);
CREATE INDEX IF NOT EXISTS idx_deposits_checkout_req ON deposits_log(mpesa_checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_deposits_receipt ON deposits_log(mpesa_receipt_number);
CREATE INDEX IF NOT EXISTS idx_deposits_created ON deposits_log(created_at DESC);

-- 5. Referral Commissions Log Table (2-Tier Pyramid)
CREATE TABLE IF NOT EXISTS referral_commissions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id), -- Beneficiary
    referee_id VARCHAR(64) REFERENCES users(id), -- Source player
    referee_name VARCHAR(128),
    level INT NOT NULL, -- 1 = Direct (KSh 100), 2 = Indirect (KSh 50)
    amount NUMERIC(15, 2) NOT NULL,
    coins NUMERIC(15, 2) DEFAULT 0.00,
    source_tx_id VARCHAR(64),
    status VARCHAR(32) DEFAULT 'APPROVED', -- PENDING, APPROVED, AVAILABLE, PAID, REVERSED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commissions_user ON referral_commissions(user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_level ON referral_commissions(level);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON referral_commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_created ON referral_commissions(created_at DESC);

-- 6. Referral Withdrawals Queue Table (2,000 KES Minimum)
CREATE TABLE IF NOT EXISTS referral_withdrawals (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    user_name VARCHAR(128),
    phone VARCHAR(32) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    fee NUMERIC(15, 2) DEFAULT 0.00,
    net_amount NUMERIC(15, 2) NOT NULL,
    status VARCHAR(32) DEFAULT 'PENDING', -- PENDING, PROCESSING, PAID, REJECTED
    mpesa_receipt VARCHAR(64),
    admin_notes TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON referral_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON referral_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_requested ON referral_withdrawals(requested_at DESC);

-- 7. Immutable Double-Entry Wallet Ledger Table
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    entry_type VARCHAR(16) NOT NULL, -- CREDIT, DEBIT
    category VARCHAR(32) NOT NULL, -- DEPOSIT, WITHDRAWAL, COMMISSION_L1, COMMISSION_L2, WAGER, PAYOUT, ADMIN_ADJUSTMENT
    amount NUMERIC(15, 2) NOT NULL,
    balance_before NUMERIC(15, 2) NOT NULL,
    balance_after NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(16) DEFAULT 'KSH', -- KSH, PLAY_COINS
    reference_id VARCHAR(64),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON wallet_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_category ON wallet_ledger(category);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON wallet_ledger(created_at DESC);

-- 8. Fraud & Risk Anomaly Detection Table
CREATE TABLE IF NOT EXISTS fraud_risk_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    risk_level VARCHAR(16) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    reason TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'REVIEW_REQUIRED', -- REVIEW_REQUIRED, RESOLVED, DISMISSED, ACTIONED
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risk_user ON fraud_risk_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_level ON fraud_risk_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_risk_status ON fraud_risk_logs(status);

-- 9. Administrative Audit Trail Table (Append-Only)
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    admin_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    entity VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64),
    prev_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at DESC);

-- 10. Admin Real-Time Notifications Table
CREATE TABLE IF NOT EXISTS admin_notifications (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(32) DEFAULT 'INFO', -- INFO, SUCCESS, WARNING, DANGER
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notif_unread ON admin_notifications(is_read, created_at DESC);

-- 11. Financial Platform Stats Summary Table
CREATE TABLE IF NOT EXISTS platform_stats (
    id INT PRIMARY KEY DEFAULT 1,
    total_revenue NUMERIC(15, 2) DEFAULT 540000.00,
    total_payout NUMERIC(15, 2) DEFAULT 81000.00,
    total_spins BIGINT DEFAULT 4320,
    active_rig_slice VARCHAR(32) DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

