-- Rollback 022: убрать user_id из idempotency_keys, восстановить PRIMARY KEY.

DROP INDEX IF EXISTS idempotency_keys_key_user_uidx;
ALTER TABLE idempotency_keys DROP COLUMN IF EXISTS user_id;
ALTER TABLE idempotency_keys ADD PRIMARY KEY (key);
