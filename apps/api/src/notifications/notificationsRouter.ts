import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import type { AppUser } from "../middleware/identity-guard";

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

export function createNotificationsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

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
