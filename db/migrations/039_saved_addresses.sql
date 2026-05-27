-- Migration 039: таблица сохранённых адресов (дом/работа/кастомные)

CREATE TABLE saved_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('home', 'work', 'custom')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
  address_label TEXT NOT NULL CHECK (length(address_label) >= 1),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_addresses_user ON saved_addresses(user_id);
CREATE UNIQUE INDEX idx_saved_addresses_home ON saved_addresses(user_id) WHERE type = 'home';
CREATE UNIQUE INDEX idx_saved_addresses_work ON saved_addresses(user_id) WHERE type = 'work';

ALTER TABLE saved_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_addresses FORCE ROW LEVEL SECURITY;

CREATE POLICY saved_addresses_own ON saved_addresses
  FOR ALL TO poputchiki_app
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY saved_addresses_service ON saved_addresses
  FOR ALL TO poputchiki_service
  USING (true)
  WITH CHECK (true);
