-- Rollback 028: убрать 'ride_completed' из CHECK notification_preferences.category.

ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_category_check
  CHECK (category IN (
    'ride_request',
    'ride_request_accepted',
    'ride_request_rejected',
    'ride_request_cancelled',
    'ride_cancelled',
    'confirm_participation',
    'participation_request',
    'like_received',
    'review_received',
    'favorite_new_ride',
    'support_reply',
    'system'
  ));
