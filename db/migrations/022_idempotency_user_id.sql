-- Migration 022: добавить user_id в idempotency_keys для изоляции ключей между пользователями.
-- Проблема: ключ уникален только по значению — два разных пользователя с одним ключом конфликтуют.
-- Решение: уникальный индекс (key, user_id); NULL означает unauthenticated endpoint.

ALTER TABLE idempotency_keys ADD COLUMN user_id uuid DEFAULT NULL;

-- Перенести user_id из JSON поля response в колонку (для существующих записей)
UPDATE idempotency_keys
  SET user_id = (response->>'user_id')::uuid
  WHERE response->>'user_id' IS NOT NULL;

-- Заменить PRIMARY KEY (key) на UNIQUE INDEX (key, user_id) — поддерживает NULL user_id
ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_pkey;
CREATE UNIQUE INDEX idempotency_keys_key_user_uidx ON idempotency_keys (key, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE idempotency_keys ALTER COLUMN user_id DROP DEFAULT;
