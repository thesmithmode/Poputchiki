import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import type { AppUser } from "../middleware/identity-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORIES = [
  "ride_request",
  "ride_cancelled",
  "confirm_participation",
  "like_received",
  "review_received",
  "favorite_new_ride",
  "support_reply",
  "system",
] as const;

type Category = (typeof CATEGORIES)[number];

const PutPrefsInput = z
  .object({
    ride_request: z.boolean().optional(),
    ride_cancelled: z.boolean().optional(),
    confirm_participation: z.boolean().optional(),
    like_received: z.boolean().optional(),
    review_received: z.boolean().optional(),
    favorite_new_ride: z.boolean().optional(),
    support_reply: z.boolean().optional(),
    system: z.boolean().optional(),
  })
  .refine((d) => d.system !== false, { message: "system category cannot be disabled" });

async function upsertDefaults(tx: postgres.TransactionSql, userId: string): Promise<void> {
  for (const cat of CATEGORIES) {
    await tx`
      INSERT INTO notification_preferences (user_id, category, enabled)
      VALUES (${userId}, ${cat}, true)
      ON CONFLICT DO NOTHING
    `;
  }
}

async function readPrefs(
  tx: postgres.TransactionSql,
  userId: string,
): Promise<Record<Category, boolean>> {
  const rows = await tx<{ category: string; enabled: boolean }[]>`
    SELECT category, enabled FROM notification_preferences WHERE user_id = ${userId}
  `;
  const result = {} as Record<Category, boolean>;
  for (const row of rows) {
    result[row.category as Category] = row.enabled;
  }
  return result;
}

interface UserNotification {
  id: string;
  category: string;
  ride_id: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export function createNotificationsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const notifications = await withIdentity(sql, user, async (tx) => {
      return tx<UserNotification[]>`
        SELECT id, category, ride_id, data, is_read, created_at
        FROM user_notifications
        WHERE user_id = ${user.id}::uuid
        ORDER BY created_at DESC
        LIMIT 50
      `;
    });
    return c.json({ notifications });
  });

  app.post("/read-all", async (c) => {
    const user = c.get("user" as never) as AppUser;
    await withIdentity(sql, user, async (tx) => {
      await tx`
        UPDATE user_notifications SET is_read = true
        WHERE user_id = ${user.id}::uuid AND is_read = false
      `;
    });
    return c.json({ ok: true });
  });

  app.post("/:id/read", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<{ id: string }[]>`
        UPDATE user_notifications SET is_read = true
        WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
        RETURNING id
      `;
    });
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  app.get("/preferences", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const prefs = await withIdentity(sql, user, async (tx) => {
      await upsertDefaults(tx, user.id);
      return readPrefs(tx, user.id);
    });
    return c.json(prefs);
  });

  app.put("/preferences", async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PutPrefsInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const updates = parsed.data;
    const prefs = await withIdentity(sql, user, async (tx) => {
      await upsertDefaults(tx, user.id);
      for (const [cat, enabled] of Object.entries(updates)) {
        /* c8 ignore next -- Zod optional() omits absent keys; guard for schema-level changes */
        if (enabled === undefined) continue;
        await tx`
          UPDATE notification_preferences
          SET enabled = ${enabled as boolean}
          WHERE user_id = ${user.id} AND category = ${cat}
        `;
      }
      return readPrefs(tx, user.id);
    });
    return c.json(prefs);
  });

  return app;
}
