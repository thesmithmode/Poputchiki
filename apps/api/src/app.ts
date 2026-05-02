import { Hono } from "hono";
import type postgres from "postgres";
import { createAuthRouter } from "./auth/authRouter";
import { corsMiddleware } from "./middleware/cors";
import { secureHeadersMiddleware } from "./middleware/secure-headers";

export function createApp(sql?: postgres.Sql): Hono {
  const app = new Hono();

  app.use("*", corsMiddleware);
  app.use("*", secureHeadersMiddleware);
  app.get("/health", (c) => c.json({ status: "ok", ts: new Date().toISOString() }));

  if (sql) {
    app.route("/auth", createAuthRouter(sql));
  }

  return app;
}
