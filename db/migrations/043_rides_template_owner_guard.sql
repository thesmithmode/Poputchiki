-- Enforce that a ride can reference only a template owned by the same driver.
-- This prevents foreign template_id rows from blocking scheduled template expansion.

UPDATE rides r
SET template_id = NULL
WHERE template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM ride_templates t
    WHERE t.id = r.template_id
      AND t.driver_id = r.driver_id
  );

CREATE OR REPLACE FUNCTION app.enforce_ride_template_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM ride_templates t
    WHERE t.id = NEW.template_id
      AND t.driver_id = NEW.driver_id
  ) THEN
    RAISE EXCEPTION 'ride template_id must belong to the same driver'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rides_template_owner_guard
  BEFORE INSERT OR UPDATE OF driver_id, template_id ON rides
  FOR EACH ROW
  EXECUTE FUNCTION app.enforce_ride_template_owner();
