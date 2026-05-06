import { parseWebhookEnv } from "@poputchiki/shared/env";
import postgres from "postgres";
import { createApp } from "./app";

const env = parseWebhookEnv(process.env as Record<string, string | undefined>);
const sql = postgres(env.DATABASE_URL);
const app = createApp(sql, env.BOT_TOKEN, env.WEBHOOK_SECRET, env.DOMAIN);

export default app;

if (import.meta.main) {
  Bun.serve({ port: env.WEBHOOK_PORT, fetch: app.fetch });
}
