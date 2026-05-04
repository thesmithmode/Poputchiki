-- Rollback 002: обратный порядок (зависимости)
DROP FUNCTION IF EXISTS app.book_seat(uuid);
DROP TABLE IF EXISTS ride_participation CASCADE;
DROP TABLE IF EXISTS ride_requests CASCADE;
DROP TABLE IF EXISTS rides CASCADE;
DROP TABLE IF EXISTS ride_templates CASCADE;
