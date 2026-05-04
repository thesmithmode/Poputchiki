import type postgres from "postgres";
import { withLock } from "./lib/with-lock.js";

const LOCK_ID = 100006;

export interface ConfirmPushResult {
  notified: number;
}

export async function confirmParticipationPush(
  sql: postgres.Sql,
): Promise<ConfirmPushResult | null> {
  return withLock(sql, LOCK_ID, async (tx) => {
    // Passengers driver_marked=true, not yet confirmed, not yet notified (or re-notify after 24h)
    const rows = await tx<{ ride_id: string; passenger_id: string }[]>`
      SELECT ride_id, passenger_id
      FROM ride_participation
      WHERE driver_marked = true
        AND passenger_confirmed = false
        AND marked_at > now() - INTERVAL '47 hours'
        AND (
          notified_at IS NULL
          OR notified_at < now() - INTERVAL '24 hours'
        )
    `;

    for (const row of rows) {
      await tx`
        SELECT pg_notify(
          'notify_user',
          ${JSON.stringify({
            user_id: row.passenger_id,
            category: "confirm_participation",
            ride_id: row.ride_id,
          })}
        )
      `;
      await tx`
        UPDATE ride_participation
        SET notified_at = now()
        WHERE ride_id = ${row.ride_id} AND passenger_id = ${row.passenger_id}
      `;
    }

    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "confirm_participation_push",
        last_run_at: new Date().toISOString(),
        notified_count: rows.length,
      }),
    );

    return { notified: rows.length };
  });
}
