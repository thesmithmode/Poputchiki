import { enqueueNotification } from "@poputchiki/shared";
import type postgres from "postgres";
import { withIdentity } from "../db/with-identity";
import type { AppUser } from "../middleware/identity-guard";

export type SubAction = "accept" | "reject";

interface SubRow {
  id: string;
  template_id: string;
  passenger_id: string;
  status: string;
  active_from: string;
  active_to: string | null;
  driver_id: string;
  to_label: string;
}

export interface DomainError extends Error {
  code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE";
}

export function domainError(code: DomainError["code"], message: string): DomainError {
  return Object.assign(new Error(message), { code }) as DomainError;
}

export function isDomainError(err: unknown): err is DomainError {
  return (
    err instanceof Error &&
    ["NOT_FOUND", "FORBIDDEN", "INVALID_STATE"].includes(
      (err as Error & { code?: string }).code ?? "",
    )
  );
}

export interface SubRespondResult {
  sub: Omit<SubRow, "driver_id" | "to_label"> & { status: string };
  passengerId: string;
  destination: string;
}

/**
 * State machine accept/reject для template_subscription.
 * Вызывается из HTTP-роутера и из internal endpoint (TG bot callback).
 */
export async function respondToSubscription(
  sql: postgres.Sql,
  user: AppUser,
  subId: string,
  action: SubAction,
): Promise<SubRespondResult> {
  const result = await withIdentity(sql, user, async (tx) => {
    const [sub] = await tx<SubRow[]>`
      SELECT ts.id, ts.template_id, ts.passenger_id, ts.status,
             ts.active_from, ts.active_to, t.driver_id, t.to_label
      FROM template_subscriptions ts
      JOIN ride_templates t ON t.id = ts.template_id
      WHERE ts.id = ${subId}
    `;
    if (!sub) throw domainError("NOT_FOUND", "subscription not found");
    if (sub.driver_id !== user.id) throw domainError("FORBIDDEN", "only driver can accept/reject");
    if (sub.status !== "pending")
      throw domainError("INVALID_STATE", `cannot ${action} from ${sub.status}`);

    const newStatus = action === "accept" ? "accepted" : "rejected";
    await tx`
      UPDATE template_subscriptions SET status = ${newStatus}, updated_at = now()
      WHERE id = ${subId}
    `;

    if (action === "accept") {
      const rides = await tx<{ id: string }[]>`
        SELECT r.id FROM rides r
        WHERE r.template_id = ${sub.template_id}
          AND r.departure_at > now()
          AND r.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM ride_requests rr
            WHERE rr.ride_id = r.id AND rr.passenger_id = ${sub.passenger_id}
          )
          AND r.departure_at::date >= ${sub.active_from as string}::date
          AND (${sub.active_to as string | null}::date IS NULL
               OR r.departure_at::date <= ${sub.active_to as string | null}::date)
      `;
      for (const ride of rides) {
        const inserted = await tx<{ id: string }[]>`
          INSERT INTO ride_requests (ride_id, passenger_id, status)
          VALUES (${ride.id}::uuid, ${sub.passenger_id}::uuid, 'accepted')
          ON CONFLICT (ride_id, passenger_id) DO NOTHING
          RETURNING id
        `;
        if (inserted.length > 0) {
          await tx`SELECT app.book_seat(${ride.id}::uuid)`;
        }
      }
    }

    return {
      sub: { ...sub, status: newStatus },
      passengerId: sub.passenger_id,
      destination: sub.to_label,
    };
  });

  enqueueNotification(sql, {
    userId: result.passengerId,
    category:
      action === "accept" ? "template_subscription_accepted" : "template_subscription_rejected",
    data: { subscription_id: subId, destination: result.destination },
  }).catch(/* c8 ignore next -- fire-and-forget */ () => {});

  return result;
}
