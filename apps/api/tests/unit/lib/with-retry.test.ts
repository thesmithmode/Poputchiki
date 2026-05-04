import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../../../src/lib/with-retry";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error("transient"), { code: "CONNECTION_LOST" });
      return "done";
    });
    const result = await withRetry(fn, {
      maxAttempts: 5,
      baseMs: 1,
      retryIf: () => true,
    });
    expect(result).toBe("done");
    expect(calls).toBe(3);
  });

  it("throws after maxAttempts exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("persistent"));
    await expect(withRetry(fn, { maxAttempts: 3, baseMs: 1, retryIf: () => true })).rejects.toThrow(
      "persistent",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when retryIf returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fatal"));
    await expect(withRetry(fn, { maxAttempts: 5, retryIf: () => false })).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("default retryIf retries on CONNECTION_LOST", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 2) throw Object.assign(new Error("lost"), { code: "CONNECTION_LOST" });
      return "ok";
    });
    expect(await withRetry(fn, { baseMs: 1 })).toBe("ok");
    expect(calls).toBe(2);
  });

  it("default retryIf retries on deadlock (40P01)", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 2) throw Object.assign(new Error("deadlock"), { code: "40P01" });
      return "ok";
    });
    expect(await withRetry(fn, { baseMs: 1 })).toBe("ok");
    expect(calls).toBe(2);
  });

  it("default retryIf does not retry non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("unique"), { code: "23505" }));
    await expect(withRetry(fn, { maxAttempts: 5, baseMs: 1 })).rejects.toThrow("unique");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("default retryIf does not retry null error", async () => {
    const fn = vi.fn().mockRejectedValue(null);
    await expect(withRetry(fn, { maxAttempts: 3, baseMs: 1 })).rejects.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
