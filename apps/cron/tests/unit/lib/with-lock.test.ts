import { describe, expect, it, vi } from "vitest";
import { withLock } from "../../../src/lib/with-lock";

function makeSql(acquired: boolean) {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = vi.fn().mockResolvedValueOnce([{ acquired }]);
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

/**
 * makeSqlCapture — фиксирует все SQL-строки вызванные через tx tagged template.
 * Нужен для проверки порядка вызовов при useServiceRole.
 */
function makeSqlCapture(acquired: boolean) {
  const calls: string[] = [];
  const sql = {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = vi
        .fn()
        .mockImplementation((strings: TemplateStringsArray, ..._values: unknown[]) => {
          const query = strings.join("?");
          calls.push(query);
          if (query.includes("pg_try_advisory_xact_lock")) {
            return Promise.resolve([{ acquired }]);
          }
          return Promise.resolve([]);
        });
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
  return { sql, calls };
}

describe("withLock", () => {
  it("returns fn result when lock acquired", async () => {
    const sql = makeSql(true);
    const result = await withLock(sql, 42, async () => "ok");
    expect(result).toBe("ok");
  });

  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false);
    const result = await withLock(sql, 42, async () => "ok");
    expect(result).toBeNull();
  });

  it("fn receives tx from begin", async () => {
    let receivedTx: unknown;
    const sql = makeSql(true);
    await withLock(sql, 99, async (tx) => {
      receivedTx = tx;
    });
    expect(receivedTx).toBeDefined();
    expect(sql.begin).toHaveBeenCalledOnce();
  });

  it("propagates error from fn (transaction rollbacks, lock auto-released)", async () => {
    const sql = makeSql(true);
    await expect(
      withLock(sql, 99, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  // ── useServiceRole ──────────────────────────────────────────────────────────

  it("useServiceRole=true: SET LOCAL ROLE вызывается ПЕРВЫМ перед advisory lock", async () => {
    const { sql, calls } = makeSqlCapture(true);
    await withLock(sql, 42, async () => "ok", { useServiceRole: true });
    expect(calls[0]).toContain("SET LOCAL ROLE poputchiki_service");
    expect(calls[1]).toContain("pg_try_advisory_xact_lock");
  });

  it("useServiceRole=false (default): SET LOCAL ROLE НЕ вызывается", async () => {
    const { sql, calls } = makeSqlCapture(true);
    await withLock(sql, 42, async () => "ok");
    expect(calls.some((c) => c.includes("SET LOCAL ROLE"))).toBe(false);
    expect(calls[0]).toContain("pg_try_advisory_xact_lock");
  });

  it("useServiceRole=true + lock не получен: возвращает null, SET ROLE всё равно вызывается", async () => {
    const { sql, calls } = makeSqlCapture(false);
    const result = await withLock(sql, 42, async () => "ok", { useServiceRole: true });
    expect(result).toBeNull();
    expect(calls[0]).toContain("SET LOCAL ROLE poputchiki_service");
  });
});
