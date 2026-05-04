import type postgres from "postgres";
import { withLock } from "./lib/with-lock.js";

const LOCK_ID = 100003;
const HORIZON_DAYS = 14;

interface TemplateRow {
  id: string;
  driver_id: string;
  from_label: string;
  from_lat: number;
  from_lng: number;
  to_label: string;
  to_lat: number;
  to_lng: number;
  departure_time: string;
  weekdays: number[];
  price_rub: number | null;
  seats_total: number;
  comment: string | null;
  active_from: string;
  active_to: string | null;
}

export async function expandTemplates(
  sql: postgres.Sql,
  now: Date = new Date(),
): Promise<{ created: number } | null> {
  return withLock(sql, LOCK_ID, async (tx) => {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const templates = await tx<TemplateRow[]>`
      SELECT id, driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
             to_char(departure_time, 'HH24:MI:SS') AS departure_time,
             weekdays, price_rub, seats_total, comment,
             active_from, active_to
      FROM ride_templates
      WHERE is_active = true
        AND (active_to IS NULL OR active_to >= current_date)
    `;

    let created = 0;

    for (const t of templates) {
      const activeFrom = new Date(`${t.active_from}T00:00:00Z`);
      const activeTo = t.active_to ? new Date(`${t.active_to}T00:00:00Z`) : null;

      for (let dayOffset = 0; dayOffset < HORIZON_DAYS; dayOffset++) {
        const date = new Date(today.getTime() + dayOffset * 86400000);
        if (date < activeFrom) continue;
        if (activeTo && date > activeTo) continue;

        const weekday = date.getUTCDay();
        if (!t.weekdays.includes(weekday)) continue;

        const dateIso = date.toISOString().slice(0, 10);
        const departureAt = `${dateIso} ${t.departure_time}+00`;

        const result = await tx<{ id: string }[]>`
          INSERT INTO rides
            (driver_id, template_id, from_label, from_lat, from_lng,
             to_label, to_lat, to_lng, departure_at, price_rub, seats_total, comment)
          SELECT
            ${t.driver_id}, ${t.id}, ${t.from_label}, ${t.from_lat}, ${t.from_lng},
            ${t.to_label}, ${t.to_lat}, ${t.to_lng},
            ${departureAt}::timestamptz, ${t.price_rub}, ${t.seats_total}, ${t.comment}
          WHERE NOT EXISTS (
            SELECT 1 FROM rides
            WHERE template_id = ${t.id} AND departure_at = ${departureAt}::timestamptz
          )
          RETURNING id
        `;
        if (result.length > 0) created++;
      }
    }

    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "expand_templates",
        templates_processed: templates.length,
        rides_created: created,
        horizon_days: HORIZON_DAYS,
        ts: new Date().toISOString(),
      }),
    );
    return { created };
  });
}
