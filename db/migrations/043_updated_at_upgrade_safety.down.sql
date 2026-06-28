DROP TRIGGER IF EXISTS trg_updated_at_notification_preferences ON notification_preferences;
DROP TRIGGER IF EXISTS trg_updated_at_support_messages ON support_messages;
DROP TRIGGER IF EXISTS trg_updated_at_users ON users;
DROP TRIGGER IF EXISTS trg_updated_at_ride_templates ON ride_templates;
DROP TRIGGER IF EXISTS trg_updated_at_rides ON rides;

ALTER TABLE favorites DROP COLUMN IF EXISTS notify;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS updated_at;
ALTER TABLE support_messages DROP COLUMN IF EXISTS updated_at;
ALTER TABLE ride_templates DROP COLUMN IF EXISTS updated_at;
ALTER TABLE users DROP COLUMN IF EXISTS updated_at;
