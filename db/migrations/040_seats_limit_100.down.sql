-- Откат: вернуть лимит seats_total=4
-- ВНИМАНИЕ: упадёт если есть строки с seats_total > 4
ALTER TABLE ride_templates DROP CONSTRAINT ride_templates_seats_total_check;
ALTER TABLE ride_templates ADD CONSTRAINT ride_templates_seats_total_check
  CHECK (seats_total BETWEEN 1 AND 4);

ALTER TABLE rides DROP CONSTRAINT rides_seats_total_check;
ALTER TABLE rides ADD CONSTRAINT rides_seats_total_check
  CHECK (seats_total BETWEEN 1 AND 4);
