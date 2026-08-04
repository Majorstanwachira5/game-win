-- Spin & Win PostgreSQL Database Schema
-- Note: Database 'spin_win_db' is automatically initialized by POSTGRES_DB environment variable.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    phone VARCHAR(32) NOT NULL,
    balance NUMERIC(15, 2) DEFAULT 0.00,
    currency VARCHAR(8) DEFAULT 'KSh',
    free_spins INT DEFAULT 0,
    double_next_win BOOLEAN DEFAULT FALSE,
    total_spins INT DEFAULT 0,
    total_wagered NUMERIC(15, 2) DEFAULT 0.00,
    total_won NUMERIC(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- 4. Deposits / Payment Transactions Log Table
CREATE TABLE IF NOT EXISTS deposits_log (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    amount NUMERIC(15, 2) NOT NULL,
    method VARCHAR(32) NOT NULL,
    phone_or_email VARCHAR(64),
    status VARCHAR(32) DEFAULT 'COMPLETED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Financial Platform Stats Summary Table
CREATE TABLE IF NOT EXISTS platform_stats (
    id INT PRIMARY KEY DEFAULT 1,
    total_revenue NUMERIC(15, 2) DEFAULT 540000.00,
    total_payout NUMERIC(15, 2) DEFAULT 81000.00,
    total_spins BIGINT DEFAULT 4320,
    active_rig_slice VARCHAR(32) DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for high performance high concurrency querying
CREATE INDEX IF NOT EXISTS idx_spins_user ON spins_log(user_id);
CREATE INDEX IF NOT EXISTS idx_spins_created ON spins_log(created_at DESC);
