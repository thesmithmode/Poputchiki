import { afterEach, describe, expect, it, vi } from "vitest";
import { runBackup, runBaseBackup, runRestoreTest } from "../../src/backup";

type Row = Record<string, unknown>;

function makeSql(responses: (Row[] | Error)[]): import("postgres").Sql {
  let i = 0;
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = vi.fn().mockImplementation(() => {
        const resp = responses[i] ?? [];
        i++;
        return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
      });
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

function makeSpawn(exitCode = 0) {
  return vi.fn().mockResolvedValue({ exitCode });
}

describe("runBackup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when advisory lock not acquired", async () => {
    const sql = makeSql([[{ acquired: false }]]);
    const result = await runBackup(sql, { _spawn: makeSpawn() });
    expect(result).toBeNull();
  });

  it("spawns backup-db.sh when lock acquired", async () => {
    const sql = makeSql([[{ acquired: true }]]);
    const spawn = makeSpawn(0);
    const result = await runBackup(sql, { _spawn: spawn });
    expect(spawn).toHaveBeenCalledOnce();
    const [cmd] = spawn.mock.calls[0] as [string[]];
    expect(cmd.join(" ")).toContain("backup-db.sh");
    expect(result).toMatchObject({ ok: true });
  });

  it("returns ok:false and notifies admin when script fails", async () => {
    const sql = makeSql([[{ acquired: true }]]);
    const spawn = makeSpawn(1);
    const notify = vi.fn().mockResolvedValue(undefined);
    const result = await runBackup(sql, { _spawn: spawn, _notify: notify });
    expect(result).toMatchObject({ ok: false });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("returns ok:false and notifies when spawn throws", async () => {
    const sql = makeSql([[{ acquired: true }]]);
    const spawn = vi.fn().mockRejectedValue(new Error("spawn error"));
    const notify = vi.fn().mockResolvedValue(undefined);
    const result = await runBackup(sql, { _spawn: spawn, _notify: notify });
    expect(result).toMatchObject({ ok: false });
    expect(notify).toHaveBeenCalledOnce();
  });
});

describe("runBaseBackup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when lock not acquired", async () => {
    const sql = makeSql([[{ acquired: false }]]);
    expect(await runBaseBackup(sql, { _spawn: makeSpawn() })).toBeNull();
  });

  it("spawns backup-db.sh with --base flag when lock acquired", async () => {
    const sql = makeSql([[{ acquired: true }]]);
    const spawn = makeSpawn(0);
    const result = await runBaseBackup(sql, { _spawn: spawn });
    const [cmd] = spawn.mock.calls[0] as [string[]];
    expect(cmd.join(" ")).toContain("--base");
    expect(result).toMatchObject({ ok: true });
  });

  it("notifies admin on failure", async () => {
    const sql = makeSql([[{ acquired: true }]]);
    const notify = vi.fn().mockResolvedValue(undefined);
    const result = await runBaseBackup(sql, { _spawn: makeSpawn(1), _notify: notify });
    expect(result).toMatchObject({ ok: false });
    expect(notify).toHaveBeenCalledOnce();
  });
});

describe("runRestoreTest", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when lock not acquired", async () => {
    const sql = makeSql([[{ acquired: false }]]);
    expect(await runRestoreTest(sql, { _spawn: makeSpawn() })).toBeNull();
  });

  it("spawns restore-test.sh when lock acquired", async () => {
    const sql = makeSql([[{ acquired: true }]]);
    const spawn = makeSpawn(0);
    const result = await runRestoreTest(sql, { _spawn: spawn });
    const [cmd] = spawn.mock.calls[0] as [string[]];
    expect(cmd.join(" ")).toContain("restore-test.sh");
    expect(result).toMatchObject({ ok: true });
  });

  it("notifies admin on restore failure", async () => {
    const sql = makeSql([[{ acquired: true }]]);
    const notify = vi.fn().mockResolvedValue(undefined);
    const result = await runRestoreTest(sql, { _spawn: makeSpawn(1), _notify: notify });
    expect(result).toMatchObject({ ok: false });
    expect(notify).toHaveBeenCalledOnce();
  });
});
