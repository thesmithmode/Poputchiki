DROP INDEX IF EXISTS rides_template_departure_uidx;
DROP INDEX IF EXISTS idx_favorites_notify;
DROP INDEX IF EXISTS idx_ride_requests_passenger_status;
DROP INDEX IF EXISTS idx_ride_templates_active;

CREATE INDEX IF NOT EXISTS idx_ride_templates_driver ON ride_templates (driver_id) WHERE is_active = true;
