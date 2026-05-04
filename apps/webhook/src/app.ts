import { Hono } from "hono";
import type postgres from "postgres";
import { webhookSecret } from "./middleware/webhook-secret";
import { LruDedup } from "./lib/lru-dedup";
import { handleMyChatMember } from "./handlers/my-chat-member";
import { handleMessage } from "./handlers/message";
import type { TelegramUpdate } from "./types/telegram";

export function createApp(
  sql: postgres.Sql,
  botToken: string,
  webhookSecretToken: string,
  domain?: string,
) {
  const app = new Hono();
  const dedup = new LruDedup();

  app.post("/tg/webhook", webhookSecret(webhookSecretToken), async (c) => {
    const update = await c.req.json<TelegramUpdate>();
    if (dedup.has(update.update_id)) return c.json({ ok: true });
    dedup.add(update.update_id);

    if (update.my_chat_member) {
      await handleMyChatMember(sql, update.my_chat_member);
    }
    if (update.message) {
      await handleMessage(botToken, domain, update.message);
    }
    return c.json({ ok: true });
  });

  return app;
}
