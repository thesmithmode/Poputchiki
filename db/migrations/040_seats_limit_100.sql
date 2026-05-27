-- Расширить лимит seats_total с 4 до 100 (газель, автобус и т.д.)
ALTER TABLE ride_templates DROP CONSTRAINT ride_templates_seats_total_check;
ALTER TABLE ride_templates ADD CONSTRAINT ride_templates_seats_total_check
  CHECK (seats_total BETWEEN 1 AND 100);

ALTER TABLE rides DROP CONSTRAINT rides_seats_total_check;
ALTER TABLE rides ADD CONSTRAINT rides_seats_total_check
  CHECK (seats_total BETWEEN 1 AND 100);
