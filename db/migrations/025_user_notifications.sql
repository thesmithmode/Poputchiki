-- Migration 025: in-app уведомления для вкладки "События"
-- Хранит события: новая заявка (для водителя), принята/отклонена (для пассажира), etc.

CREATE TABLE user_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    text        NOT NULL,
  ride_id     uuid        REFERENCES rides(id) ON DELETE SET NULL,
  data        jsonb,
  is_read     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_notifications_user ON user_notifications (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON user_notifications TO poputchiki_app;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications FORCE ROW LEVEL SECURITY;

-- Вставка разрешена всем — уведомление создаётся от имени другого пользователя
CREATE POLICY notif_insert ON user_notifications
  FOR INSERT WITH CHECK (true);

-- Читать только свои
CREATE POLICY notif_select ON user_notifications
  FOR SELECT USING (user_id = app.current_user_id());

-- Обновлять (is_read) только свои
CREATE POLICY notif_update ON user_notifications
  FOR UPDATE USING (user_id = app.current_user_id());
