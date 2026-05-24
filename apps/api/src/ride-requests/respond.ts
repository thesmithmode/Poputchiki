import { type NotificationCategory, enqueueNotification } from "@poputchiki/shared";
import type postgres from "postgres";
import { withIdentity } from "../db/with-identity";
import type { AppUser } from "../middleware/identity-guard";

interface RequestRow {
  id: string;
  ride_id: string;
  passenger_id: string;
  driver_id: string;
  status: string;
  to_label: string;
}

export type Action = "accept" | "reject" | "cancel";

export interface DomainError extends Error {
  code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "NO_SEATS";
}

export function domainError(code: DomainError["code"], message: string): DomainError {
  return Object.assign(new Error(message), { code }) as DomainError;
}

export function isDomainError(err: unknown): err is DomainError {
  return (
    err instanceof Error &&
    ["NOT_FOUND", "FORBIDDEN", "INVALID_STATE", "NO_SEATS"].includes(
      (err as Error & { code?: string }).code ?? "",
    )
  );
}

const NOTIFY_CATEGORY: Record<Action, NotificationCategory> = {
  accept: "ride_request_accepted",
  reject: "ride_request_rejected",
  cancel: "ride_request_cancelled",
};

const TARGET_STATUS: Record<Action, string> = {
  accept: "accepted",
  reject: "rejected",
  cancel: "cancelled",
};

export interface RespondResult {
  request: RequestRow;
  refunded: boolean;
  actorName: string;
}

/**
 * Реализация state machine accept/reject/cancel для ride_request.
 * Выделена из HTTP-роутера чтобы webhook callback_query handler мог
 * вызывать ту же логику без HTTP round-trip и дублирования инвариантов.
 *
 * Бросает DomainError при бизнес-нарушениях, прочее — наружу.
 * Side effect: fire-and-forget enqueueNotification после успешного commit.
 */
export async function respondToRideRequest(
  sql: postgres.Sql,
  user: AppUser,
  requestId: string,
  action: Action,
): Promise<RespondResult> {
  const result = await withIdentity(
    sql,
    user,
    async (tx) => {
      const [row] = await tx<RequestRow[]>`
        SELECT rr.id, rr.ride_id, rr.passenger_id, rr.status, r.driver_id, r.to_label
        FROM ride_requests rr
        JOIN rides r ON r.id = rr.ride_id
        WHERE rr.id = ${requestId}
      `;
      if (!row) throw domainError("NOT_FOUND", "ride request not found");

      if (action === "cancel") {
        if (row.passenger_id !== user.id) {
          throw domainError("FORBIDDEN", "only passenger can cancel");
        }
      } else {
        if (row.driver_id !== user.id) {
          throw domainError("FORBIDDEN", "only driver can accept/reject");
        }
      }

      if (action === "accept" || action === "reject") {
        if (row.status !== "pending") {
          throw domainError("INVALID_STATE", `cannot ${action} from ${row.status}`);
        }
      } else {
        if (row.status !== "pending" && row.status !== "accepted") {
          throw domainError("INVALID_STATE", `cannot cancel from ${row.status}`);
        }
      }

      await tx`SELECT pg_advisory_xact_lock(hashtext(${row.ride_id}::text))`;

      const newStatus = TARGET_STATUS[action];
      const updated = await tx<{ id: string }[]>`
        UPDATE ride_requests SET status = ${newStatus}
        WHERE id = ${requestId} AND status = ${row.status}
        RETURNING id
      `;
      /* c8 ignore next -- defensive: locked row should always update */
      if (updated.length === 0) {
        throw domainError("INVALID_STATE", "concurrent update");
      }

      let refunded = false;
      if (action === "accept") {
        const booked = await tx<{ id: string }[]>`
          SELECT * FROM app.book_seat(${row.ride_id}::uuid)
        `;
        if (booked.length === 0) {
          throw domainError("NO_SEATS", "no_seats");
        }
      } else if (action === "cancel" && row.status === "accepted") {
        const refundRows = await tx<{ id: string }[]>`
          SELECT id FROM app.unbook_seat(${row.ride_id}::uuid)
        `;
        refunded = refundRows.length > 0;
      }

      const [actorRow] = await tx<{ display_name: string }[]>`
        SELECT display_name FROM users WHERE id = ${user.id}::uuid
      `;
      const actorName = actorRow?.display_name ?? "";

      return { request: { ...row, status: newStatus }, refunded, actorName };
    },
    "repeatable read",
  );

  const notifyTo = action === "cancel" ? result.request.driver_id : result.request.passenger_id;
  const nameKey = action === "cancel" ? "passenger_name" : "driver_name";
  enqueueNotification(sql, {
    userId: notifyTo,
    category: NOTIFY_CATEGORY[action],
    rideId: result.request.ride_id,
    data: {
      request_id: result.request.id,
      [nameKey]: result.actorName,
      destination: result.request.to_label,
    },
  }).catch(/* c8 ignore next -- fire-and-forget */ () => {});

  // Инвалидируем SSE-подписчиков — кнопки accept/reject исчезнут у водителя без перезагрузки
  sql`SELECT pg_notify('rides_changed', ${JSON.stringify({ ride_id: result.request.ride_id, type: "request_updated" })})`.catch(
    /* c8 ignore next -- fire-and-forget */ () => {},
  );

  return result;
}
