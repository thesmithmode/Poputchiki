-- Trigger: recalculate users.avg_stars + reviews_count after INSERT/UPDATE/DELETE on reviews

-- SECURITY DEFINER: trigger updates users row for the reviewed user (target_id).
-- Under FORCE RLS the UPDATE would be filtered by users_update_self → 0 rows → counter drift.
CREATE OR REPLACE FUNCTION app.update_user_avg_stars()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_target_id uuid;
BEGIN
  v_target_id := COALESCE(NEW.target_id, OLD.target_id);

  UPDATE users
  SET
    avg_stars    = sub.avg_val,
    reviews_count = sub.cnt
  FROM (
    SELECT
      AVG(stars)::numeric(3,2) AS avg_val,
      COUNT(*)::int              AS cnt
    FROM reviews
    WHERE target_id = v_target_id
  ) sub
  WHERE id = v_target_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_avg_stars
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION app.update_user_avg_stars();
