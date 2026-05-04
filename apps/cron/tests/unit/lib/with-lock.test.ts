import { describe, expect, it, vi } from "vitest";
import { withLock } from "../../../src/lib/with-lock";

function makeSql(acquired: boolean) {
  let i = 0;
  return vi.fn().mockImplementation(() => {
    i++;
    if (i === 1) return Promise.resolve([{ acquired }]);
    return Promise.resolve([]);
  }) as unknown as import("postgres").Sql;
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

  it("releases lock after fn completes", async () => {
    const calls: string[] = [];
    let i = 0;
    const sql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
      const s = strings.join("?");
      calls.push(s);
      i++;
      if (i === 1) return Promise.resolve([{ acquired: true }]);
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;
    await withLock(sql, 99, async () => "done");
    expect(calls[1]).toContain("pg_advisory_unlock");
  });

  it("releases lock even if fn throws", async () => {
    const calls: string[] = [];
    let i = 0;
    const sql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
      calls.push(strings.join("?"));
      i++;
      if (i === 1) return Promise.resolve([{ acquired: true }]);
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;
    await expect(
      withLock(sql, 99, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls[1]).toContain("pg_advisory_unlock");
  });
});
