-- Remove any erroneous simple UNIQUE constraint that may exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'complaints'::regclass
      AND contype = 'u'
      AND conname NOT LIKE '%_idx%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE complaints DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'complaints'::regclass
        AND contype = 'u'
        AND conname NOT LIKE '%_idx%'
      LIMIT 1
    );
  END IF;
END $$;

-- Partial unique index: one complaint per reporter-target pair per calendar week
-- COALESCE ride_id to nil UUID so NULL values are treated as equal in the unique check
CREATE UNIQUE INDEX IF NOT EXISTS complaints_unique_per_week_idx
  ON complaints (
    reporter_id,
    target_id,
    COALESCE(ride_id, '00000000-0000-0000-0000-000000000000'::uuid),
    date_trunc('week', created_at)
  );
