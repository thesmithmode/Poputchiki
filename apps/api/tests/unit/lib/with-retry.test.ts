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
});
