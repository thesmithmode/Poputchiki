/**
 * Shared helpers for integration tests.
 * Provides: buildDsn(), withTestUser(), truncateAll()
 */
import { randomUUID } from "node:crypto";
import type postgres from "postgres";

export function buildDsn(): string {
  return (
    process.env.DATABASE_URL_TEST ??
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? 5432}/${process.env.POSTGRES_DB}`
  );
}

export interface TestUser {
  id: string;
  tgId: number;
  role: "user" | "admin" | "driver";
  cleanup: () => Promise<void>;
}

export async function withTestUser(
  sql: postgres.Sql,
  tgId: number,
  role: "user" | "admin" | "driver" = "user",
): Promise<TestUser> {
  const generatedId = randomUUID();

  const [row] = await sql<[{ id: string }]>`
    INSERT INTO users (id, tg_id, display_name, role)
    VALUES (${generatedId}, ${tgId}, ${`Test ${tgId}`}, ${role})
    ON CONFLICT (tg_id) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id
  `;
  const id = row?.id ?? generatedId;

  return {
    id,
    tgId,
    role,
    cleanup: async () => {
      await sql`DELETE FROM users WHERE id = ${id}`;
    },
  };
}

export async function truncateAll(sql: postgres.Sql): Promise<void> {
  await sql`
    TRUNCATE TABLE
      audit_log,
      idempotency_keys,
      rate_limit_buckets,
      revoked_tokens,
      complaints,
      private_notes,
      favorites,
      reviews,
      likes,
      ride_requests,
      rides,
      ride_participation,
      ride_templates,
      nonces,
      users
    RESTART IDENTITY CASCADE
  `;
}
