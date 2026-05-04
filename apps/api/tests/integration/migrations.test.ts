/**
 * Sentinel: every migration applies up, applies down, re-applies up cleanly.
 * Schema fingerprint after first up == fingerprint after down+up.
 *
 * Uses ephemeral DB `poputchiki_migtest_<rand>` to avoid clobbering the shared
 * test DB used by other integration tests.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS_DIR = join(ROOT, "db", "migrations");

function listUpFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
}

function downFor(upFile: string): string {
  return upFile.replace(/\.sql$/, ".down.sql");
}

function readSql(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}

function adminDsn(dbName: string): string {
  const user = process.env.POSTGRES_USER;
  const pwd = process.env.POSTGRES_PASSWORD;
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  return `postgres://${user}:${pwd}@${host}:${port}/${dbName}`;
}

const TEST_DB = `migtest_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let admin: ReturnType<typeof postgres>;
let target: ReturnType<typeof postgres>;

beforeAll(async () => {
  admin = postgres(adminDsn("postgres"), { max: 1 });
  await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
  target = postgres(adminDsn(TEST_DB), { max: 1, prepare: false });
}, 30_000);

afterAll(async () => {
  if (target) await target.end({ timeout: 5 });
  if (admin) {
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TEST_DB}' AND pid <> pg_backend_pid()`,
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await admin.end({ timeout: 5 });
  }
}, 30_000);

async function applyUp(): Promise<void> {
  for (const f of listUpFiles()) {
    await target.unsafe(readSql(f));
  }
}

async function applyDownAll(): Promise<void> {
  for (const f of [...listUpFiles()].reverse()) {
    await target.unsafe(readSql(downFor(f)));
  }
}

async function fingerprint(): Promise<string> {
  const tables = await target.unsafe(`
    SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY 1,2,3
  `);
  const indexes = await target.unsafe(`
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname NOT IN ('pg_catalog','information_schema')
    ORDER BY 1,2,3
  `);
  const policies = await target.unsafe(`
    SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies
    ORDER BY 1,2,3
  `);
  const fns = await target.unsafe(`
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('app','public')
    ORDER BY 1,2,3
  `);
  return JSON.stringify({ tables, indexes, policies, fns });
}

describe("Sentinel: migrations up/down/up consistency", () => {
  it("applies all up migrations cleanly", async () => {
    await expect(applyUp()).resolves.not.toThrow();
  });

  it("applies all down migrations cleanly (reverse order)", async () => {
    await expect(applyDownAll()).resolves.not.toThrow();
  });

  it("re-applies up after down — schema fingerprint stable across cycle", async () => {
    await applyUp();
    const fp1 = await fingerprint();
    await applyDownAll();
    await applyUp();
    const fp2 = await fingerprint();
    expect(fp2).toBe(fp1);
  }, 60_000);
});

// TASK-008 sentinel: verify required tables exist after all migrations applied
describe("Sentinel: TASK-008 required tables exist", () => {
  it("support_messages table exists with required columns", async () => {
    const cols = await target.unsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'support_messages'
      ORDER BY column_name
    `);
    const names = cols.map((c: Record<string, unknown>) => c.column_name as string);
    expect(names).toContain("id");
    expect(names).toContain("user_id");
    expect(names).toContain("text");
    expect(names).toContain("status");
    expect(names).toContain("reply_text");
    expect(names).toContain("replied_at");
    expect(names).toContain("created_at");
  });

  it("notification_preferences table exists with required columns", async () => {
    const cols = await target.unsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notification_preferences'
      ORDER BY column_name
    `);
    const names = cols.map((c: Record<string, unknown>) => c.column_name as string);
    expect(names).toContain("user_id");
    expect(names).toContain("category");
    expect(names).toContain("enabled");
  });

  it("support_messages has RLS enabled", async () => {
    const [row] = await target.unsafe(`
      SELECT relrowsecurity, relforcerowsecurity
      FROM pg_class WHERE relname = 'support_messages'
    `);
    expect(row?.relrowsecurity).toBe(true);
    expect(row?.relforcerowsecurity).toBe(true);
  });

  it("notification_preferences has RLS enabled", async () => {
    const [row] = await target.unsafe(`
      SELECT relrowsecurity, relforcerowsecurity
      FROM pg_class WHERE relname = 'notification_preferences'
    `);
    expect(row?.relrowsecurity).toBe(true);
    expect(row?.relforcerowsecurity).toBe(true);
  });
});
