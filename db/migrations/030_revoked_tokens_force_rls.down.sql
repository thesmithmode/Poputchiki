-- Rollback 030: revoked_tokens — выключить FORCE RLS (вернуть к состоянию из 008).

ALTER TABLE revoked_tokens NO FORCE ROW LEVEL SECURITY;
