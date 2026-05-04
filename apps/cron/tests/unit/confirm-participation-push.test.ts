import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmParticipationPush } from "../../src/confirm-participation-push";

type Row = Record<string, unknown>;

function makeSql(responses: Row[][]): import("postgres").Sql {
  let i = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[i] ?? [];
    i++;
    return Promise.resolve(resp);
  }) as unknown as import("postgres").Sql;
}

describe("confirmParticipationPush", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when lock not acquired", async () => {
    const sql = makeSql([[{ acquired: false }]]);
    expect(await confirmParticipationPush(sql)).toBeNull();
  });

  it("returns notified=0 when no rows to process", async () => {
    const sql = makeSql([[{ acquired: true }], [], []]);
    const result = await confirmParticipationPush(sql);
    expect(result).toEqual({ notified: 0 });
  });

  it("sends pg_notify and updates notified_at for each row", async () => {
    const row = { ride_id: "r1", passenger_id: "p1" };
    // lock, SELECT, pg_notify, UPDATE notified_at, unlock
    const sql = makeSql([[{ acquired: true }], [row], [], [], []]);
    const result = await confirmParticipationPush(sql);
    expect(result?.notified).toBe(1);
  });

  it("releases lock even if SELECT throws", async () => {
    let calls = 0;
    const sql = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.resolve([{ acquired: true }]);
      if (calls === 2) return Promise.reject(new Error("DB error"));
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;
    await expect(confirmParticipationPush(sql)).rejects.toThrow("DB error");
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
