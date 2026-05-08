import { parseApiEnv } from "@poputchiki/shared/env";
import { createApp } from "./app";
import { createListenSql, createPool } from "./db/pool";
import { createDispatcher } from "./realtime/dispatcher";

const env = parseApiEnv(process.env as Record<string, string | undefined>);

const sql = createPool(env.DATABASE_URL);
const listenSql = createListenSql(env.DATABASE_URL);

// Dispatcher is async — start it before the server accepts connections.
// If it fails on startup (DB unreachable), the process will crash and be restarted by Docker.
const dispatcher = await createDispatcher(listenSql, "rides_changed");

const app = createApp(sql, env.JWT_SECRET, dispatcher);

export default app;

if (import.meta.main) {
  const server = Bun.serve({
    port: env.PORT,
    // biome-ignore lint/suspicious/noExplicitAny: bun-types Bun.serve fetch signature drops server arg
    fetch(req: Request, server: any) {
      return app.fetch(req, { server });
    },
    // biome-ignore lint/suspicious/noExplicitAny: idem
  } as any);

  const shutdown = async (signal: string) => {
    // biome-ignore lint/suspicious/noConsoleLog: structured shutdown log
    console.log(JSON.stringify({ msg: "shutdown_initiated", signal }));
    server.stop(true); // stop accepting new connections
    // Give in-flight requests up to 30s to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
    await listenSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
    // biome-ignore lint/suspicious/noConsoleLog: structured shutdown log
    console.log(JSON.stringify({ msg: "shutdown_complete" }));
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
