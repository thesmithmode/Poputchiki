import { describe, expect, it, vi } from "vitest";
import { ProductionSeedError, SEED_USERS, assertNotProduction, seedAdmin } from "../db-seed";

describe("assertNotProduction", () => {
  it("NODE_ENV=production → ProductionSeedError", () => {
    expect(() => assertNotProduction("production")).toThrow(ProductionSeedError);
  });

  it("NODE_ENV=development → ok", () => {
    expect(() => assertNotProduction("development")).not.toThrow();
  });

  it("NODE_ENV=test → ok", () => {
    expect(() => assertNotProduction("test")).not.toThrow();
  });

  it("NODE_ENV undefined → ok", () => {
    expect(() => assertNotProduction(undefined)).not.toThrow();
  });

  it("NODE_ENV=staging → ok (только production отбрасывается)", () => {
    expect(() => assertNotProduction("staging")).not.toThrow();
  });
});

describe("SEED_USERS", () => {
  it("содержит ровно 5 mock пользователей", () => {
    expect(SEED_USERS).toHaveLength(5);
  });

  it("все tg_id уникальны", () => {
    const ids = new Set(SEED_USERS.map((u) => u.tg_id));
    expect(ids.size).toBe(SEED_USERS.length);
  });

  it("все display_name непустые", () => {
    for (const u of SEED_USERS) expect(u.display_name.length).toBeGreaterThan(0);
  });
});

describe("seedAdmin", () => {
  function makeSql(updated: number) {
    // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
    const sql = vi.fn() as any;
    sql.mockResolvedValue([{ updated_rows: updated }]);
    return sql;
  }

  it("no-op если ADMIN_TG_ID не задан", async () => {
    const sql = makeSql(0);
    const result = await seedAdmin(sql, undefined);
    expect(result.admin_granted).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it("обновляет role=admin и пишет audit_log если пользователь существует", async () => {
    const calls: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = vi.fn() as any;
    sql.mockImplementation((..._args: unknown[]) => {
      const tag = String(_args[0]?.[0] ?? "");
      calls.push(tag.trim().slice(0, 20));
      if (tag.includes("UPDATE")) return [{ id: "some-uuid" }];
      return [];
    });
    const result = await seedAdmin(sql, "999999");
    expect(result.admin_granted).toBe(true);
    expect(calls.some((c) => c.includes("UPDATE"))).toBe(true);
  });

  it("нет обновления если пользователь не найден — no audit_log", async () => {
    const calls: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = vi.fn() as any;
    sql.mockImplementation((..._args: unknown[]) => {
      const tag = String(_args[0]?.[0] ?? "");
      calls.push(tag.trim().slice(0, 20));
      return []; // UPDATE returns no rows — user not found
    });
    const result = await seedAdmin(sql, "999999");
    expect(result.admin_granted).toBe(false);
    // Should not call audit_log INSERT if user was not found
    expect(calls.filter((c) => c.includes("INSERT")).length).toBe(0);
  });
});
