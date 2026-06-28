-- Rollback migration 031: restore original subject-only social insert policies

DROP POLICY IF EXISTS reviews_insert ON reviews;
CREATE POLICY reviews_insert ON reviews
  FOR INSERT WITH CHECK (subject_id = app.current_user_id());

DROP POLICY IF EXISTS likes_insert ON likes;
CREATE POLICY likes_insert ON likes
  FOR INSERT WITH CHECK (subject_id = app.current_user_id());

DROP FUNCTION IF EXISTS app.can_socially_rate_ride(uuid, uuid, uuid);
