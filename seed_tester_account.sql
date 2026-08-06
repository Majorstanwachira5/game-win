-- ============================================================================
-- 🎰 SPIN & WIN PLATFORM — SUPABASE TESTER ACCOUNT INITIALIZATION SCRIPT
-- Target Account: britannycooke98@gmail.com
-- Sets Initial Wallet Balance to 250,000 and records in financial ledger
-- ============================================================================

DO $$ 
DECLARE
    v_player_id UUID;
    v_wallet_id UUID;
BEGIN
    -- 1. Upsert player record into public.players
    INSERT INTO public.players (email, display_name, vip_tier, xp_points, free_spins_count)
    VALUES ('britannycooke98@gmail.com', 'Britanny Cooke (Tester)', 'diamond', 15000, 50)
    ON CONFLICT (email) DO UPDATE 
    SET vip_tier = 'diamond',
        display_name = 'Britanny Cooke (Tester)'
    RETURNING id INTO v_player_id;

    IF v_player_id IS NULL THEN
        SELECT id INTO v_player_id FROM public.players WHERE email = 'britannycooke98@gmail.com';
    END IF;

    -- 2. Upsert financial wallet into public.wallets with 250,000 balance
    IF v_player_id IS NOT NULL THEN
        INSERT INTO public.wallets (player_id, cash_balance, coin_balance, bonus_balance)
        VALUES (v_player_id, 250000.00, 250000.0000, 0.00)
        ON CONFLICT (player_id) DO UPDATE 
        SET cash_balance = 250000.00,
            coin_balance = 250000.0000,
            updated_at = NOW()
        RETURNING id INTO v_wallet_id;

        IF v_wallet_id IS NULL THEN
            SELECT id INTO v_wallet_id FROM public.wallets WHERE player_id = v_player_id;
        END IF;

        -- 3. Log initial seed transaction into public.financial_ledger
        INSERT INTO public.financial_ledger (wallet_id, player_id, entry_type, transaction_type, amount, balance_after, description)
        VALUES (
            v_wallet_id,
            v_player_id,
            'credit',
            'vip_bonus',
            250000.00,
            250000.00,
            'QA Tester Initial Seed Credit (britannycooke98@gmail.com)'
        );
    END IF;
END $$;
