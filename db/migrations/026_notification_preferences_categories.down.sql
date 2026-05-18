-- Migration 026 down: revert to original 8-category CHECK.
-- WARNING: drops rows whose category is not in the original set.

DELETE FROM notification_preferences
WHERE category NOT IN (
  'ride_request',
  'ride_cancelled',
  'confirm_participation',
  'like_received',
  'review_received',
  'favorite_new_ride',
  'support_reply',
  'system'
);

ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_category_check
  CHECK (category IN (
    'ride_request',
    'ride_cancelled',
    'confirm_participation',
    'like_received',
    'review_received',
    'favorite_new_ride',
    'support_reply',
    'system'
  ));
