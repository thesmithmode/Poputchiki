import { Hono } from "hono";
import type postgres from "postgres";
import { withIdentity } from "../db/with-identity";
import type { AppUser } from "../middleware/identity-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestRow {
  id: string;
  ride_id: string;
  passenger_id: string;
  driver_id: string;
  status: string;
}

type Action = "accept" | "reject" | "cancel";

interface DomainError extends Error {
  code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "NO_SEATS";
}

function domainError(code: DomainError["code"], message: string): DomainError {
  return Object.assign(new Error(message), { code }) as DomainError;
}

function isDomainError(err: unknown): err is DomainError {
  return (
    err instanceof Error &&
    ["NOT_FOUND", "FORBIDDEN", "INVALID_STATE", "NO_SEATS"].includes(
      (err as Error & { code?: string }).code ?? "",
    )
  );
}

const NOTIFY_CATEGORY: Record<Action, string> = {
  accept: "ride_request_accepted",
  reject: "ride_request_rejected",
  cancel: "ride_request_cancelled",
};

const TARGET_STATUS: Record<Action, string> = {
  accept: "accepted",
  reject: "rejected",
  cancel: "cancelled",
};

export function createRideRequestsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  for (const action of ["accept", "reject", "cancel"] as Action[]) {
    app.post(`/:id/${action}`, async (c) => {
      const user = c.get("user" as never) as AppUser;
      const requestId = c.req.param("id");
      if (!UUID_RE.test(requestId)) return c.json({ error: "invalid id" }, 400);

      let result: { request: RequestRow; refunded: boolean };
      try {
        result = await withIdentity(
          sql,
          user,
          async (tx) => {
            // Load request + ride context. RLS allows driver/passenger of request to read.
            const [row] = await tx<RequestRow[]>`
              SELECT rr.id, rr.ride_id, rr.passenger_id, rr.status, r.driver_id
              FROM ride_requests rr
              JOIN rides r ON r.id = rr.ride_id
              WHERE rr.id = ${requestId}
            `;
            if (!row) throw domainError("NOT_FOUND", "ride request not found");

            // Authorization
            if (action === "cancel") {
              if (row.passenger_id !== user.id) {
                throw domainError("FORBIDDEN", "only passenger can cancel");
              }
            } else {
              if (row.driver_id !== user.id) {
                throw domainError("FORBIDDEN", "only driver can accept/reject");
              }
            }

            // State machine
            if (action === "accept" || action === "reject") {
              if (row.status !== "pending") {
                throw domainError("INVALID_STATE", `cannot ${action} from ${row.status}`);
              }
            } else {
              if (row.status !== "pending" && row.status !== "accepted") {
                throw domainError("INVALID_STATE", `cannot cancel from ${row.status}`);
              }
            }

            // Advisory lock keyed by ride_id (transactional, auto-released on commit/rollback).
            await tx`SELECT pg_advisory_xact_lock(hashtext(${row.ride_id}::text))`;

            // Status transition
            const newStatus = TARGET_STATUS[action];
            const updated = await tx<{ id: string }[]>`
              UPDATE ride_requests SET status = ${newStatus}
              WHERE id = ${requestId} AND status = ${row.status}
              RETURNING id
            `;
            /* c8 ignore next -- defensive: locked row should always update; race blocked by advisory lock */
            if (updated.length === 0) {
              throw domainError("INVALID_STATE", "concurrent update");
            }

            // Seat management: book_seat вызывается ТОЛЬКО при accept (не при подаче заявки).
            // unbook_seat — только при cancel принятой (accepted) заявки.
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

            return { request: { ...row, status: newStatus }, refunded };
          },
          "repeatable read",
        );
      } catch (err) {
        if (isDomainError(err)) {
          if (err.code === "NOT_FOUND") return c.json({ error: "not_found" }, 404);
          if (err.code === "FORBIDDEN") return c.json({ error: "forbidden" }, 403);
          if (err.code === "NO_SEATS") return c.json({ error: "no_seats" }, 409);
          return c.json({ error: "invalid_state", message: err.message }, 409);
        }
        /* c8 ignore next -- defensive: re-throw unknown errors */
        throw err;
      }

      // Fire-and-forget notify
      const notifyTo = action === "cancel" ? result.request.driver_id : result.request.passenger_id;
      sql`
        SELECT pg_notify(
          'ride_request',
          ${JSON.stringify({
            ride_id: result.request.ride_id,
            request_id: result.request.id,
            user_id: notifyTo,
            category: NOTIFY_CATEGORY[action],
          })}
        )
      `.catch(/* c8 ignore next -- fire-and-forget notify */ () => {});

      return c.json({
        id: result.request.id,
        ride_id: result.request.ride_id,
        passenger_id: result.request.passenger_id,
        status: result.request.status,
        seat_refunded: result.refunded,
      });
    });
  }

  return app;
}
