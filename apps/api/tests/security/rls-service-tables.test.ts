/**
 * Security sentinel: RLS на служебных таблицах (миграция 019).
 *
 * Проверяет:
 * 1. error_log: анонимный SELECT через poputchiki_app → 0 строк
 * 2. error_log: INSERT от poputchiki_app (без GUC) → успех
 * 3. error_log: SELECT с ролью admin → строки видны
 * 4. error_log: SELECT с ролью user → 0 строк
 * 5. nonces: INSERT от poputchiki_app (без GUC) → успех (нужно для auth bootstrap)
 * 6. nonces: SELECT от poputchiki_app → 0 строк (DENY)
 * 7. rate_limit_buckets: INSERT/SELECT работают через poputchiki_app
 *
 * Требует: Postgres с применёнными миграциями 000-019.
 * Запускается только в CI (POSTGRES_* env должны быть заданы).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDsn } from "../integration/setup";

let sql: ReturnType<typeof postgres>;
let testUserId: string;

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 3 });

  // Seed test user as superuser (bypasses RLS)
  testUserId = "f1000000-0000-4000-a000-000000000019";
  await sql`
    INSERT INTO users (id, tg_id, display_name, role)
    VALUES (${testUserId}, 9880019, 'Service RLS Test', 'user')
    ON CONFLICT (tg_id) DO UPDATE SET display_name = EXCLUDED.display_name
  `;

  // Seed an error_log row as superuser to check SELECT visibility
  await sql`
    INSERT INTO error_log (message, stack, path, method)
    VALUES ('test error for rls check', '', '/test', 'GET')
  `;
});

afterAll(async () => {
  await sql`DELETE FROM error_log WHERE path = '/test' AND message = 'test error for rls check'`;
  await sql`DELETE FROM nonces WHERE hash LIKE 'test-rls-019-%'`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'rls-test-019:%'`;
  await sql`DELETE FROM users WHERE id = ${testUserId}`;
  await sql.end();
});

// ─── error_log ────────────────────────────────────────────────────────────────

describe("RLS 019: error_log — SELECT", () => {
  // Migration 019 revokes SELECT from poputchiki_app entirely (defense-in-depth).
  // Any SELECT via SET LOCAL ROLE poputchiki_app → permission denied before RLS.
  // Admin reads error_log via withSystem (superuser bypass), not poputchiki_app.

  it("SELECT от poputchiki_app (без GUC) → permission denied (REVOKE)", async () => {
    let denied = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`SELECT * FROM error_log`;
      });
    } catch (e) {
      denied = String(e).includes("permission denied");
    }
    expect(denied).toBe(true);
  });

  it("SELECT от poputchiki_app с role=user → permission denied (REVOKE)", async () => {
    let denied = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`SELECT set_config('app.current_user_id', ${testUserId}, true)`;
        await tx`SELECT set_config('app.current_user_tg_id', '9880019', true)`;
        await tx`SELECT set_config('app.current_user_role', 'user', true)`;
        await tx`SELECT * FROM error_log`;
      });
    } catch (e) {
      denied = String(e).includes("permission denied");
    }
    expect(denied).toBe(true);
  });

  it("SELECT суперпользователем → строки видны (admin читает через withSystem)", async () => {
    const rows = await sql`SELECT * FROM error_log WHERE path = '/test'`;
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("RLS 019: error_log — INSERT", () => {
  it("INSERT от poputchiki_app (без GUC) → успех (error logging работает)", async () => {
    let inserted = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`
          INSERT INTO error_log (message, stack, path, method)
          VALUES ('rls-test insert', '', '/rls-test', 'POST')
        `;
      });
      inserted = true;
    } catch {
      inserted = false;
    }
    expect(inserted).toBe(true);
    // Cleanup
    await sql`DELETE FROM error_log WHERE path = '/rls-test'`;
  });

  it("UPDATE error_log от poputchiki_app → ошибка (нет прав)", async () => {
    let updated = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`UPDATE error_log SET message = 'hacked' WHERE path = '/test'`;
      });
      updated = true;
    } catch {
      updated = false;
    }
    expect(updated).toBe(false);
  });

  it("DELETE error_log от poputchiki_app → ошибка (нет прав)", async () => {
    let deleted = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`DELETE FROM error_log WHERE path = '/test'`;
      });
      deleted = true;
    } catch {
      deleted = false;
    }
    expect(deleted).toBe(false);
  });
});

// ─── nonces ──────────────────────────────────────────────────────────────────

describe("RLS 019: nonces — INSERT/SELECT", () => {
  it("INSERT от poputchiki_app (без GUC) → успех (auth bootstrap)", async () => {
    const hash = `test-rls-019-${Date.now()}`;
    let inserted = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`INSERT INTO nonces (hash) VALUES (${hash}) ON CONFLICT DO NOTHING`;
      });
      inserted = true;
    } catch {
      inserted = false;
    }
    expect(inserted).toBe(true);
  });

  it("SELECT от poputchiki_app → permission denied (SELECT REVOKE в migration 019)", async () => {
    let denied = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`SELECT * FROM nonces`;
      });
    } catch (e) {
      denied = String(e).includes("permission denied");
    }
    expect(denied).toBe(true);
  });
});

// ─── rate_limit_buckets ───────────────────────────────────────────────────────

describe("RLS 019: rate_limit_buckets — INSERT/SELECT/UPDATE", () => {
  const testKey = "rls-test-019:127.0.0.1";

  it("INSERT rate_limit_bucket от poputchiki_app → успех", async () => {
    let inserted = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`
          INSERT INTO rate_limit_buckets (key, window_start, count)
          VALUES (${testKey}, date_trunc('minute', NOW()), 1)
          ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_buckets.count + 1
        `;
      });
      inserted = true;
    } catch {
      inserted = false;
    }
    expect(inserted).toBe(true);
  });

  it("SELECT rate_limit_bucket от poputchiki_app → строки видны", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      return tx`SELECT * FROM rate_limit_buckets WHERE key = ${testKey}`;
    });
    expect(rows.length).toBeGreaterThan(0);
  });
});
