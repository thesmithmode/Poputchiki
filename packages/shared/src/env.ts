import { z } from "zod";

const WebhookEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  BOT_WEBHOOK_SECRET: z.string().min(16),
  DOMAIN: z.string().optional(),
  WEBHOOK_PORT: z.coerce.number().int().positive().optional().default(3002),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
});

export type WebhookEnv = z.infer<typeof WebhookEnvSchema>;

export function parseWebhookEnv(raw: Record<string, string | undefined>): WebhookEnv {
  const result = WebhookEnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

const ApiEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  BOT_TOKEN: z.string().min(1),
  ADMIN_TG_ID: z.string().optional(),
  ADMIN_TG_CHAT_ID: z.string().optional(),
  PGCRYPTO_KEY: z.string().optional(),
  TRUSTED_PROXIES: z.string().optional(),
  DOMAIN: z.string().optional(),
  PORT: z.coerce.number().int().positive().optional().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function parseApiEnv(raw: Record<string, string | undefined>): ApiEnv {
  const result = ApiEnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
