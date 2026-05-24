import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmParticipationPush } from "../../src/confirm-participation-push";

type Row = Record<string, unknown>;

function makeSql(txResponses: (Row[] | Error)[]): import("postgres").Sql {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let i = 0;
      const txFn = vi.fn().mockImplementation(() => {
        const resp = txResponses[i] ?? [];
        i++;
        return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
      });
      // biome-ignore lint/suspicious/noExplicitAny: postgres.js tx mock нужен any для .json
      const tx = txFn as any;
      tx.json = (v: unknown) => JSON.stringify(v);
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

describe("confirmParticipationPush", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when lock not acquired", async () => {
    const sql = makeSql([[{ acquired: false }]]);
    expect(await confirmParticipationPush(sql)).toBeNull();
  });

  it("returns notified=0 when no rows to process", async () => {
    // lock check, SELECT passengers (empty)
    const sql = makeSql([[{ acquired: true }], []]);
    const result = await confirmParticipationPush(sql);
    expect(result).toEqual({ notified: 0 });
  });

  it("sends pg_notify and updates notified_at for each row", async () => {
    const row = { ride_id: "r1", passenger_id: "p1" };
    // lock, SELECT rows, pg_notify, UPDATE notified_at
    const sql = makeSql([[{ acquired: true }], [row], [], []]);
    const result = await confirmParticipationPush(sql);
    expect(result?.notified).toBe(1);
  });

  it("propagates error from SELECT (transaction rollbacks, lock auto-released)", async () => {
    const sql = makeSql([[{ acquired: true }], new Error("DB error")]);
    await expect(confirmParticipationPush(sql)).rejects.toThrow("DB error");
  });
});
