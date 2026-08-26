-- ============================================================================
-- 🎰 SPIN & WIN (RAM) POSTGRESQL SEED SCRIPT — 20 USERS & M-PESA TILL DATA
-- ============================================================================

-- 1. Insert 20 Registered Players
INSERT INTO users (id, phone, email, display_name, balance, coins, referral_balance, referral_earnings, referral_code, referral_count, is_active, is_banned, is_tester, created_at)
VALUES
    ('usr_kelvin', '0712345678', 'kelvin.mwangi@gmail.com', 'Kelvin Mwangi', 250.00, 500.00, 100.00, 100.00, 'KELVIN254', 1, TRUE, FALSE, FALSE, '2026-08-10 09:15:00'),
    ('usr_brian', '0723456789', 'brian.ochieng@yahoo.com', 'Brian Ochieng', 300.00, 600.00, 150.00, 150.00, 'BRIAN_K', 2, TRUE, FALSE, FALSE, '2026-08-12 11:30:00'),
    ('usr_faith', '0734567890', 'faith.wambui@outlook.com', 'Faith Wambui', 250.00, 500.00, 0.00, 0.00, 'FAITH_W', 0, TRUE, FALSE, FALSE, '2026-08-14 14:20:00'),
    ('usr_mercy', '0745678901', 'mercy.chebet@gmail.com', 'Mercy Chebet', 250.00, 500.00, 50.00, 50.00, 'MERCY_C', 1, TRUE, FALSE, FALSE, '2026-08-15 16:45:00'),
    ('usr_dennis', '0756789012', 'dennis.kiprono@gmail.com', 'Dennis Kiprono', 250.00, 500.00, 0.00, 0.00, 'DENNIS_K', 0, TRUE, FALSE, FALSE, '2026-08-16 10:10:00'),
    ('usr_brittany_tester', '0733445566', 'brittany@tester.com', 'Brittany Tester', 250000.00, 500000.00, 0.00, 0.00, 'TESTVIP', 0, TRUE, FALSE, TRUE, '2026-08-10 14:00:00'),
    ('usr_john', '0767890123', 'john.kamau@gmail.com', 'John Kamau', 0.00, 100.00, 0.00, 0.00, 'JOHN_K', 0, TRUE, FALSE, FALSE, '2026-08-17 08:00:00'),
    ('usr_sarah', '0778901234', 'sarah.njeri@gmail.com', 'Sarah Njeri', 0.00, 100.00, 0.00, 0.00, 'SARAH_N', 0, TRUE, FALSE, FALSE, '2026-08-17 11:25:00'),
    ('usr_emma', '0789012345', 'emmanuel.kip@yahoo.com', 'Emmanuel Kipkemoi', 0.00, 100.00, 0.00, 0.00, 'EMMA_K', 0, TRUE, FALSE, FALSE, '2026-08-18 09:40:00'),
    ('usr_agnes', '0790123456', 'agnes.achieng@gmail.com', 'Agnes Achieng', 0.00, 100.00, 0.00, 0.00, 'AGNES_A', 0, TRUE, FALSE, FALSE, '2026-08-18 15:10:00'),
    ('usr_kevin', '0701234567', 'kevin.otieno@gmail.com', 'Kevin Otieno', 0.00, 100.00, 0.00, 0.00, 'KEV_O', 0, TRUE, FALSE, FALSE, '2026-08-19 08:30:00'),
    ('usr_cynth', '0711223344', 'cynthia.muthoni@gmail.com', 'Cynthia Muthoni', 0.00, 100.00, 0.00, 0.00, 'CYNTHIA_M', 0, TRUE, FALSE, FALSE, '2026-08-19 13:50:00'),
    ('usr_evans', '0722334455', 'evans.koech@gmail.com', 'Evans Koech', 0.00, 100.00, 0.00, 0.00, 'EVANS_K', 0, TRUE, FALSE, FALSE, '2026-08-20 10:05:00'),
    ('usr_joyce', '0733445566', 'joyce.wangari@gmail.com', 'Joyce Wangari', 0.00, 100.00, 0.00, 0.00, 'JOYCE_W', 0, TRUE, FALSE, FALSE, '2026-08-20 17:20:00'),
    ('usr_victor', '0744556677', 'victor.mutua@gmail.com', 'Victor Mutua', 0.00, 100.00, 0.00, 0.00, 'VICTOR_M', 0, TRUE, FALSE, FALSE, '2026-08-21 09:15:00'),
    ('usr_sharon', '0755667788', 'sharon.cherotich@gmail.com', 'Sharon Cherotich', 0.00, 100.00, 0.00, 0.00, 'SHARON_C', 0, TRUE, FALSE, FALSE, '2026-08-21 14:40:00'),
    ('usr_david', '0766778899', 'david.maina@gmail.com', 'David Maina', 0.00, 100.00, 0.00, 0.00, 'DAVID_M', 0, TRUE, FALSE, FALSE, '2026-08-22 08:50:00'),
    ('usr_grace', '0777889900', 'grace.nyambura@gmail.com', 'Grace Nyambura', 0.00, 100.00, 0.00, 0.00, 'GRACE_N', 0, TRUE, FALSE, FALSE, '2026-08-22 16:15:00'),
    ('usr_samuel', '0788990011', 'samuel.kibet@gmail.com', 'Samuel Kibet', 0.00, 100.00, 0.00, 0.00, 'SAMUEL_K', 0, TRUE, FALSE, FALSE, '2026-08-23 11:00:00'),
    ('usr_lucy', '0799001122', 'lucy.wanjiku@gmail.com', 'Lucy Wanjiku', 0.00, 100.00, 0.00, 0.00, 'LUCY_W', 0, TRUE, FALSE, FALSE, '2026-08-24 08:20:00')
ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    balance = EXCLUDED.balance,
    coins = EXCLUDED.coins,
    referral_balance = EXCLUDED.referral_balance,
    referral_earnings = EXCLUDED.referral_earnings,
    referral_code = EXCLUDED.referral_code,
    referral_count = EXCLUDED.referral_count,
    is_active = EXCLUDED.is_active,
    is_banned = EXCLUDED.is_banned,
    is_tester = EXCLUDED.is_tester,
    created_at = EXCLUDED.created_at;

-- 2. Platform Stats
INSERT INTO platform_stats (id, total_revenue, total_payout, total_spins)
VALUES (1, 1300.00, 0.00, 0)
ON CONFLICT (id) DO UPDATE SET
    total_revenue = EXCLUDED.total_revenue;

-- 3. Probability Slices
INSERT INTO probability_slices (id, label, type, multiplier, count, weight, color, text_color, display_order) VALUES
('try_again_1', 'TRY AGAIN', 'loss', 0.00, 0, 45000, '#7a1414', '#ffffff', 1),
('try_again_2', 'TRY AGAIN', 'loss', 0.00, 0, 20000, '#560e0e', '#ffffff', 2),
('mult_0_1', '×0.1', 'win', 0.10, 0, 9500, '#0d4a52', '#ffffff', 3),
('mult_0_2', '×0.2', 'win', 0.20, 0, 6500, '#135c66', '#ffffff', 4),
('mult_0_5', '×0.5', 'win', 0.50, 0, 4500, '#1c7582', '#ffffff', 5),
('mult_1_0', '×1', 'win', 1.00, 0, 3000, '#0a3d62', '#ffffff', 6),
('mult_2_0', '×2', 'win', 2.00, 0, 1300, '#00a8cc', '#ffffff', 7),
('mult_5_0', '×5', 'win', 5.00, 0, 600, '#cca400', '#000000', 8),
('mult_10_0', '×10', 'win', 10.00, 0, 150, '#00d2ff', '#000000', 9),
('mult_20_0', '×20', 'win', 20.00, 0, 50, '#ffb700', '#000000', 10),
('jackpot_50', '×50 JACKPOT', 'jackpot', 50.00, 0, 5, '#ffe600', '#000000', 11),
('free_spin_1', '🎁 FREE SPIN', 'free_spin', 0.00, 1, 6500, '#0f7568', '#ffffff', 12),
('free_spin_2', '🎁 2 FREE SPINS', 'free_spin', 0.00, 2, 2500, '#0c574d', '#ffffff', 13),
('double_win', '🔥 DOUBLE NEXT WIN', 'double_next', 0.00, 0, 395, '#d9411e', '#ffffff', 14)
ON CONFLICT (id) DO NOTHING;

-- 4. Insert M-Pesa Till 1584329 Deposits & Transactions (Accumulative: 6,500 KES, Completed: 1,300 KES, 1x Till Conflict: 250 KES)
INSERT INTO deposits_log (id, user_id, amount, currency, method, phone_or_email, status, mpesa_checkout_request_id, mpesa_receipt_number, metadata, created_at)
VALUES
    -- Real completed payments (Total: 1,300 KES)
    ('TX_1701', 'usr_kelvin', 250.00, 'KSh', 'M-Pesa Till 1584329', '0712345678', 'COMPLETED', 'ws_CO_17082026_001', 'SHB4X7K92P', '{"reason": "Account Activation Deposit"}'::jsonb, '2026-08-17 10:15:00'),
    ('TX_1802', 'usr_brian',  300.00, 'KSh', 'M-Pesa Till 1584329', '0723456789', 'COMPLETED', 'ws_CO_18082026_002', 'SHC2M9Q81R', '{"reason": "Account Activation & Credit"}'::jsonb, '2026-08-18 14:22:00'),
    ('TX_1903', 'usr_faith',  250.00, 'KSh', 'M-Pesa Till 1584329', '0734567890', 'COMPLETED', 'ws_CO_19082026_003', 'SHD8N3W54L', '{"reason": "Account Activation Deposit"}'::jsonb, '2026-08-19 11:05:00'),
    ('TX_2104', 'usr_mercy',  250.00, 'KSh', 'M-Pesa Till 1584329', '0745678901', 'COMPLETED', 'ws_CO_21082026_004', 'SHE1P7V29K', '{"reason": "Account Activation Deposit"}'::jsonb, '2026-08-21 16:30:00'),
    ('TX_2205', 'usr_dennis', 250.00, 'KSh', 'M-Pesa Till 1584329', '0756789012', 'COMPLETED', 'ws_CO_22082026_005', 'SHF6R4T83J', '{"reason": "Account Activation Deposit"}'::jsonb, '2026-08-22 09:45:00'),

    -- One-time declined transaction due to Till Conflict (250 KES on 17th)
    ('TX_1799', 'usr_sarah',  250.00, 'KSh', 'M-Pesa Till 1584329', '0778901234', 'FAILED',    'ws_CO_17082026_999', '—',          '{"reason": "Declined: Till Conflict (Active deposits began 17th)", "error": "TILL_CONFLICT"}'::jsonb, '2026-08-17 11:30:00'),

    -- Unresolved / Cancelled / Failed attempts (Total: 4,950 KES)
    ('TX_1711', 'usr_john',   1000.00,'KSh', 'M-Pesa Till 1584329', '0767890123', 'FAILED',    'ws_CO_17082026_101', '—',          '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}'::jsonb, '2026-08-17 15:40:00'),
    ('TX_1812', 'usr_emma',   1000.00,'KSh', 'M-Pesa Till 1584329', '0789012345', 'FAILED',    'ws_CO_18082026_102', '—',          '{"reason": "USSD Request Timed Out", "error": "USSD_TIMEOUT"}'::jsonb, '2026-08-18 16:55:00'),
    ('TX_1913', 'usr_agnes',  750.00, 'KSh', 'M-Pesa Till 1584329', '0790123456', 'FAILED',    'ws_CO_19082026_103', '—',          '{"reason": "Insufficient Funds on M-Pesa", "error": "INSUFFICIENT_FUNDS"}'::jsonb, '2026-08-19 17:12:00'),
    ('TX_2014', 'usr_kevin',  500.00, 'KSh', 'M-Pesa Till 1584329', '0701234567', 'FAILED',    'ws_CO_20082026_104', '—',          '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}'::jsonb, '2026-08-20 12:20:00'),
    ('TX_2115', 'usr_cynth',  500.00, 'KSh', 'M-Pesa Till 1584329', '0711223344', 'FAILED',    'ws_CO_21082026_105', '—',          '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}'::jsonb, '2026-08-21 13:45:00'),
    ('TX_2216', 'usr_evans',  500.00, 'KSh', 'M-Pesa Till 1584329', '0722334455', 'FAILED',    'ws_CO_22082026_106', '—',          '{"reason": "USSD Request Timed Out", "error": "USSD_TIMEOUT"}'::jsonb, '2026-08-22 14:10:00'),
    ('TX_2317', 'usr_joyce',  400.00, 'KSh', 'M-Pesa Till 1584329', '0733445566', 'FAILED',    'ws_CO_23082026_107', '—',          '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}'::jsonb, '2026-08-23 10:30:00'),
    ('TX_2418', 'usr_victor', 300.00, 'KSh', 'M-Pesa Till 1584329', '0744556677', 'FAILED',    'ws_CO_24082026_108', '—',          '{"reason": "User Cancelled via USSD Prompt", "error": "CANCELLED_BY_USER"}'::jsonb, '2026-08-24 09:15:00')
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    phone_or_email = EXCLUDED.phone_or_email,
    mpesa_checkout_request_id = EXCLUDED.mpesa_checkout_request_id,
    mpesa_receipt_number = EXCLUDED.mpesa_receipt_number,
    metadata = EXCLUDED.metadata;
