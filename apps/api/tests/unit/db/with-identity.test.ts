import { describe, expect, it, vi } from "vitest";
import { withIdentity, withSystem } from "../../../src/db/with-identity";
import type { AppUser } from "../../../src/middleware/identity-guard";

const USER: AppUser = { id: "00000000-0000-4000-a000-000000000099", tgId: 123456789, role: "user" };

describe("withIdentity", () => {
  it("calls sql.begin and sets three GUC configs before calling fn", async () => {
    const calls: string[] = [];

    const tagMock = vi.fn().mockImplementation((..._args: unknown[]) => {
      const sql = String(_args[0]);
      calls.push(sql.trim().replace(/\s+/g, " "));
      return Promise.resolve([]);
    });

    const beginMock = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(tagMock);
    });

    // biome-ignore lint/suspicious/noExplicitAny: mock sql object
    const mockSql = { begin: beginMock } as any;

    let fnCalled = false;
    await withIdentity(mockSql, USER, async () => {
      fnCalled = true;
      return "ok";
    });

    expect(beginMock).toHaveBeenCalledOnce();
    expect(fnCalled).toBe(true);
    expect(calls[0]).toContain("set_config");
    expect(calls.some((c) => c.includes("ROLE"))).toBe(true);
  });

  it("returns fn return value", async () => {
    const beginMock = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      // biome-ignore lint/suspicious/noExplicitAny: mock template tag
      const tag = vi.fn().mockResolvedValue([]) as any;
      return fn(tag);
    });
    // biome-ignore lint/suspicious/noExplicitAny: mock sql object
    const mockSql = { begin: beginMock } as any;

    const result = await withIdentity(mockSql, USER, async () => 42);
    expect(result).toBe(42);
  });

  it("passes isolation level string to sql.begin when provided", async () => {
    const beginMock = vi
      .fn()
      .mockImplementation(async (_iso: string, fn: (tx: unknown) => Promise<unknown>) => {
        // biome-ignore lint/suspicious/noExplicitAny: mock template tag
        const tag = vi.fn().mockResolvedValue([]) as any;
        return fn(tag);
      });
    // biome-ignore lint/suspicious/noExplicitAny: mock sql object
    const mockSql = { begin: beginMock } as any;

    await withIdentity(mockSql, USER, async () => "ok", "repeatable read");

    expect(beginMock).toHaveBeenCalledOnce();
    expect(beginMock.mock.calls[0]?.[0]).toBe("ISOLATION LEVEL REPEATABLE READ");
  });

  it("SENTINEL: bare isolation level normalised to full SQL clause (BEGIN <opts>)", async () => {
    const beginMock = vi
      .fn()
      .mockImplementation(async (_iso: string, fn: (tx: unknown) => Promise<unknown>) => {
        // biome-ignore lint/suspicious/noExplicitAny: mock template tag
        const tag = vi.fn().mockResolvedValue([]) as any;
        return fn(tag);
      });
    // biome-ignore lint/suspicious/noExplicitAny: mock sql object
    const mockSql = { begin: beginMock } as any;

    await withIdentity(mockSql, USER, async () => "ok", "serializable");
    expect(beginMock.mock.calls[0]?.[0]).toBe("ISOLATION LEVEL SERIALIZABLE");
  });

  it("passes through full clause untouched when caller already prefixed", async () => {
    const beginMock = vi
      .fn()
      .mockImplementation(async (_iso: string, fn: (tx: unknown) => Promise<unknown>) => {
        // biome-ignore lint/suspicious/noExplicitAny: mock template tag
        const tag = vi.fn().mockResolvedValue([]) as any;
        return fn(tag);
      });
    // biome-ignore lint/suspicious/noExplicitAny: mock sql object
    const mockSql = { begin: beginMock } as any;

    await withIdentity(mockSql, USER, async () => "ok", "ISOLATION LEVEL READ COMMITTED");
    expect(beginMock.mock.calls[0]?.[0]).toBe("ISOLATION LEVEL READ COMMITTED");
  });
});

describe("withSystem", () => {
  it("calls sql.begin without set_config", async () => {
    const beginMock = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({});
    });
    // biome-ignore lint/suspicious/noExplicitAny: mock sql object
    const mockSql = { begin: beginMock } as any;

    let fnCalled = false;
    await withSystem(mockSql, async () => {
      fnCalled = true;
      return "ok";
    });

    expect(beginMock).toHaveBeenCalledOnce();
    expect(fnCalled).toBe(true);
  });

  it("returns fn return value", async () => {
    const beginMock = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({});
    });
    // biome-ignore lint/suspicious/noExplicitAny: mock sql object
    const mockSql = { begin: beginMock } as any;

    const result = await withSystem(mockSql, async () => "system-result");
    expect(result).toBe("system-result");
  });
});
