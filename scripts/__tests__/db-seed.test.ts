import { describe, expect, it } from "vitest";
import { ProductionSeedError, SEED_USERS, assertNotProduction } from "../db-seed";

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
