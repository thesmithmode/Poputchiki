DROP INDEX IF EXISTS complaints_unique_per_week_idx;
DROP FUNCTION IF EXISTS complaint_week_utc(timestamptz);
