import { createApp } from "./app";

const app = createApp();

export default app;

// Guard: only start the HTTP server when this file is the Bun entry point.
// Importing from tests or other modules will NOT start a server.
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ fetch: app.fetch, port });
}
