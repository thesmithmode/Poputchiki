-- Rollback 002: обратный порядок (зависимости)
DROP FUNCTION IF EXISTS app.book_seat(uuid);
DROP TABLE IF EXISTS ride_participation CASCADE;
DROP TABLE IF EXISTS ride_requests CASCADE;
DROP FUNCTION IF EXISTS app.enforce_ride_participation_write();
DROP FUNCTION IF EXISTS app.enforce_ride_request_update();
DROP TABLE IF EXISTS rides CASCADE;
DROP TABLE IF EXISTS ride_templates CASCADE;
