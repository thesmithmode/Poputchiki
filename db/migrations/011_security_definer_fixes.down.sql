-- Revert migration 011.

DROP FUNCTION IF EXISTS app.book_seat(uuid);

ALTER FUNCTION app.trg_likes_update_count() SECURITY INVOKER RESET search_path;
ALTER FUNCTION app.trg_rides_insert_count() SECURITY INVOKER RESET search_path;
ALTER FUNCTION app.trg_rides_completed_count() SECURITY INVOKER RESET search_path;
