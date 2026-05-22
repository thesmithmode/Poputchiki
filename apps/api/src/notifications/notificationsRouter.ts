import { USER_TOGGLEABLE_CATEGORIES, type UserToggleableCategory } from "@poputchiki/shared";
import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import { UUID_RE } from "../lib/uuid";
import type { AppUser } from "../middleware/identity-guard";

/**
 * Preference rows we upsert defaults for. system is included so it has an
 * explicit `enabled=true` row, but it's not in USER_TOGGLEABLE_CATEGORIES —
 * users cannot turn it off (refine guard below).
 */
const PREF_CATEGORIES = [...USER_TOGGLEABLE_CATEGORIES, "system"] as const;
type Category = (typeof PREF_CATEGORIES)[number];

const toggleFields = Object.fromEntries(
  USER_TOGGLEABLE_CATEGORIES.map((c) => [c, z.boolean().optional()]),
) as Record<UserToggleableCategory, z.ZodOptional<z.ZodBoolean>>;

const PutPrefsInput = z
  .object({
    ...toggleFields,
    system: z.boolean().optional(),
  })
  .refine((d) => d.system !== false, { message: "system category cannot be disabled" });

// M3: один INSERT со всеми категориями через unnest вместо 13 round-trip'ов.
// При 50k DAU частые polling /preferences создавали ~650k INSERT/s в пике.
async function upsertDefaults(tx: postgres.TransactionSql, userId: string): Promise<void> {
  const cats = [...PREF_CATEGORIES] as string[];
  await tx`
    INSERT INTO notification_preferences (user_id, category, enabled)
    SELECT ${userId}, c, true FROM unnest(${cats}::text[]) AS c
    ON CONFLICT DO NOTHING
  `;
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
      const entries = (Object.entries(updates) as [string, boolean | undefined][]).filter(
        (e): e is [string, boolean] => e[1] !== undefined,
      );
      if (entries.length > 0) {
        const cats = entries.map(([c]) => c);
        const vals = entries.map(([, v]) => String(v));
        await tx`
          UPDATE notification_preferences AS p
          SET enabled = u.enabled::boolean
          FROM unnest(${cats}::text[], ${vals}::text[]) AS u(category, enabled)
          WHERE p.user_id = ${user.id} AND p.category = u.category
        `;
      }
      return readPrefs(tx, user.id);
    });
    return c.json(prefs);
  });

  return app;
}
