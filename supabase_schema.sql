-- ============================================================================
-- 🎰 SPIN & WIN CASINO PLATFORM — ENTERPRISE SUPABASE POSTGRESQL ARCHITECTURE
-- ============================================================================
-- Architecture: Financial Double-Entry Ledger, Provably Fair v2, Partitioning,
-- Row Level Security (RLS), Realtime Replication, Atomic RPC Functions.
-- ============================================================================

-- ─── 0. EXTENSIONS & IDEMPOTENT TYPE ENUMS ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'player_vip_tier') THEN
        CREATE TYPE player_vip_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'black_card');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'game_type') THEN
        CREATE TYPE game_type AS ENUM ('wheel_spin', 'mystery_box', 'dice_roll', 'pick_card', 'lucky7_slots', 'prize_ladder');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'game_wager', 'game_payout', 'web3_airdrop', 'vip_bonus', 'jackpot_payout', 'referral_bonus');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entry_type') THEN
        CREATE TYPE ledger_entry_type AS ENUM ('credit', 'debit');
    END IF;
END $$;

-- ─── 1. PLAYERS & PROFILES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(30),
    display_name VARCHAR(100) DEFAULT 'Player',
    avatar_url TEXT,
    vip_tier player_vip_tier DEFAULT 'bronze',
    xp_points INT DEFAULT 0 CHECK (xp_points >= 0),
    free_spins_count INT DEFAULT 1 CHECK (free_spins_count >= 0),
    double_next_win BOOLEAN DEFAULT FALSE,
    mystery_keys_count INT DEFAULT 0 CHECK (mystery_keys_count >= 0),
    referral_code VARCHAR(20) UNIQUE DEFAULT UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)),
    referred_by_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
    web3_wallet_address VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_banned BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_email ON public.players(email);
CREATE INDEX IF NOT EXISTS idx_players_vip ON public.players(vip_tier);
CREATE INDEX IF NOT EXISTS idx_players_referral ON public.players(referral_code);

-- ─── 2. FINANCIAL WALLETS & IMMUTABLE DOUBLE-ENTRY LEDGER ──────────────────
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID UNIQUE NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    cash_balance NUMERIC(15, 2) DEFAULT 0.00 CHECK (cash_balance >= 0),
    coin_balance NUMERIC(20, 4) DEFAULT 200.0000 CHECK (coin_balance >= 0),
    bonus_balance NUMERIC(15, 2) DEFAULT 0.00 CHECK (bonus_balance >= 0),
    version BIGINT DEFAULT 1 CHECK (version >= 0),
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_player ON public.wallets(player_id);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    entry_type ledger_entry_type NOT NULL,
    category transaction_type NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    balance_before NUMERIC(15, 2) NOT NULL,
    balance_after NUMERIC(15, 2) NOT NULL,
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON public.wallet_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_player ON public.wallet_ledger(player_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON public.wallet_ledger(created_at DESC);

-- ─── 3. PROVABLY FAIR SEEDS & GAME SESSIONS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.server_seeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seed_hash VARCHAR(128) UNIQUE NOT NULL,
    seed_secret VARCHAR(128) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    revealed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    game game_type NOT NULL,
    wager_amount NUMERIC(12, 2) DEFAULT 0.00 CHECK (wager_amount >= 0),
    payout_amount NUMERIC(12, 2) DEFAULT 0.00 CHECK (payout_amount >= 0),
    multiplier NUMERIC(8, 2) DEFAULT 1.00,
    slice_label VARCHAR(100),
    outcome_details JSONB DEFAULT '{}'::jsonb,
    is_free_spin BOOLEAN DEFAULT FALSE,
    coins_rewarded NUMERIC(15, 4) DEFAULT 0.0000,
    xp_gained INT DEFAULT 10,
    client_seed TEXT,
    server_seed_id UUID REFERENCES public.server_seeds(id),
    nonce INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Initial Partition (2026 Default)
CREATE TABLE IF NOT EXISTS public.game_sessions_y2026 PARTITION OF public.game_sessions
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE INDEX IF NOT EXISTS idx_game_sessions_player ON public.game_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created ON public.game_sessions(created_at DESC);

-- ─── 4. TRANSACTIONS & M-PESA DARAJA PAYMENTS ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    type transaction_type NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) DEFAULT 'KSh',
    status payment_status DEFAULT 'pending',
    mpesa_checkout_request_id VARCHAR(100),
    mpesa_receipt_number VARCHAR(50),
    phone_number VARCHAR(20),
    payment_method VARCHAR(50) DEFAULT 'M-Pesa',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS public.transactions_y2026 PARTITION OF public.transactions
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE INDEX IF NOT EXISTS idx_transactions_player ON public.transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_transactions_mpesa ON public.transactions(mpesa_receipt_number);

-- ─── 5. JACKPOTS, TOURNAMENTS & CHALLENGES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jackpot_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(100) NOT NULL,
    current_amount NUMERIC(15, 2) DEFAULT 250000.00 CHECK (current_amount >= 0),
    min_wager NUMERIC(10, 2) DEFAULT 100.00,
    seed_amount NUMERIC(15, 2) DEFAULT 50000.00,
    win_probability NUMERIC(10, 8) DEFAULT 0.0001,
    last_won_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mystery_boxes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    box_tier VARCHAR(20) NOT NULL CHECK (box_tier IN ('bronze', 'silver', 'gold', 'platinum')),
    cost NUMERIC(10, 2) NOT NULL,
    prize_won VARCHAR(100) NOT NULL,
    payout_amount NUMERIC(12, 2) DEFAULT 0.00,
    coins_won NUMERIC(15, 4) DEFAULT 0.0000,
    opened_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.player_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    challenge_key VARCHAR(100) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    target_count INT DEFAULT 1,
    current_count INT DEFAULT 0,
    coin_reward NUMERIC(12, 2) DEFAULT 100.00,
    xp_reward INT DEFAULT 50,
    is_completed BOOLEAN DEFAULT FALSE,
    is_claimed BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 6. REALTIME CHAT & WINNER BROADCASTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
    sender_name VARCHAR(100) NOT NULL,
    message_text TEXT NOT NULL,
    emoji_badge VARCHAR(10) DEFAULT '💬',
    is_winner_broadcast BOOLEAN DEFAULT FALSE,
    win_amount_label VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.winner_broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_label VARCHAR(50) NOT NULL,
    prize_label VARCHAR(50) NOT NULL,
    multiplier_label VARCHAR(50) NOT NULL,
    game_label VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 7. SECURITY AUDIT & DEVICE FINGERPRINTING ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 8. ATOMIC TRANSACTIONAL PROCEDURES & RPC FUNCTIONS ────────────────────

-- A. Auto-Create Wallet on Player Creation
CREATE OR REPLACE FUNCTION fn_on_player_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.wallets (player_id, cash_balance, coin_balance)
    VALUES (NEW.id, 0.00, 200.0000)
    ON CONFLICT (player_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_on_player_created ON public.players;
CREATE TRIGGER trigger_on_player_created
AFTER INSERT ON public.players
FOR EACH ROW EXECUTE FUNCTION fn_on_player_created();

-- B. Atomic Spin Engine Procedure (Prevents Race Conditions & Negative Balances)
CREATE OR REPLACE FUNCTION fn_execute_spin(
    p_player_id UUID,
    p_bet_amount NUMERIC,
    p_slice_label TEXT,
    p_win_amount NUMERIC,
    p_multiplier NUMERIC,
    p_coins_gained NUMERIC,
    p_xp_gained INT
)
RETURNS JSONB AS $$
DECLARE
    v_wallet public.wallets%ROWTYPE;
    v_player public.players%ROWTYPE;
    v_bal_before NUMERIC;
    v_bal_after NUMERIC;
    v_session_id UUID;
BEGIN
    -- 1. Lock Player & Wallet Row for Update
    SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Player profile not found'; END IF;

    SELECT * INTO v_wallet FROM public.wallets WHERE player_id = p_player_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Player wallet not found'; END IF;

    v_bal_before := v_wallet.cash_balance;

    -- 2. Validate Wager Balance
    IF v_bal_before < p_bet_amount THEN
        RAISE EXCEPTION 'Insufficient cash balance';
    END IF;

    v_bal_after := v_bal_before - p_bet_amount + p_win_amount;

    -- 3. Mutate Wallet Atomically
    UPDATE public.wallets
    SET cash_balance = v_bal_after,
        coin_balance = coin_balance + p_coins_gained,
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- 4. Record Wallet Ledger Entry
    IF p_bet_amount > 0 THEN
        INSERT INTO public.wallet_ledger (wallet_id, player_id, entry_type, category, amount, balance_before, balance_after, description)
        VALUES (v_wallet.id, p_player_id, 'debit', 'game_wager', p_bet_amount, v_bal_before, v_bal_before - p_bet_amount, 'Wheel Spin Wager');
    END IF;

    IF p_win_amount > 0 THEN
        INSERT INTO public.wallet_ledger (wallet_id, player_id, entry_type, category, amount, balance_before, balance_after, description)
        VALUES (v_wallet.id, p_player_id, 'credit', 'game_payout', p_win_amount, v_bal_before - p_bet_amount, v_bal_after, 'Wheel Spin Payout');
    END IF;

    -- 5. Record Game Session
    INSERT INTO public.game_sessions (player_id, game, wager_amount, payout_amount, multiplier, slice_label, coins_rewarded, xp_gained, server_seed_id)
    VALUES (p_player_id, 'wheel_spin', p_bet_amount, p_win_amount, p_multiplier, p_slice_label, p_coins_gained, p_xp_gained, NULL)
    RETURNING id INTO v_session_id;

    -- 6. Update Player XP & Tier
    UPDATE public.players
    SET xp_points = xp_points + p_xp_gained,
        updated_at = NOW()
    WHERE id = p_player_id;

    RETURN jsonb_build_object(
        'success', true,
        'sessionId', v_session_id,
        'newCashBalance', v_bal_after,
        'newCoinBalance', v_wallet.coin_balance + p_coins_gained
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 9. ROW-LEVEL SECURITY (RLS) POLICIES ───────────────────────────────────
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mystery_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winner_broadcasts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Players read own profile') THEN
        CREATE POLICY "Players read own profile" ON public.players FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Players read own wallet') THEN
        CREATE POLICY "Players read own wallet" ON public.wallets FOR SELECT USING (player_id IN (SELECT id FROM public.players WHERE user_id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public view live chat') THEN
        CREATE POLICY "Public view live chat" ON public.live_chats FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public view winner broadcasts') THEN
        CREATE POLICY "Public view winner broadcasts" ON public.winner_broadcasts FOR SELECT USING (true);
    END IF;
END $$;

-- Enable Realtime Replication
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE publication_name = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_chats') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chats;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE publication_name = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'winner_broadcasts') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.winner_broadcasts;
    END IF;
END $$;

-- ─── 11. QA TESTER ACCOUNT INITIALIZATION (britannycooke98@gmail.com) ──────
DO $$ 
DECLARE
    v_player_id UUID;
BEGIN
    -- 1. Insert or update tester player in public.players
    INSERT INTO public.players (email, display_name, vip_tier, xp_points, free_spins_count)
    VALUES ('britannycooke98@gmail.com', 'Britanny Cooke (Tester)', 'diamond', 15000, 50)
    ON CONFLICT (email) DO UPDATE 
    SET vip_tier = 'diamond',
        display_name = 'Britanny Cooke (Tester)'
    RETURNING id INTO v_player_id;

    IF v_player_id IS NULL THEN
        SELECT id INTO v_player_id FROM public.players WHERE email = 'britannycooke98@gmail.com';
    END IF;

    -- 2. Insert or update financial wallet in public.wallets with 250,000 balance
    IF v_player_id IS NOT NULL THEN
        INSERT INTO public.wallets (player_id, cash_balance, coin_balance, bonus_balance)
        VALUES (v_player_id, 250000.00, 250000.0000, 0.00)
        ON CONFLICT (player_id) DO UPDATE 
        SET cash_balance = 250000.00,
            coin_balance = 250000.0000,
            updated_at = NOW();

        -- 3. Record transaction in financial double-entry ledger table
        INSERT INTO public.financial_ledger (wallet_id, player_id, entry_type, transaction_type, amount, balance_after, description)
        VALUES (
            (SELECT id FROM public.wallets WHERE player_id = v_player_id),
            v_player_id,
            'credit',
            'vip_bonus',
            250000.00,
            250000.00,
            'QA Tester Account 250,000 Seed Balance (britannycooke98@gmail.com)'
        );
    END IF;
END $$;
