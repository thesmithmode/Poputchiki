-- Rollback 029: вернуть STABLE на pgcrypto PII функции (исходное состояние из 006).

ALTER FUNCTION app.encrypt_pii(text) STABLE;
ALTER FUNCTION app.decrypt_user_pii(uuid) STABLE;
