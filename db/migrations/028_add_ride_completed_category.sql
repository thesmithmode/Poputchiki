-- Migration 028: добавить 'ride_completed' в CHECK notification_preferences.category.
-- packages/shared USER_TOGGLEABLE_CATEGORIES теперь содержит 'ride_completed'.

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
    'ride_completed',
    'confirm_participation',
    'participation_request',
    'like_received',
    'review_received',
    'favorite_new_ride',
    'support_reply',
    'system'
  ));
