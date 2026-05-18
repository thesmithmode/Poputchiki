import { enqueueNotification } from "@poputchiki/shared";
import type postgres from "postgres";
import { withLock } from "./lib/with-lock.js";

const LOCK_ID = 100005;

export interface FinalizeResult {
  completed: number;
  archived: number;
}

export async function finalizeRides(sql: postgres.Sql): Promise<FinalizeResult | null> {
  return withLock(sql, LOCK_ID, async (tx) => {
    const completedRides = await tx<{ id: string; driver_id: string }[]>`
      UPDATE rides SET status = 'completed'
      WHERE status = 'active' AND departure_at < now() - INTERVAL '24 hours'
      RETURNING id, driver_id
    `;

    const archivedRides = await tx<{ id: string }[]>`
      UPDATE rides SET status = 'archived'
      WHERE status = 'completed' AND departure_at < now() - INTERVAL '72 hours'
      RETURNING id
    `;

    if (completedRides.length > 0) {
      await tx`
        INSERT INTO audit_log (user_id, action, entity, entity_id, meta)
        SELECT
          driver_id,
          'ride_status_transition',
          'rides',
          id,
          ${JSON.stringify({ from: "active", to: "completed", reason: "time" })}::jsonb
        FROM jsonb_to_recordset(${JSON.stringify(completedRides)}::jsonb)
          AS r(id uuid, driver_id uuid)
      `;

      // Notify each driver to mark participants — feed row + TG push
      for (const ride of completedRides) {
        await enqueueNotification(tx, {
          userId: ride.driver_id,
          category: "confirm_participation",
          rideId: ride.id,
        });
      }
    }

    if (archivedRides.length > 0) {
      await tx`
        INSERT INTO audit_log (user_id, action, entity, entity_id, meta)
        SELECT
          r.driver_id,
          'ride_status_transition',
          'rides',
          r.id,
          ${JSON.stringify({ from: "completed", to: "archived", reason: "time" })}::jsonb
        FROM rides r
        WHERE r.id IN ${tx(archivedRides.map((r) => r.id))}
      `;
    }

    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "finalize_rides",
        last_run_at: new Date().toISOString(),
        completed_count: completedRides.length,
        archived_count: archivedRides.length,
      }),
    );

    return { completed: completedRides.length, archived: archivedRides.length };
  });
}
