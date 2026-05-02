import { Hono } from "hono";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ status: "ok", ts: new Date().toISOString() }),
  );

  return app;
}
