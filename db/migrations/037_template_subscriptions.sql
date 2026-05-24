CREATE TABLE template_subscriptions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid        NOT NULL REFERENCES ride_templates(id) ON DELETE CASCADE,
  passenger_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','rejected','cancelled','revoked')),
  active_from   date        NOT NULL DEFAULT current_date,
  active_to     date,
  message       text        CHECK (char_length(message) <= 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, passenger_id)
);

CREATE INDEX template_subscriptions_template_active
  ON template_subscriptions (template_id)
  WHERE status = 'accepted';

CREATE INDEX template_subscriptions_passenger
  ON template_subscriptions (passenger_id);

ALTER TABLE template_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ts_insert ON template_subscriptions
  FOR INSERT
  WITH CHECK (passenger_id = app.current_user_id());

CREATE POLICY ts_select ON template_subscriptions
  FOR SELECT
  USING (
    passenger_id = app.current_user_id()
    OR template_id IN (
      SELECT id FROM ride_templates WHERE driver_id = app.current_user_id()
    )
  );

CREATE POLICY ts_update ON template_subscriptions
  FOR UPDATE
  USING (
    passenger_id = app.current_user_id()
    OR template_id IN (
      SELECT id FROM ride_templates WHERE driver_id = app.current_user_id()
    )
  );

CREATE POLICY ts_service ON template_subscriptions
  FOR ALL
  USING  (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'))
  WITH CHECK (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));
