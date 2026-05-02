-- Migration 002: ride_templates, rides, ride_requests, ride_participation + RLS

-- Шаблон регулярного рейса (создаётся водителем, порождает rides по расписанию)
CREATE TABLE ride_templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_label     text        NOT NULL,
  from_lat       double precision NOT NULL,
  from_lng       double precision NOT NULL,
  to_label       text        NOT NULL,
  to_lat         double precision NOT NULL,
  to_lng         double precision NOT NULL,
  departure_time time        NOT NULL,
  weekdays       smallint[]  NOT NULL CHECK (array_length(weekdays, 1) > 0),
  price_rub      int         CHECK (price_rub > 0),
  seats_total    smallint    NOT NULL CHECK (seats_total BETWEEN 1 AND 4),
  comment        text        CHECK (length(comment) <= 200),
  active_from    date        NOT NULL DEFAULT current_date,
  active_to      date,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ride_templates_driver ON ride_templates (driver_id) WHERE is_active = true;

ALTER TABLE ride_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY ride_templates_read ON ride_templates
  FOR SELECT USING (app.current_user_id() IS NOT NULL);

CREATE POLICY ride_templates_insert ON ride_templates
  FOR INSERT WITH CHECK (driver_id = app.current_user_id());

CREATE POLICY ride_templates_update ON ride_templates
  FOR UPDATE
  USING (driver_id = app.current_user_id())
  WITH CHECK (driver_id = app.current_user_id());

CREATE POLICY ride_templates_delete ON ride_templates
  FOR DELETE USING (driver_id = app.current_user_id());

-- Поездка: разовая или экземпляр шаблона
CREATE TABLE rides (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  template_id  uuid        REFERENCES ride_templates(id) ON DELETE SET NULL,
  from_label   text        NOT NULL,
  from_lat     double precision NOT NULL CHECK (from_lat BETWEEN -90 AND 90),
  from_lng     double precision NOT NULL CHECK (from_lng BETWEEN -180 AND 180),
  to_label     text        NOT NULL,
  to_lat       double precision NOT NULL CHECK (to_lat BETWEEN -90 AND 90),
  to_lng       double precision NOT NULL CHECK (to_lng BETWEEN -180 AND 180),
  departure_at timestamptz NOT NULL,
  price_rub    int         CHECK (price_rub > 0),
  seats_total  smallint    NOT NULL CHECK (seats_total BETWEEN 1 AND 4),
  seats_taken  smallint    NOT NULL DEFAULT 0,
  comment      text        CHECK (length(comment) <= 200),
  status       text        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'cancelled', 'completed', 'archived')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (seats_taken <= seats_total)
);

CREATE INDEX idx_rides_status_dep ON rides (status, departure_at);
CREATE INDEX idx_rides_driver    ON rides (driver_id, departure_at DESC);
CREATE INDEX idx_rides_geo_from  ON rides (from_lat, from_lng) WHERE status = 'active';

ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides FORCE ROW LEVEL SECURITY;

CREATE POLICY rides_read ON rides
  FOR SELECT USING (app.current_user_id() IS NOT NULL);

CREATE POLICY rides_insert ON rides
  FOR INSERT WITH CHECK (driver_id = app.current_user_id());

CREATE POLICY rides_update ON rides
  FOR UPDATE
  USING (driver_id = app.current_user_id())
  WITH CHECK (driver_id = app.current_user_id());

-- Водитель может отменить поездку только до вылета (отмена = смена статуса, не DELETE)
CREATE POLICY rides_delete ON rides
  FOR DELETE USING (driver_id = app.current_user_id() AND departure_at > now());

-- Отклик пассажира на поездку
CREATE TABLE ride_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id      uuid        NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, passenger_id)
);

CREATE INDEX idx_ride_requests_ride ON ride_requests (ride_id);
CREATE INDEX idx_ride_requests_passenger ON ride_requests (passenger_id);

ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_requests FORCE ROW LEVEL SECURITY;

-- Пассажир видит свои заявки; водитель видит заявки на свои поездки
CREATE POLICY ride_requests_read ON ride_requests
  FOR SELECT USING (
    passenger_id = app.current_user_id()
    OR ride_id IN (SELECT id FROM rides WHERE driver_id = app.current_user_id())
  );

CREATE POLICY ride_requests_insert ON ride_requests
  FOR INSERT WITH CHECK (passenger_id = app.current_user_id());

-- Пассажир может отозвать свою заявку; водитель может обновить статус
CREATE POLICY ride_requests_update ON ride_requests
  FOR UPDATE
  USING (
    passenger_id = app.current_user_id()
    OR ride_id IN (SELECT id FROM rides WHERE driver_id = app.current_user_id())
  )
  WITH CHECK (
    passenger_id = app.current_user_id()
    OR ride_id IN (SELECT id FROM rides WHERE driver_id = app.current_user_id())
  );

-- Подтверждённое участие (предусловие для лайка/отзыва)
CREATE TABLE ride_participation (
  ride_id              uuid        NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_marked        boolean     NOT NULL DEFAULT false,
  passenger_confirmed  boolean     NOT NULL DEFAULT false,
  marked_at            timestamptz,
  confirmed_at         timestamptz,
  PRIMARY KEY (ride_id, passenger_id)
);

CREATE INDEX idx_ride_participation_passenger ON ride_participation (passenger_id);

ALTER TABLE ride_participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_participation FORCE ROW LEVEL SECURITY;

CREATE POLICY ride_participation_read ON ride_participation
  FOR SELECT USING (
    passenger_id = app.current_user_id()
    OR ride_id IN (SELECT id FROM rides WHERE driver_id = app.current_user_id())
  );

CREATE POLICY ride_participation_insert ON ride_participation
  FOR INSERT WITH CHECK (
    ride_id IN (SELECT id FROM rides WHERE driver_id = app.current_user_id())
    OR passenger_id = app.current_user_id()
  );

CREATE POLICY ride_participation_update ON ride_participation
  FOR UPDATE
  USING (
    passenger_id = app.current_user_id()
    OR ride_id IN (SELECT id FROM rides WHERE driver_id = app.current_user_id())
  )
  WITH CHECK (
    passenger_id = app.current_user_id()
    OR ride_id IN (SELECT id FROM rides WHERE driver_id = app.current_user_id())
  );
