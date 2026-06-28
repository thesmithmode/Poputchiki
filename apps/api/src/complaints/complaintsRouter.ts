import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import { isUniqueViolation } from "../lib/db-errors";
import { UUID_RE } from "../lib/uuid";
import type { AppUser } from "../middleware/identity-guard";

const PostComplaintInput = z.object({
  target_user_id: z.string().regex(UUID_RE, "invalid uuid"),
  target_ride_id: z.string().regex(UUID_RE, "invalid uuid").optional(),
  reason_code: z.enum(["spam", "fraud", "offense", "other"]),
  text: z.string().max(1000).optional(),
});

const ComplaintStatus = z.enum(["open", "resolved", "dismissed"]);

const PatchComplaintInput = z.object({
  status: ComplaintStatus,
});

export function createComplaintsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PostComplaintInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const { target_user_id, target_ride_id, reason_code, text } = parsed.data;
    if (target_user_id === user.id) return c.json({ error: "cannot complain about self" }, 422);

    try {
      const reason = text ? `${reason_code}: ${text}` : reason_code;
      const rows = await withIdentity(sql, user, async (tx) => {
        return tx<
          {
            id: string;
            reporter_id: string;
            target_id: string;
            status: string;
            created_at: Date;
          }[]
        >`
          INSERT INTO complaints (reporter_id, target_id, ride_id, reason, status)
          VALUES (${user.id}, ${target_user_id}, ${target_ride_id ?? null}, ${reason}, 'open')
          RETURNING id, reporter_id, target_id, status, created_at
        `;
      });
      return c.json(rows[0], 201);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json({ error: "already_reported_this_week" }, 409);
      /* c8 ignore next -- defensive: re-throw unknown errors */
      throw err;
    }
  });

  return app;
}

export function createAdminComplaintsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const user = c.get("user" as never) as AppUser | undefined;
    if (!user || user.role !== "admin") return c.json({ error: "forbidden" }, 403);
    return next();
  });

  app.get("", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const status = c.req.query("status");
    const parsedStatus = status ? ComplaintStatus.safeParse(status) : null;
    if (parsedStatus && !parsedStatus.success) return c.json({ error: "invalid status" }, 422);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<
        {
          id: string;
          reporter_id: string;
          target_id: string;
          ride_id: string | null;
          reason: string;
          status: string;
          created_at: Date;
        }[]
      >`
        SELECT id, reporter_id, target_id, ride_id, reason, status, created_at
        FROM complaints
        ${parsedStatus?.success ? tx`WHERE status = ${parsedStatus.data}` : tx``}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    });
    return c.json(rows);
  });

  app.patch("/:id", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const complaintId = c.req.param("id");
    if (!UUID_RE.test(complaintId)) return c.json({ error: "invalid id" }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PatchComplaintInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<
        {
          id: string;
          reporter_id: string;
          target_id: string;
          ride_id: string | null;
          reason: string;
          status: string;
          created_at: Date;
        }[]
      >`
        UPDATE complaints
        SET status = ${parsed.data.status}
        WHERE id = ${complaintId}
        RETURNING id, reporter_id, target_id, ride_id, reason, status, created_at
      `;
    });
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json(rows[0], 200);
  });

  return app;
}
