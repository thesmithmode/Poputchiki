-- Migration 007: Trigger functions to maintain denormalized counters on users.
-- Covers: likes_received_count, rides_total_count, rides_completed_count.

-- ---------------------------------------------------------------------------
-- likes_received_count: +1 on INSERT likes, -1 on DELETE likes
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: triggers update users rows for OTHER users (e.g. likes.target_id).
-- Under FORCE RLS the UPDATE would be filtered by users_update_self → 0 rows → counter drift.
CREATE OR REPLACE FUNCTION app.trg_likes_update_count()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET likes_received_count = likes_received_count + 1
    WHERE id = NEW.target_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users SET likes_received_count = GREATEST(0, likes_received_count - 1)
    WHERE id = OLD.target_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_likes_count
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION app.trg_likes_update_count();

-- ---------------------------------------------------------------------------
-- rides_total_count: +1 on INSERT rides (driver)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.trg_rides_insert_count()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE users SET rides_total_count = rides_total_count + 1
  WHERE id = NEW.driver_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_rides_insert
  AFTER INSERT ON rides
  FOR EACH ROW EXECUTE FUNCTION app.trg_rides_insert_count();

-- ---------------------------------------------------------------------------
-- rides_completed_count: +1 when ride.status transitions to 'completed'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.trg_rides_completed_count()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    UPDATE users SET rides_completed_count = rides_completed_count + 1
    WHERE id = NEW.driver_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_rides_completed
  AFTER UPDATE OF status ON rides
  FOR EACH ROW EXECUTE FUNCTION app.trg_rides_completed_count();

-- ---------------------------------------------------------------------------
-- set_updated_at: universal trigger to maintain updated_at on every UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_updated_at_rides
  BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_updated_at_ride_templates
  BEFORE UPDATE ON ride_templates
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_updated_at_support_messages
  BEFORE UPDATE ON support_messages
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_updated_at_notification_preferences
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
