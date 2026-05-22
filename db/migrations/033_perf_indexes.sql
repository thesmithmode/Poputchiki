-- Migration 033: индексы производительности для 50k DAU
--
-- 1. Уникальный частичный индекс rides(template_id, departure_at) WHERE template_id IS NOT NULL
--    Нужен expand_templates: ON CONFLICT DO NOTHING вместо WHERE NOT EXISTS (N+1 subquery).
--    NULL template_id не конфликтуют (ручные поездки), поэтому partial.
--
-- 2. idx_favorites_notify: поиск подписчиков уведомлений при создании поездки.
--    Запрос: WHERE target_id = $driver AND notify = true — два полных индекса медленнее
--    чем один покрывающий + фильтрованный.
--
-- 3. idx_ride_requests_passenger_status: /ride-requests/mine фильтрует по passenger_id + status.
--    Существующий idx_ride_requests_passenger покрывает только passenger_id.
--
-- 4. idx_ride_templates_active: заменяет idx_ride_templates_driver.
--    Запрос expand_templates: WHERE is_active = true AND (active_to IS NULL OR active_to >= current_date).
--    Включение active_to в индекс позволяет index-only scan с фильтром дат.

CREATE UNIQUE INDEX rides_template_departure_uidx
  ON rides (template_id, departure_at)
  WHERE template_id IS NOT NULL;

CREATE INDEX idx_favorites_notify
  ON favorites (target_id, user_id)
  WHERE notify = true;

CREATE INDEX idx_ride_requests_passenger_status
  ON ride_requests (passenger_id, status);

DROP INDEX idx_ride_templates_driver;
CREATE INDEX idx_ride_templates_active
  ON ride_templates (driver_id, active_to)
  WHERE is_active = true;
