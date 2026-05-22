import type postgres from "postgres";
import { withLock } from "./lib/with-lock.js";

const LOCK_ID = 100003;
const HORIZON_DAYS = 30;

export async function expandTemplates(
  sql: postgres.Sql,
  now: Date = new Date(),
): Promise<{ created: number } | null> {
  return withLock(
    sql,
    LOCK_ID,
    async (tx) => {
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const todayIso = today.toISOString().slice(0, 10);

      const rows = await tx<{ id: string }[]>`
      INSERT INTO rides
        (driver_id, template_id, from_label, from_lat, from_lng,
         to_label, to_lat, to_lng, departure_at, price_rub, seats_total, comment)
      SELECT
        t.driver_id,
        t.id,
        t.from_label,
        t.from_lat,
        t.from_lng,
        t.to_label,
        t.to_lat,
        t.to_lng,
        (d::date + t.departure_time::time) AT TIME ZONE 'UTC',
        t.price_rub,
        t.seats_total,
        t.comment
      FROM ride_templates t
      CROSS JOIN generate_series(
        ${todayIso}::date,
        ${todayIso}::date + ${HORIZON_DAYS - 1} * interval '1 day',
        interval '1 day'
      ) AS d
      WHERE t.is_active = true
        AND t.active_from <= d::date
        AND (t.active_to IS NULL OR t.active_to >= d::date)
        AND EXTRACT(DOW FROM d)::smallint = ANY(t.weekdays)
      ON CONFLICT (template_id, departure_at) WHERE template_id IS NOT NULL DO NOTHING
      RETURNING id
    `;

      const created = rows.length;

      // biome-ignore lint/suspicious/noConsoleLog: structured cron log
      console.log(
        JSON.stringify({
          msg: "expand_templates",
          rides_created: created,
          horizon_days: HORIZON_DAYS,
          ts: new Date().toISOString(),
        }),
      );
      return { created };
    },
    { useServiceRole: true },
  );
}
