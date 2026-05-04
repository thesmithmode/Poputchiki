import { describe, expect, it, vi } from "vitest";
import {
  POOL_CONFIG,
  createPool,
  poolMetrics,
  withSerializable,
  withTx,
} from "../../../src/db/pool";

describe("POOL_CONFIG", () => {
  it("max is 20", () => expect(POOL_CONFIG.max).toBe(20));
  it("idle_timeout is 20s", () => expect(POOL_CONFIG.idle_timeout).toBe(20));
  it("connect_timeout is 5s", () => expect(POOL_CONFIG.connect_timeout).toBe(5));
});

describe("createPool", () => {
  it("returns a sql object with begin method (lazy — no actual connection)", async () => {
    const sql = createPool("postgres://localhost:5432/test");
    expect(typeof sql.begin).toBe("function");
    await sql.end({ timeout: 0 });
  });
});

describe("poolMetrics.snapshot", () => {
  it("includes max, in_use, waiting keys", () => {
    const snap = poolMetrics.snapshot();
    expect(snap).toHaveProperty("max", 20);
    expect(snap).toHaveProperty("in_use");
    expect(snap).toHaveProperty("waiting", 0);
  });
});

describe("withTx", () => {
  it("calls sql.begin with REPEATABLE READ isolation", async () => {
    const beginMock = vi.fn().mockResolvedValue("ok");
    // biome-ignore lint/suspicious/noExplicitAny: mock object
    await withTx({ begin: beginMock } as any, "REPEATABLE READ", async () => "ok");
    expect(beginMock).toHaveBeenCalledWith("ISOLATION LEVEL REPEATABLE READ", expect.any(Function));
  });

  it("calls sql.begin with READ COMMITTED isolation", async () => {
    const beginMock = vi.fn().mockResolvedValue("ok");
    // biome-ignore lint/suspicious/noExplicitAny: mock object
    await withTx({ begin: beginMock } as any, "READ COMMITTED", async () => "ok");
    expect(beginMock).toHaveBeenCalledWith("ISOLATION LEVEL READ COMMITTED", expect.any(Function));
  });

  it("increments in_use during execution, resets after", async () => {
    let capturedInUse = -1;
    const beginMock = vi
      .fn()
      .mockImplementation(async (_: string, fn: (...args: unknown[]) => unknown) => {
        capturedInUse = poolMetrics.snapshot().in_use;
        return fn({});
      });
    const before = poolMetrics.snapshot().in_use;
    // biome-ignore lint/suspicious/noExplicitAny: mock object
    await withTx({ begin: beginMock } as any, "READ COMMITTED", async () => "ok");
    expect(capturedInUse).toBe(before + 1);
    expect(poolMetrics.snapshot().in_use).toBe(before);
  });

  it("resets in_use even when fn throws", async () => {
    const beginMock = vi.fn().mockRejectedValue(new Error("db error"));
    const before = poolMetrics.snapshot().in_use;
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: mock object
      withTx({ begin: beginMock } as any, "READ COMMITTED", async () => "ok"),
    ).rejects.toThrow("db error");
    expect(poolMetrics.snapshot().in_use).toBe(before);
  });
});

describe("withSerializable", () => {
  it("calls sql.begin with SERIALIZABLE isolation", async () => {
    const beginMock = vi.fn().mockResolvedValue("ok");
    // biome-ignore lint/suspicious/noExplicitAny: mock object
    await withSerializable({ begin: beginMock } as any, async () => "ok");
    expect(beginMock).toHaveBeenCalledWith("ISOLATION LEVEL SERIALIZABLE", expect.any(Function));
  });

  it("increments in_use during execution, resets after", async () => {
    let capturedInUse = -1;
    const beginMock = vi
      .fn()
      .mockImplementation(async (_: string, fn: (...args: unknown[]) => unknown) => {
        capturedInUse = poolMetrics.snapshot().in_use;
        return fn({});
      });
    const before = poolMetrics.snapshot().in_use;
    // biome-ignore lint/suspicious/noExplicitAny: mock object
    await withSerializable({ begin: beginMock } as any, async () => "ok");
    expect(capturedInUse).toBe(before + 1);
    expect(poolMetrics.snapshot().in_use).toBe(before);
  });

  it("resets in_use even when fn throws", async () => {
    const beginMock = vi.fn().mockRejectedValue(new Error("serializable error"));
    const before = poolMetrics.snapshot().in_use;
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: mock object
      withSerializable({ begin: beginMock } as any, async () => "ok"),
    ).rejects.toThrow("serializable error");
    expect(poolMetrics.snapshot().in_use).toBe(before);
  });
});
