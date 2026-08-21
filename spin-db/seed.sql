-- Initial Seed Data for Spin & Win PostgreSQL Database
INSERT INTO users (id, phone, balance, free_spins, double_next_win)
VALUES ('demo-user-1', 'USER 0712***891', 12500.00, 1, FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform_stats (id, total_revenue, total_payout, total_spins)
VALUES (1, 0.00, 0.00, 0)
ON CONFLICT (id) DO NOTHING;

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
