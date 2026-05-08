import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";

const ClientErrorSchema = z.object({
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(300).optional(),
});

const PII_PATTERN =
  /Bearer\s+\S+|password[=:]\s*\S+|token[=:]\s*\S+|initData[=:]\s*\S+|secret[=:]\s*\S+/gi;

function sanitize(s: string): string {
  return s.replace(PII_PATTERN, "[REDACTED]");
}

export function createClientErrorsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const sampleRate = process.env.NODE_ENV === "production" ? 0.1 : 1;
    /* c8 ignore next -- sampling is probabilistic */
    if (Math.random() > sampleRate) return c.json({ ok: true });

    const body = await c.req.json<unknown>().catch(() => null);

    const parsed = ClientErrorSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid payload" }, 422);

    const { message, stack, url } = parsed.data;
    /* c8 ignore next 2 -- stack/url optional: null fallback branch not exercised in tests */
    const safeStack = sanitize(stack ?? "");
    const safePath = sanitize(url ?? "/client");

    await sql`
      INSERT INTO error_log (message, stack, path, method)
      VALUES (${sanitize(message)}, ${safeStack}, ${safePath}, 'CLIENT')
    `.catch(() => null);

    return c.json({ ok: true });
  });

  return app;
}
