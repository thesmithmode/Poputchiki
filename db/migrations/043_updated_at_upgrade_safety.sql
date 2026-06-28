-- Migration 043: forward-compatible backfill for TASK-091 schema changes.
-- Historical migrations 001/002/003 were edited to include these columns, but
-- databases that already applied them need an explicit forward migration.

ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE ride_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS notify boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION app.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_rides') THEN
    CREATE TRIGGER trg_updated_at_rides
      BEFORE UPDATE ON rides
      FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_ride_templates') THEN
    CREATE TRIGGER trg_updated_at_ride_templates
      BEFORE UPDATE ON ride_templates
      FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_users') THEN
    CREATE TRIGGER trg_updated_at_users
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_support_messages') THEN
    CREATE TRIGGER trg_updated_at_support_messages
      BEFORE UPDATE ON support_messages
      FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_notification_preferences') THEN
    CREATE TRIGGER trg_updated_at_notification_preferences
      BEFORE UPDATE ON notification_preferences
      FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
  END IF;
END;
$$;
