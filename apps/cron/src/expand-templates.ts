import type postgres from "postgres";
import { withLock } from "./lib/with-lock.js";

const LOCK_ID = 100003;
const HORIZON_DAYS = 30;

export async function expandTemplates(
  sql: postgres.Sql,
  now: Date = new Date(),
): Promise<{ created: number; subscriptionRequestsCreated: number } | null> {
  return withLock(
    sql,
    LOCK_ID,
    async (tx) => {
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const todayIso = today.toISOString().slice(0, 10);

      const rows = await tx<
        { id: string; template_id: string; driver_id: string; departure_at: Date }[]
      >`
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
      RETURNING id, template_id, driver_id, departure_at
    `;

      const created = rows.length;
      let subscriptionRequestsCreated = 0;

      if (rows.length > 0) {
        const rideIds = rows.map((r) => r.id);

        // Создать accepted ride_requests для активных подписчиков новых поездок
        const subReqs = await tx<{ id: string; ride_id: string; passenger_id: string }[]>`
          INSERT INTO ride_requests (ride_id, passenger_id, status)
          SELECT r.id, ts.passenger_id, 'accepted'
          FROM rides r
          JOIN template_subscriptions ts ON ts.template_id = r.template_id
          WHERE r.id = ANY(${rideIds as unknown as string[]}::uuid[])
            AND ts.status = 'accepted'
            AND ts.active_from <= r.departure_at::date
            AND (ts.active_to IS NULL OR ts.active_to >= r.departure_at::date)
            AND ts.passenger_id != r.driver_id
          ON CONFLICT (ride_id, passenger_id) DO NOTHING
          RETURNING id, ride_id, passenger_id
        `;

        // Book seat для каждого подписчика (book_seat — SECURITY DEFINER)
        for (const req of subReqs) {
          const booked = await tx<
            { id: string }[]
          >`SELECT id FROM app.book_seat(${req.ride_id}::uuid)`;
          if (booked.length === 0) {
            // Мест нет — понизить до pending, водитель решит сам
            await tx`UPDATE ride_requests SET status = 'pending' WHERE id = ${req.id}`;
          }
        }

        subscriptionRequestsCreated = subReqs.length;
      }

      // biome-ignore lint/suspicious/noConsoleLog: structured cron log
      console.log(
        JSON.stringify({
          msg: "expand_templates",
          rides_created: created,
          subscription_requests_created: subscriptionRequestsCreated,
          horizon_days: HORIZON_DAYS,
          ts: new Date().toISOString(),
        }),
      );
      return { created, subscriptionRequestsCreated };
    },
    { useServiceRole: true },
  );
}
