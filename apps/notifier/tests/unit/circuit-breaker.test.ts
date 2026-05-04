import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "../../src/circuit-breaker";

describe("CircuitBreaker", () => {
  it("starts closed", () => {
    const cb = new CircuitBreaker();
    expect(cb.isOpen()).toBe(false);
    expect(cb.currentState).toBe("closed");
  });

  it("opens after failureThreshold failures", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false);
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
  });

  it("closes after success", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
    cb.recordSuccess();
    expect(cb.isOpen()).toBe(false);
  });

  it("transitions to half-open after window expires", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, openWindowMs: 1000 });
    cb.recordFailure();
    expect(cb.currentState).toBe("open");
    vi.advanceTimersByTime(1001);
    expect(cb.currentState).toBe("half-open");
    expect(cb.isOpen()).toBe(false);
    vi.useRealTimers();
  });

  it("resets failure count on success", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false); // only 1 failure since reset
  });
});
