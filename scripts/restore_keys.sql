INSERT INTO users (email, password, first_name, last_name, email_verified, balance, created_at, updated_at)
VALUES ('dev@mumin.ink', '$2b$10$EpIor.b0.1234567890', 'Dev', 'User', true, 10000, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET balance = 10000;

INSERT INTO api_keys (
    key_hash, 
    key_prefix, 
    user_email, 
    user_id, 
    is_active, 
    max_daily_requests, 
    trust_score, 
    description,
    created_at,
    last_activity_date
)
VALUES (
    'f6cd8545244271aa880a6612fe1fde1c64e78302e341b79fa6d6c9285acb89eb',
    'sk_mumin_test',
    'dev@mumin.ink',
    (SELECT id FROM users WHERE email = 'dev@mumin.ink'),
    true,
    10000, -- Wait, max_daily_requests was 1000 in seed.ts, but user probably wants enough limit. 10000 is fine.
    100,
    'Default Development Key',
    NOW(),
    NOW()
)
ON CONFLICT (key_hash) DO NOTHING;
