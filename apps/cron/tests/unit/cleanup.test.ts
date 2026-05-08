import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupErrorLog,
  cleanupIdempotencyKeys,
  cleanupNotificationLog,
  cleanupRateLimitBuckets,
} from "../../src/cleanup";

type Row = Record<string, unknown>;

/**
 * makeSql — мок postgres.Sql для тестирования withLock.
 *
 * Порядок вызовов tx():
 *   - Для функций с useServiceRole=true: [SET ROLE, advisory lock, ...txResponses]
 *   - Для функций без useServiceRole: [advisory lock, ...txResponses]
 *
 * acquired: true/false — результат pg_try_advisory_xact_lock.
 * txResponses: ответы на SQL-запросы ПОСЛЕ lock-запроса.
 * useServiceRole: если true, первый вызов tx() — SET LOCAL ROLE (возвращает []).
 */
function makeSql(
  acquired: boolean,
  txResponses: (Row[] | Error)[],
  useServiceRole = false,
): import("postgres").Sql {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let i = 0;
      const tx = vi.fn().mockImplementation(() => {
        // Первый вызов: SET LOCAL ROLE (только при useServiceRole=true)
        if (useServiceRole && i === 0) {
          i++;
          return Promise.resolve([]);
        }
        // Следующий вызов: advisory lock
        const lockIdx = useServiceRole ? 1 : 0;
        if (i === lockIdx) {
          i++;
          return Promise.resolve([{ acquired }]);
        }
        // Остальные: данные из txResponses
        const dataIdx = i - lockIdx - 1;
        i++;
        const resp = txResponses[dataIdx] ?? [];
        return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
      });
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

afterEach(() => vi.restoreAllMocks());

// ── cleanupRateLimitBuckets ──────────────────────────────────────────────────

describe("cleanupRateLimitBuckets", () => {
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await cleanupRateLimitBuckets(sql)).toBeNull();
  });

  it("returns deleted count on success", async () => {
    const sql = makeSql(true, [[{ count: "12" }]]);
    expect(await cleanupRateLimitBuckets(sql)).toEqual({ deleted: 12 });
  });

  it("returns deleted=0 when nothing to clean", async () => {
    const sql = makeSql(true, [[{ count: "0" }]]);
    expect(await cleanupRateLimitBuckets(sql)).toEqual({ deleted: 0 });
  });

  it("propagates DB error", async () => {
    const sql = makeSql(true, [new Error("PG error")]);
    await expect(cleanupRateLimitBuckets(sql)).rejects.toThrow("PG error");
  });

  it("executes DELETE with correct interval condition", async () => {
    let capturedSql = "";
    const tx = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      capturedSql = strings.join("$?");
      void values;
      if (capturedSql.includes("pg_try_advisory_xact_lock")) {
        return Promise.resolve([{ acquired: true }]);
      }
      return Promise.resolve([{ count: "0" }]);
    });
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await cleanupRateLimitBuckets(sql);
    expect(capturedSql).toContain("rate_limit_buckets");
    expect(capturedSql).toContain("1 hour");
  });
});

// ── cleanupIdempotencyKeys ────────────────────────────────────────────────────

describe("cleanupIdempotencyKeys", () => {
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await cleanupIdempotencyKeys(sql)).toBeNull();
  });

  it("returns deleted count on success", async () => {
    const sql = makeSql(true, [[{ count: "5" }]]);
    expect(await cleanupIdempotencyKeys(sql)).toEqual({ deleted: 5 });
  });

  it("returns deleted=0 when nothing to clean", async () => {
    const sql = makeSql(true, [[{ count: "0" }]]);
    expect(await cleanupIdempotencyKeys(sql)).toEqual({ deleted: 0 });
  });

  it("propagates DB error", async () => {
    const sql = makeSql(true, [new Error("timeout")]);
    await expect(cleanupIdempotencyKeys(sql)).rejects.toThrow("timeout");
  });

  it("executes DELETE with correct interval condition", async () => {
    let capturedSql = "";
    const tx = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      capturedSql = strings.join("$?");
      void values;
      if (capturedSql.includes("pg_try_advisory_xact_lock")) {
        return Promise.resolve([{ acquired: true }]);
      }
      return Promise.resolve([{ count: "0" }]);
    });
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await cleanupIdempotencyKeys(sql);
    expect(capturedSql).toContain("idempotency_keys");
    expect(capturedSql).toContain("24 hours");
  });
});

// ── cleanupNotificationLog ────────────────────────────────────────────────────

describe("cleanupNotificationLog", () => {
  // useServiceRole=true: мок ожидает порядок [SET ROLE, lock, data]
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, [], true);
    expect(await cleanupNotificationLog(sql)).toBeNull();
  });

  it("returns deleted count on success", async () => {
    const sql = makeSql(true, [[{ count: "99" }]], true);
    expect(await cleanupNotificationLog(sql)).toEqual({ deleted: 99 });
  });

  it("returns deleted=0 when nothing to clean", async () => {
    const sql = makeSql(true, [[{ count: "0" }]], true);
    expect(await cleanupNotificationLog(sql)).toEqual({ deleted: 0 });
  });

  it("propagates DB error", async () => {
    const sql = makeSql(true, [new Error("conn lost")], true);
    await expect(cleanupNotificationLog(sql)).rejects.toThrow("conn lost");
  });

  it("executes DELETE with correct interval condition", async () => {
    let capturedSql = "";
    const tx = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      capturedSql = strings.join("$?");
      void values;
      if (capturedSql.includes("SET LOCAL ROLE")) return Promise.resolve([]);
      if (capturedSql.includes("pg_try_advisory_xact_lock")) {
        return Promise.resolve([{ acquired: true }]);
      }
      return Promise.resolve([{ count: "0" }]);
    });
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await cleanupNotificationLog(sql);
    expect(capturedSql).toContain("notification_log");
    expect(capturedSql).toContain("90 days");
  });

  it("sentinel: SET LOCAL ROLE poputchiki_service вызывается первым", async () => {
    const calls: string[] = [];
    const tx = vi.fn().mockImplementation((strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q = strings.join("?");
      calls.push(q);
      if (q.includes("SET LOCAL ROLE")) return Promise.resolve([]);
      if (q.includes("pg_try_advisory_xact_lock")) return Promise.resolve([{ acquired: true }]);
      return Promise.resolve([{ count: "0" }]);
    });
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await cleanupNotificationLog(sql);
    expect(calls[0]).toContain("SET LOCAL ROLE poputchiki_service");
  });
});

// ── cleanupErrorLog ───────────────────────────────────────────────────────────

describe("cleanupErrorLog", () => {
  // useServiceRole=true: мок ожидает порядок [SET ROLE, lock, data]
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, [], true);
    expect(await cleanupErrorLog(sql)).toBeNull();
  });

  it("returns deleted count on success", async () => {
    const sql = makeSql(true, [[{ count: "3" }]], true);
    expect(await cleanupErrorLog(sql)).toEqual({ deleted: 3 });
  });

  it("returns deleted=0 when nothing to clean", async () => {
    const sql = makeSql(true, [[{ count: "0" }]], true);
    expect(await cleanupErrorLog(sql)).toEqual({ deleted: 0 });
  });

  it("propagates DB error", async () => {
    const sql = makeSql(true, [new Error("disk full")], true);
    await expect(cleanupErrorLog(sql)).rejects.toThrow("disk full");
  });

  it("executes DELETE with correct interval condition", async () => {
    let capturedSql = "";
    const tx = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      capturedSql = strings.join("$?");
      void values;
      if (capturedSql.includes("SET LOCAL ROLE")) return Promise.resolve([]);
      if (capturedSql.includes("pg_try_advisory_xact_lock")) {
        return Promise.resolve([{ acquired: true }]);
      }
      return Promise.resolve([{ count: "0" }]);
    });
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await cleanupErrorLog(sql);
    expect(capturedSql).toContain("error_log");
    expect(capturedSql).toContain("30 days");
  });

  it("sentinel: SET LOCAL ROLE poputchiki_service вызывается первым", async () => {
    const calls: string[] = [];
    const tx = vi.fn().mockImplementation((strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q = strings.join("?");
      calls.push(q);
      if (q.includes("SET LOCAL ROLE")) return Promise.resolve([]);
      if (q.includes("pg_try_advisory_xact_lock")) return Promise.resolve([{ acquired: true }]);
      return Promise.resolve([{ count: "0" }]);
    });
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await cleanupErrorLog(sql);
    expect(calls[0]).toContain("SET LOCAL ROLE poputchiki_service");
  });
});
