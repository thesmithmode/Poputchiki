import { parseApiEnv } from "@poputchiki/shared/env";
import { createApp } from "./app";
import { createPool } from "./db/pool";

const env = parseApiEnv(process.env as Record<string, string | undefined>);

const sql = createPool(env.DATABASE_URL);
const app = createApp(sql, env.JWT_SECRET);

export default app;

if (import.meta.main) {
  Bun.serve({
    port: env.PORT,
    fetch(req, server) {
      // Inject Bun server into Hono env so captureSocketIp() can read peer address.
      return app.fetch(req, { server });
    },
  });
}
