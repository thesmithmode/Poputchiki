import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupErrorLog,
  cleanupIdempotencyKeys,
  cleanupNotificationLog,
  cleanupRateLimitBuckets,
  cleanupUserNotifications,
} from "../../src/cleanup";

type Row = Record<string, unknown>;

function makeSql(acquired: boolean, txResponses: (Row[] | Error)[]): import("postgres").Sql {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let i = 0;
      const tx = vi.fn().mockImplementation(() => {
        if (i === 0) {
          i++;
          return Promise.resolve([{ acquired }]);
        }
        const resp = txResponses[i - 1] ?? [];
        i++;
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
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await cleanupNotificationLog(sql)).toBeNull();
  });

  it("returns deleted count on success", async () => {
    const sql = makeSql(true, [[{ count: "99" }]]);
    expect(await cleanupNotificationLog(sql)).toEqual({ deleted: 99 });
  });

  it("returns deleted=0 when nothing to clean", async () => {
    const sql = makeSql(true, [[{ count: "0" }]]);
    expect(await cleanupNotificationLog(sql)).toEqual({ deleted: 0 });
  });

  it("propagates DB error", async () => {
    const sql = makeSql(true, [new Error("conn lost")]);
    await expect(cleanupNotificationLog(sql)).rejects.toThrow("conn lost");
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
    await cleanupNotificationLog(sql);
    expect(capturedSql).toContain("notification_log");
    expect(capturedSql).toContain("90 days");
  });
});

// ── cleanupErrorLog ───────────────────────────────────────────────────────────

describe("cleanupErrorLog", () => {
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await cleanupErrorLog(sql)).toBeNull();
  });

  it("returns deleted count on success", async () => {
    const sql = makeSql(true, [[{ count: "3" }]]);
    expect(await cleanupErrorLog(sql)).toEqual({ deleted: 3 });
  });

  it("returns deleted=0 when nothing to clean", async () => {
    const sql = makeSql(true, [[{ count: "0" }]]);
    expect(await cleanupErrorLog(sql)).toEqual({ deleted: 0 });
  });

  it("propagates DB error", async () => {
    const sql = makeSql(true, [new Error("disk full")]);
    await expect(cleanupErrorLog(sql)).rejects.toThrow("disk full");
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
    await cleanupErrorLog(sql);
    expect(capturedSql).toContain("error_log");
    expect(capturedSql).toContain("30 days");
  });
});

// ── cleanupUserNotifications ──────────────────────────────────────────────────
// retention 90 дней, batch-delete 5000 за итерацию, max 10 итераций за прогон,
// SET LOCAL ROLE poputchiki_service (BYPASSRLS) для обхода RLS policies.

describe("cleanupUserNotifications", () => {
  it("returns null when lock not acquired", async () => {
    // tx call 1 = SET LOCAL ROLE, tx call 2 = advisory lock check
    const sql = makeSqlServiceRole(false, []);
    expect(await cleanupUserNotifications(sql)).toBeNull();
  });

  it("returns deleted=0 when first batch empty (no rows to clean)", async () => {
    const sql = makeSqlServiceRole(true, [[{ count: "0" }]]);
    expect(await cleanupUserNotifications(sql)).toEqual({ deleted: 0 });
  });

  it("returns deleted=N when single batch under 5000 (final batch)", async () => {
    const sql = makeSqlServiceRole(true, [[{ count: "1234" }]]);
    expect(await cleanupUserNotifications(sql)).toEqual({ deleted: 1234 });
  });

  it("loops batches until partial batch returned (stop condition)", async () => {
    // Два полных батча по 5000 + третий частичный = 12300
    const sql = makeSqlServiceRole(true, [
      [{ count: "5000" }],
      [{ count: "5000" }],
      [{ count: "2300" }],
    ]);
    expect(await cleanupUserNotifications(sql)).toEqual({ deleted: 12300 });
  });

  it("hard cap: stops after 10 full batches (50000 max per run)", async () => {
    // 10 full batches => продолжать нельзя, но result = 50000.
    const batches: Row[][] = Array.from({ length: 10 }, () => [{ count: "5000" }]);
    const sql = makeSqlServiceRole(true, batches);
    expect(await cleanupUserNotifications(sql)).toEqual({ deleted: 50000 });
  });

  it("propagates DB error from DELETE", async () => {
    const sql = makeSqlServiceRole(true, [new Error("PG err")]);
    await expect(cleanupUserNotifications(sql)).rejects.toThrow("PG err");
  });

  it("executes DELETE with 90 days interval + 5000 LIMIT against user_notifications", async () => {
    const captured: { q: string; values: unknown[] }[] = [];
    const tx = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("$?");
      captured.push({ q, values });
      if (q.includes("SET LOCAL ROLE")) return Promise.resolve([]);
      if (q.includes("pg_try_advisory_xact_lock")) return Promise.resolve([{ acquired: true }]);
      return Promise.resolve([{ count: "0" }]);
    });
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await cleanupUserNotifications(sql);
    const del = captured.find((c) => c.q.includes("user_notifications"));
    expect(del).toBeDefined();
    expect(del?.q).toContain("90 days");
    // LIMIT 5000 интерполируется как $? — проверяем через values
    expect(del?.values).toContain(5000);
  });

  it("uses SET LOCAL ROLE poputchiki_service (BYPASSRLS path)", async () => {
    const captured: string[] = [];
    const tx = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("$?");
      captured.push(q);
      void values;
      if (q.includes("SET LOCAL ROLE")) return Promise.resolve([]);
      if (q.includes("pg_try_advisory_xact_lock")) return Promise.resolve([{ acquired: true }]);
      return Promise.resolve([{ count: "0" }]);
    });
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await cleanupUserNotifications(sql);
    expect(captured[0]).toContain("SET LOCAL ROLE poputchiki_service");
  });
});

// useServiceRole=true в withLock добавляет SET LOCAL ROLE первым вызовом tx,
// затем advisory_lock. Поэтому txResponses сдвинуты на 2.
function makeSqlServiceRole(
  acquired: boolean,
  txResponses: (Row[] | Error)[],
): import("postgres").Sql {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let i = 0;
      const tx = vi.fn().mockImplementation(() => {
        if (i === 0) {
          // SET LOCAL ROLE
          i++;
          return Promise.resolve([]);
        }
        if (i === 1) {
          // advisory lock
          i++;
          return Promise.resolve([{ acquired }]);
        }
        const resp = txResponses[i - 2] ?? [];
        i++;
        return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
      });
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}
