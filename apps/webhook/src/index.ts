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
  const server = Bun.serve({ port: env.WEBHOOK_PORT, fetch: app.fetch });

  // H1: graceful shutdown. SIGTERM → закрыть socket → дренировать sql pool.
  const shutdown = async (signal: string) => {
    // biome-ignore lint/suspicious/noConsoleLog: structured log
    console.log(JSON.stringify({ msg: "webhook_shutdown_start", signal }));
    await server.stop();
    await sql.end({ timeout: 5 });
    // biome-ignore lint/suspicious/noConsoleLog: structured log
    console.log(JSON.stringify({ msg: "webhook_shutdown_done" }));
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
