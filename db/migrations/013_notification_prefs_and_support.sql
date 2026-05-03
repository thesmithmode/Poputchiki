-- Migration 013: support_messages and notification_preferences
-- (TASK-008 drift fix: tables were required by AC but never created in 003)

-- ---------------------------------------------------------------------------
-- support_messages: user support requests with admin reply
-- ---------------------------------------------------------------------------
CREATE TABLE support_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       text        NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  status     text        NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'resolved', 'dismissed')),
  reply_text text,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_status ON support_messages (status, created_at DESC);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages FORCE ROW LEVEL SECURITY;

-- User sees and writes only own messages
CREATE POLICY support_messages_own ON support_messages
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

-- Admin can read all messages (reply is done via admin tooling bypassing RLS)
CREATE POLICY support_messages_admin_read ON support_messages
  FOR SELECT USING (app.is_admin());

-- ---------------------------------------------------------------------------
-- notification_preferences: per-user per-category opt-out
-- ---------------------------------------------------------------------------
CREATE TABLE notification_preferences (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'ride_request',
    'ride_cancelled',
    'confirm_participation',
    'like_received',
    'review_received',
    'favorite_new_ride',
    'support_reply',
    'system'
  )),
  enabled  boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, category)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;

-- User manages only own preferences
CREATE POLICY notification_preferences_own ON notification_preferences
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());
