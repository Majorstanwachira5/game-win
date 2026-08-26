-- ============================================================================
-- 🎰 SPIN & WIN CASINO PLATFORM — 20 USERS & PAYMENT TILL SEED SCRIPT
-- ============================================================================
-- Seeding 20 registered players with names, emails, Kenyan Safaricom phones,
-- and M-Pesa Till 1584329 transaction records (Accumulative: 6,500 KES,
-- Completed: 1,300 KES, 1x Declined Till Conflict: 250 KES on 17th,
-- Available Till Balance: 1,200 KES as of 22nd).
-- ============================================================================

DO $$
DECLARE
    u_kelvin UUID := '00000000-0000-0000-0001-000000000001';
    u_brian  UUID := '00000000-0000-0000-0001-000000000002';
    u_faith  UUID := '00000000-0000-0000-0001-000000000003';
    u_mercy  UUID := '00000000-0000-0000-0001-000000000004';
    u_dennis UUID := '00000000-0000-0000-0001-000000000005';
    u_brit   UUID := '00000000-0000-0000-0001-000000000006';
    u_john   UUID := '00000000-0000-0000-0001-000000000007';
    u_sarah  UUID := '00000000-0000-0000-0001-000000000008';
    u_emma   UUID := '00000000-0000-0000-0001-000000000009';
    u_agnes  UUID := '00000000-0000-0000-0001-000000000010';
    u_kevin  UUID := '00000000-0000-0000-0001-000000000011';
    u_cynth  UUID := '00000000-0000-0000-0001-000000000012';
    u_evans  UUID := '00000000-0000-0000-0001-000000000013';
    u_joyce  UUID := '00000000-0000-0000-0001-000000000014';
    u_victor UUID := '00000000-0000-0000-0001-000000000015';
    u_sharon UUID := '00000000-0000-0000-0001-000000000016';
    u_david  UUID := '00000000-0000-0000-0001-000000000017';
    u_grace  UUID := '00000000-0000-0000-0001-000000000018';
    u_samuel UUID := '00000000-0000-0000-0001-000000000019';
    u_lucy   UUID := '00000000-0000-0000-0001-000000000020';
BEGIN
    -- 1. Insert 20 Registered Players
    INSERT INTO public.players (id, email, phone_number, display_name, referral_code, is_active, is_banned, created_at)
    VALUES
        (u_kelvin, 'kelvin.mwangi@gmail.com', '0712345678', 'Kelvin Mwangi', 'KELVIN254', true, false, '2026-08-10 09:15:00+03'),
        (u_brian,  'brian.ochieng@yahoo.com',  '0723456789', 'Brian Ochieng', 'BRIAN_K',   true, false, '2026-08-12 11:30:00+03'),
        (u_faith,  'faith.wambui@outlook.com', '0734567890', 'Faith Wambui',  'FAITH_W',   true, false, '2026-08-14 14:20:00+03'),
        (u_mercy,  'mercy.chebet@gmail.com',   '0745678901', 'Mercy Chebet',  'MERCY_C',   true, false, '2026-08-15 16:45:00+03'),
        (u_dennis, 'dennis.kiprono@gmail.com', '0756789012', 'Dennis Kiprono', 'DENNIS_K',  true, false, '2026-08-16 10:10:00+03'),
        (u_brit,   'brittany@tester.com',      '0733445566', 'Brittany Tester', 'TESTVIP', true, false, '2026-08-10 14:00:00+03'),
        (u_john,   'john.kamau@gmail.com',     '0767890123', 'John Kamau',     'JOHN_K',    true, false, '2026-08-17 08:00:00+03'),
        (u_sarah,  'sarah.njeri@gmail.com',    '0778901234', 'Sarah Njeri',    'SARAH_N',   true, false, '2026-08-17 11:25:00+03'),
        (u_emma,   'emmanuel.kip@yahoo.com',   '0789012345', 'Emmanuel Kipkemoi', 'EMMA_K', true, false, '2026-08-18 09:40:00+03'),
        (u_agnes,  'agnes.achieng@gmail.com',  '0790123456', 'Agnes Achieng',  'AGNES_A',   true, false, '2026-08-18 15:10:00+03'),
        (u_kevin,  'kevin.otieno@gmail.com',   '0701234567', 'Kevin Otieno',   'KEV_O',     true, false, '2026-08-19 08:30:00+03'),
        (u_cynth,  'cynthia.muthoni@gmail.com','0711223344', 'Cynthia Muthoni', 'CYNTHIA_M', true, false, '2026-08-19 13:50:00+03'),
        (u_evans,  'evans.koech@gmail.com',    '0722334455', 'Evans Koech',    'EVANS_K',   true, false, '2026-08-20 10:05:00+03'),
        (u_joyce,  'joyce.wangari@gmail.com',  '0733445566', 'Joyce Wangari',  'JOYCE_W',   true, false, '2026-08-20 17:20:00+03'),
        (u_victor, 'victor.mutua@gmail.com',   '0744556677', 'Victor Mutua',   'VICTOR_M',  true, false, '2026-08-21 09:15:00+03'),
        (u_sharon, 'sharon.cherotich@gmail.com','0755667788','Sharon Cherotich','SHARON_C', true, false, '2026-08-21 14:40:00+03'),
        (u_david,  'david.maina@gmail.com',    '0766778899', 'David Maina',    'DAVID_M',   true, false, '2026-08-22 08:50:00+03'),
        (u_grace,  'grace.nyambura@gmail.com', '0777889900', 'Grace Nyambura', 'GRACE_N',   true, false, '2026-08-22 16:15:00+03'),
        (u_samuel, 'samuel.kibet@gmail.com',   '0788990011', 'Samuel Kibet',   'SAMUEL_K',  true, false, '2026-08-23 11:00:00+03'),
        (u_lucy,   'lucy.wanjiku@gmail.com',   '0799001122', 'Lucy Wanjiku',   'LUCY_W',    true, false, '2026-08-24 08:20:00+03')
    ON CONFLICT (email) DO UPDATE SET
        phone_number = EXCLUDED.phone_number,
        display_name = EXCLUDED.display_name,
        created_at = EXCLUDED.created_at;

    -- 2. Insert Wallets for Players
    INSERT INTO public.wallets (player_id, cash_balance, coin_balance)
    VALUES
        (u_kelvin, 250.00, 500.0000),
        (u_brian,  300.00, 600.0000),
        (u_faith,  250.00, 500.0000),
        (u_mercy,  250.00, 500.0000),
        (u_dennis, 250.00, 500.0000),
        (u_brit,   250000.00, 500000.0000),
        (u_john,   0.00, 100.0000),
        (u_sarah,  0.00, 100.0000),
        (u_emma,   0.00, 100.0000),
        (u_agnes,  0.00, 100.0000),
        (u_kevin,  0.00, 100.0000),
        (u_cynth,  0.00, 100.0000),
        (u_evans,  0.00, 100.0000),
        (u_joyce,  0.00, 100.0000),
        (u_victor, 0.00, 100.0000),
        (u_sharon, 0.00, 100.0000),
        (u_david,  0.00, 100.0000),
        (u_grace,  0.00, 100.0000),
        (u_samuel, 0.00, 100.0000),
        (u_lucy,   0.00, 100.0000)
    ON CONFLICT (player_id) DO NOTHING;

    -- 3. Insert M-Pesa Till 1584329 Transactions (Accumulative: 6,500 KES, Real Completed: 1,300 KES, 1x Till Conflict: 250 KES)
    INSERT INTO public.transactions (player_id, type, amount, status, mpesa_checkout_request_id, mpesa_receipt_number, phone_number, created_at, metadata)
    VALUES
        -- Real completed payments (Total: 1,300 KES)
        (u_kelvin, 'deposit', 250.00, 'completed', 'ws_CO_17082026_001', 'SHB4X7K92P', '0712345678', '2026-08-17 10:15:00+03', '{"reason": "Account Activation Deposit", "channel": "Till 1584329"}'),
        (u_brian,  'deposit', 300.00, 'completed', 'ws_CO_18082026_002', 'SHC2M9Q81R', '0723456789', '2026-08-18 14:22:00+03', '{"reason": "Account Activation & Game Credit", "channel": "Till 1584329"}'),
        (u_faith,  'deposit', 250.00, 'completed', 'ws_CO_19082026_003', 'SHD8N3W54L', '0734567890', '2026-08-19 11:05:00+03', '{"reason": "Account Activation Deposit", "channel": "Till 1584329"}'),
        (u_mercy,  'deposit', 250.00, 'completed', 'ws_CO_21082026_004', 'SHE1P7V29K', '0745678901', '2026-08-21 16:30:00+03', '{"reason": "Account Activation Deposit", "channel": "Till 1584329"}'),
        (u_dennis, 'deposit', 250.00, 'completed', 'ws_CO_22082026_005', 'SHF6R4T83J', '0756789012', '2026-08-22 09:45:00+03', '{"reason": "Account Activation Deposit", "channel": "Till 1584329"}'),

        -- One-time declined transaction due to Till Conflict (250 KES on 17th)
        (u_sarah,  'deposit', 250.00, 'failed',    'ws_CO_17082026_999', '—',          '0778901234', '2026-08-17 11:30:00+03', '{"reason": "Declined - Till Conflict (Active deposits began 17th)", "error": "TILL_CONFLICT"}'),

        -- Unresolved / Cancelled / Failed attempts (Total: 4,950 KES)
        (u_john,   'deposit', 1000.00,'failed',    'ws_CO_17082026_101', '—',          '0767890123', '2026-08-17 15:40:00+03', '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}'),
        (u_emma,   'deposit', 1000.00,'failed',    'ws_CO_18082026_102', '—',          '0789012345', '2026-08-18 16:55:00+03', '{"reason": "Transaction Expired / Timeout", "error": "USSD_TIMEOUT"}'),
        (u_agnes,  'deposit', 750.00, 'failed',    'ws_CO_19082026_103', '—',          '0790123456', '2026-08-19 17:12:00+03', '{"reason": "Insufficient Funds on M-Pesa", "error": "INSUFFICIENT_FUNDS"}'),
        (u_kevin,  'deposit', 500.00, 'failed',    'ws_CO_20082026_104', '—',          '0701234567', '2026-08-20 12:20:00+03', '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}'),
        (u_cynth,  'deposit', 500.00, 'failed',    'ws_CO_21082026_105', '—',          '0711223344', '2026-08-21 13:45:00+03', '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}'),
        (u_evans,  'deposit', 500.00, 'failed',    'ws_CO_22082026_106', '—',          '0722334455', '2026-08-22 14:10:00+03', '{"reason": "Transaction Expired / Timeout", "error": "USSD_TIMEOUT"}'),
        (u_joyce,  'deposit', 400.00, 'failed',    'ws_CO_23082026_107', '—',          '0733445566', '2026-08-23 10:30:00+03', '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}'),
        (u_victor, 'deposit', 300.00, 'failed',    'ws_CO_24082026_108', '—',          '0744556677', '2026-08-24 09:15:00+03', '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}')
    ON CONFLICT (mpesa_checkout_request_id) DO NOTHING;

END $$;
