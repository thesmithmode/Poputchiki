DROP TRIGGER IF EXISTS trg_rides_completed ON rides;
DROP TRIGGER IF EXISTS trg_rides_insert ON rides;
DROP TRIGGER IF EXISTS trg_likes_count ON likes;
DROP FUNCTION IF EXISTS app.trg_rides_completed_count();
DROP FUNCTION IF EXISTS app.trg_rides_insert_count();
DROP FUNCTION IF EXISTS app.trg_likes_update_count();
