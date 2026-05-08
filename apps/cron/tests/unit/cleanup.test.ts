import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupErrorLog,
  cleanupIdempotencyKeys,
  cleanupNotificationLog,
  cleanupRateLimitBuckets,
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
