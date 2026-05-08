import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetForTesting, setupErrorReporting } from "../src/lib/error-reporter";

const mockSendBeacon = vi.fn().mockReturnValue(true);

Object.defineProperty(navigator, "sendBeacon", {
  value: mockSendBeacon,
  writable: true,
});

afterEach(() => {
  mockSendBeacon.mockClear();
  _resetForTesting();
});

describe("setupErrorReporting", () => {
  it("регистрирует error listener", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    setupErrorReporting();
    const calls = addSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain("error");
    expect(calls).toContain("unhandledrejection");
    addSpy.mockRestore();
  });

  it("window error → sendBeacon вызывается", () => {
    setupErrorReporting();
    const event = new ErrorEvent("error", {
      message: "test error",
      error: new Error("test error"),
    });
    window.dispatchEvent(event);
    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
    const [, blob] = mockSendBeacon.mock.calls[0] as [string, Blob];
    expect(blob.type).toBe("application/json");
  });

  it("unhandledrejection → sendBeacon вызывается", () => {
    setupErrorReporting();
    const event = Object.assign(new Event("unhandledrejection"), {
      reason: new Error("rejected"),
      promise: Promise.resolve(),
    });
    window.dispatchEvent(event);
    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
  });
});
