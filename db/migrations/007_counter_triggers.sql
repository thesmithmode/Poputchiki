-- Migration 007: Trigger functions to maintain denormalized counters on users.
-- Covers: likes_received_count, rides_total_count, rides_completed_count.

-- ---------------------------------------------------------------------------
-- likes_received_count: +1 on INSERT likes, -1 on DELETE likes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.trg_likes_update_count()
  RETURNS trigger LANGUAGE plpgsql AS $$
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
  RETURNS trigger LANGUAGE plpgsql AS $$
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
  RETURNS trigger LANGUAGE plpgsql AS $$
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
