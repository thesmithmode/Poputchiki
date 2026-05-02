import postgres from "postgres";
import { createApp } from "./app";

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 10 });
const app = createApp(sql);

export default app;

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ fetch: app.fetch, port });
}
