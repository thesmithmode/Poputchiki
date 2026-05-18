import { parseWebhookEnv } from "@poputchiki/shared/env";
import postgres from "postgres";
import { createApp } from "./app";

const env = parseWebhookEnv(process.env as Record<string, string | undefined>);
const sql = postgres(env.DATABASE_URL);
const opts: { apiUrl?: string; internalSecret?: string } = {};
if (env.API_URL) opts.apiUrl = env.API_URL;
if (env.INTERNAL_API_SECRET) opts.internalSecret = env.INTERNAL_API_SECRET;
const app = createApp(sql, env.BOT_TOKEN, env.WEBHOOK_SECRET, env.DOMAIN, opts);

if (import.meta.main) {
  Bun.serve({ port: env.WEBHOOK_PORT, fetch: app.fetch });
}
