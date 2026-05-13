import { Hono } from "hono";
import type { Context } from "hono";
import type postgres from "postgres";
import { handleMessage } from "./handlers/message";
import { handleMyChatMember } from "./handlers/my-chat-member";
import { LruDedup } from "./lib/lru-dedup";
import { webhookSecret } from "./middleware/webhook-secret";
import type { TelegramUpdate } from "./types/telegram";

export function createApp(
  sql: postgres.Sql,
  botToken: string,
  webhookSecretToken: string,
  domain?: string,
) {
  const app = new Hono();
  const dedup = new LruDedup();

  async function handleUpdate(c: Context) {
    const update = await c.req.json<TelegramUpdate>();
    if (dedup.has(update.update_id)) return c.json({ ok: true });
    dedup.add(update.update_id);

    if (update.my_chat_member) {
      await handleMyChatMember(sql, update.my_chat_member);
    }
    if (update.message) {
      await handleMessage(botToken, domain, update.message);
    }
    if (update.callback_query) {
    }
    return c.json({ ok: true });
  }

  app.get("/health", (c) => c.json({ ok: true }));

  // Canonical path expected by Telegram (POST /webhook/tg)
  app.post("/webhook/tg", webhookSecret(webhookSecretToken), handleUpdate);

  // Legacy path kept for backward compatibility
  app.post("/tg/webhook", webhookSecret(webhookSecretToken), handleUpdate);

  return app;
}
