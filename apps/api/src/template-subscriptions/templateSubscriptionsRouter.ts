import { enqueueNotification } from "@poputchiki/shared";
import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import { UUID_RE } from "../lib/uuid";
import type { AppUser } from "../middleware/identity-guard";
import { isDomainError, respondToSubscription } from "./respond";

const PostInput = z.object({
  template_id: z.string().uuid(),
  active_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  active_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  message: z.string().max(200).optional(),
});

interface SubRow {
  id: string;
  template_id: string;
  passenger_id: string;
  status: string;
  active_from: string;
  active_to: string | null;
  message: string | null;
  created_at: Date;
  updated_at: Date;
  from_label?: string;
  to_label?: string;
  departure_time?: string;
  weekdays?: number[];
  driver_id?: string;
  passenger_display_name?: string;
  passenger_tg_id?: number;
}

export function createTemplateSubscriptionsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  // POST / — пассажир создаёт заявку на подписку
  app.post("/", async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PostInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);
    const d = parsed.data;

    const result = await withIdentity(sql, user, async (tx) => {
      const [tmpl] = await tx<
        { id: string; driver_id: string; from_label: string; to_label: string }[]
      >`
        SELECT id, driver_id, from_label, to_label FROM ride_templates
        WHERE id = ${d.template_id} AND is_active = true
      `;
      if (!tmpl) return { error: "not_found" as const };
      if (tmpl.driver_id === user.id) return { error: "forbidden" as const };

      const [sub] = await tx<SubRow[]>`
        INSERT INTO template_subscriptions
          (template_id, passenger_id, status, active_from, active_to, message)
        VALUES (
          ${d.template_id},
          ${user.id},
          'pending',
          COALESCE(${d.active_from ?? null}::date, current_date),
          ${d.active_to ?? null}::date,
          ${d.message ?? null}
        )
        ON CONFLICT (template_id, passenger_id) DO NOTHING
        RETURNING id, template_id, passenger_id, status, active_from, active_to, message, created_at, updated_at
      `;
      if (!sub) return { error: "duplicate" as const };

      const [passengerRow] = await tx<{ display_name: string }[]>`
        SELECT display_name FROM users WHERE id = ${user.id}::uuid
      `;

      return {
        sub,
        driverId: tmpl.driver_id,
        destination: tmpl.to_label,
        passengerName: passengerRow?.display_name ?? "",
      };
    });

    if ("error" in result) {
      if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
      if (result.error === "forbidden") return c.json({ error: "forbidden" }, 403);
      return c.json({ error: "already_subscribed" }, 409);
    }

    enqueueNotification(sql, {
      userId: result.driverId,
      category: "template_subscription_request",
      data: {
        subscription_id: result.sub.id,
        template_id: result.sub.template_id,
        passenger_id: user.id,
        passenger_name: result.passengerName,
        destination: result.destination,
        active_to: result.sub.active_to,
      },
    }).catch(() => {});

    return c.json(result.sub, 201);
  });

  // GET /mine — подписки пассажира
  app.get("/mine", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<SubRow[]>`
        SELECT
          ts.id, ts.template_id, ts.passenger_id, ts.status,
          ts.active_from, ts.active_to, ts.message, ts.created_at, ts.updated_at,
          t.from_label, t.to_label,
          to_char(t.departure_time, 'HH24:MI') AS departure_time,
          t.weekdays
        FROM template_subscriptions ts
        JOIN ride_templates t ON t.id = ts.template_id
        WHERE ts.passenger_id = ${user.id}
          AND ts.status NOT IN ('rejected')
        ORDER BY ts.created_at DESC
        LIMIT 100
      `;
    });
    return c.json({ subscriptions: rows });
  });

  // GET /driver — pending+accepted заявки для водителя (его шаблоны)
  app.get("/driver", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<SubRow[]>`
        SELECT
          ts.id, ts.template_id, ts.passenger_id, ts.status,
          ts.active_from, ts.active_to, ts.message, ts.created_at, ts.updated_at,
          t.from_label, t.to_label,
          to_char(t.departure_time, 'HH24:MI') AS departure_time,
          t.weekdays,
          u.display_name AS passenger_display_name,
          u.tg_id AS passenger_tg_id
        FROM template_subscriptions ts
        JOIN ride_templates t ON t.id = ts.template_id
        JOIN users u ON u.id = ts.passenger_id
        WHERE t.driver_id = ${user.id}
          AND ts.status IN ('pending', 'accepted')
        ORDER BY ts.created_at DESC
        LIMIT 100
      `;
    });
    return c.json({ subscriptions: rows });
  });

  // POST /:id/accept — водитель принимает подписку
  app.post("/:id/accept", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const subId = c.req.param("id");
    if (!UUID_RE.test(subId)) return c.json({ error: "invalid id" }, 400);

    try {
      const result = await respondToSubscription(sql, user, subId, "accept");
      return c.json({ ok: true, status: result.sub.status });
    } catch (err) {
      if (isDomainError(err)) {
        if (err.code === "NOT_FOUND") return c.json({ error: "not_found" }, 404);
        if (err.code === "FORBIDDEN") return c.json({ error: "forbidden" }, 403);
        return c.json({ error: "invalid_state" }, 409);
      }
      throw err;
    }
  });

  // POST /:id/reject — водитель отклоняет
  app.post("/:id/reject", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const subId = c.req.param("id");
    if (!UUID_RE.test(subId)) return c.json({ error: "invalid id" }, 400);

    try {
      const result = await respondToSubscription(sql, user, subId, "reject");
      return c.json({ ok: true, status: result.sub.status });
    } catch (err) {
      if (isDomainError(err)) {
        if (err.code === "NOT_FOUND") return c.json({ error: "not_found" }, 404);
        if (err.code === "FORBIDDEN") return c.json({ error: "forbidden" }, 403);
        return c.json({ error: "invalid_state" }, 409);
      }
      throw err;
    }
  });

  // POST /:id/revoke — водитель отзывает принятую подписку
  app.post("/:id/revoke", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const subId = c.req.param("id");
    if (!UUID_RE.test(subId)) return c.json({ error: "invalid id" }, 400);

    const result = await withIdentity(sql, user, async (tx) => {
      const [sub] = await tx<(SubRow & { driver_id: string; to_label: string })[]>`
        SELECT ts.*, t.driver_id, t.to_label
        FROM template_subscriptions ts
        JOIN ride_templates t ON t.id = ts.template_id
        WHERE ts.id = ${subId}
      `;
      if (!sub) return { error: "not_found" as const };
      if (sub.driver_id !== user.id) return { error: "forbidden" as const };
      if (sub.status !== "accepted") return { error: "invalid_state" as const };

      await tx`
        UPDATE template_subscriptions SET status = 'revoked', updated_at = now()
        WHERE id = ${subId}
      `;

      const futureRequests = await tx<{ id: string; status: string; ride_id: string }[]>`
        SELECT rr.id, rr.status, rr.ride_id
        FROM ride_requests rr
        JOIN rides r ON r.id = rr.ride_id
        WHERE r.template_id = ${sub.template_id}
          AND rr.passenger_id = ${sub.passenger_id}
          AND r.departure_at > now()
          AND rr.status IN ('pending', 'accepted')
      `;

      for (const req of futureRequests) {
        await tx`UPDATE ride_requests SET status = 'cancelled' WHERE id = ${req.id}`;
        if (req.status === "accepted") {
          await tx`SELECT app.unbook_seat(${req.ride_id}::uuid)`;
        }
      }

      return { passengerId: sub.passenger_id, destination: sub.to_label };
    });

    if ("error" in result) {
      if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
      if (result.error === "forbidden") return c.json({ error: "forbidden" }, 403);
      return c.json({ error: "invalid_state" }, 409);
    }

    enqueueNotification(sql, {
      userId: result.passengerId,
      category: "template_subscription_revoked",
      data: { subscription_id: subId, destination: result.destination },
    }).catch(() => {});

    return c.json({ ok: true });
  });

  // POST /:id/cancel — пассажир отписывается
  app.post("/:id/cancel", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const subId = c.req.param("id");
    if (!UUID_RE.test(subId)) return c.json({ error: "invalid id" }, 400);

    const result = await withIdentity(sql, user, async (tx) => {
      const [sub] = await tx<SubRow[]>`
        SELECT * FROM template_subscriptions WHERE id = ${subId}
      `;
      if (!sub) return { error: "not_found" as const };
      if (sub.passenger_id !== user.id) return { error: "forbidden" as const };
      if (!["pending", "accepted"].includes(sub.status)) return { error: "invalid_state" as const };

      await tx`
        UPDATE template_subscriptions SET status = 'cancelled', updated_at = now()
        WHERE id = ${subId}
      `;

      if (sub.status === "accepted") {
        const futureRequests = await tx<{ id: string; status: string; ride_id: string }[]>`
          SELECT rr.id, rr.status, rr.ride_id
          FROM ride_requests rr
          JOIN rides r ON r.id = rr.ride_id
          WHERE r.template_id = ${sub.template_id}
            AND rr.passenger_id = ${user.id}
            AND r.departure_at > now()
            AND rr.status IN ('pending', 'accepted')
        `;
        for (const req of futureRequests) {
          await tx`UPDATE ride_requests SET status = 'cancelled' WHERE id = ${req.id}`;
          if (req.status === "accepted") {
            await tx`SELECT app.unbook_seat(${req.ride_id}::uuid)`;
          }
        }
      }

      return { ok: true };
    });

    if ("error" in result) {
      if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
      if (result.error === "forbidden") return c.json({ error: "forbidden" }, 403);
      return c.json({ error: "invalid_state" }, 409);
    }

    return c.json({ ok: true });
  });

  return app;
}
