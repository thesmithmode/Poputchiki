DROP POLICY IF EXISTS saved_addresses_service ON saved_addresses;
DROP POLICY IF EXISTS saved_addresses_own ON saved_addresses;
DROP INDEX IF EXISTS idx_saved_addresses_work;
DROP INDEX IF EXISTS idx_saved_addresses_home;
DROP INDEX IF EXISTS idx_saved_addresses_user;
DROP TABLE IF EXISTS saved_addresses;
