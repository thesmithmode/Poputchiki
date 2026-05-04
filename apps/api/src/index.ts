import { parseApiEnv } from "@poputchiki/shared/env";
import { createApp } from "./app";
import { createPool } from "./db/pool";

const env = parseApiEnv(process.env as Record<string, string | undefined>);

const sql = createPool(env.DATABASE_URL);
const app = createApp(sql, env.JWT_SECRET);

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
    console.log(JSON.stringify({ msg: "shutdown_initiated", signal }));
    server.stop(true); // stop accepting new connections
    // Give in-flight requests up to 30s to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
    await sql.end({ timeout: 5 });
    console.log(JSON.stringify({ msg: "shutdown_complete" }));
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
