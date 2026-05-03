import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import type { AppUser } from "../middleware/identity-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PostMessageInput = z.object({
  text: z.string().min(1).max(2000),
});

const ReplyInput = z.object({
  reply_text: z.string().min(1).max(2000),
});

export function createSupportRouter(sql: postgres.Sql): { userRouter: Hono; adminRouter: Hono } {
  const userRouter = new Hono();
  const adminRouter = new Hono();

  // POST /messages — user creates ticket
  userRouter.post("/messages", async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PostMessageInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<{ id: string; user_id: string; text: string; status: string; created_at: Date }[]>`
        INSERT INTO support_messages (user_id, text)
        VALUES (${user.id}, ${parsed.data.text})
        RETURNING id, user_id, text, status, created_at
      `;
    });
    return c.json(rows[0], 201);
  });

  // GET /messages/me — own tickets
  userRouter.get("/messages/me", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<
        {
          id: string;
          user_id: string;
          text: string;
          status: string;
          reply_text: string | null;
          replied_at: Date | null;
          created_at: Date;
        }[]
      >`
        SELECT id, user_id, text, status, reply_text, replied_at, created_at
        FROM support_messages
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
      `;
    });
    return c.json(rows);
  });

  // GET /messages — admin-only list with optional status filter
  adminRouter.get("/messages", async (c) => {
    const user = c.get("user" as never) as AppUser;
    if (user.role !== "admin") return c.json({ error: "forbidden" }, 403);

    const status = c.req.query("status");
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<
        {
          id: string;
          user_id: string;
          text: string;
          status: string;
          reply_text: string | null;
          created_at: Date;
        }[]
      >`
        SELECT id, user_id, text, status, reply_text, replied_at, created_at
        FROM support_messages
        ${status ? tx`WHERE status = ${status}` : tx``}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    });
    return c.json(rows);
  });

  // POST /messages/:id/reply — admin reply
  adminRouter.post("/messages/:id/reply", async (c) => {
    const user = c.get("user" as never) as AppUser;
    if (user.role !== "admin") return c.json({ error: "forbidden" }, 403);

    const msgId = c.req.param("id");
    if (!UUID_RE.test(msgId)) return c.json({ error: "invalid id" }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = ReplyInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<
        {
          id: string;
          user_id: string;
          text: string;
          status: string;
          reply_text: string;
          replied_at: Date;
        }[]
      >`
        UPDATE support_messages
        SET status = 'resolved', reply_text = ${parsed.data.reply_text}, replied_at = now()
        WHERE id = ${msgId}
        RETURNING id, user_id, text, status, reply_text, replied_at
      `;
    });
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);

    // Fire-and-forget: notify user via pg_notify
    sql`
      SELECT pg_notify(
        'notify_user',
        ${JSON.stringify({ user_id: rows[0]?.user_id, category: "support_reply", message_id: msgId })}
      )
    `.catch(
      /* c8 ignore next -- fire-and-forget notify; callback never invoked in tests */
      () => {},
    );

    return c.json(rows[0], 200);
  });

  return { userRouter, adminRouter };
}
