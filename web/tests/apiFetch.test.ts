import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../src/lib/api";
import * as tokenStore from "../src/lib/tokenStore";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.spyOn(tokenStore, "getTokens").mockReturnValue(null);
  Object.defineProperty(document, "cookie", {
    writable: true,
    value: "",
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe("apiFetch", () => {
  it("шлёт Content-Type application/json по умолчанию", async () => {
    mockFetch(200, { ok: true });
    await apiFetch("/users/me");
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("добавляет Authorization заголовок если токен есть", async () => {
    vi.spyOn(tokenStore, "getTokens").mockReturnValue({ access: "acc", refresh: "ref" });
    mockFetch(200, {});
    await apiFetch("/users/me");
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers["Authorization"]).toBe("Bearer acc");
  });

  it("НЕ добавляет Authorization если токенов нет", async () => {
    mockFetch(200, {});
    await apiFetch("/users/me");
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers["Authorization"]).toBeUndefined();
  });

  it("добавляет X-CSRF-Token если csrf_token cookie присутствует", async () => {
    document.cookie = "csrf_token=abc123";
    mockFetch(200, {});
    await apiFetch("/users/me", { method: "PATCH", body: "{}" });
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers["X-CSRF-Token"]).toBe("abc123");
  });

  it("НЕ добавляет X-CSRF-Token если csrf_token cookie отсутствует", async () => {
    document.cookie = "";
    mockFetch(200, {});
    await apiFetch("/users/me", { method: "GET" });
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("читает csrf_token из куки среди нескольких значений", async () => {
    document.cookie = "other=val; csrf_token=tok42; another=x";
    mockFetch(200, {});
    await apiFetch("/users/me", { method: "POST", body: "{}" });
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers["X-CSRF-Token"]).toBe("tok42");
  });

  it("пробрасывает credentials include", async () => {
    mockFetch(200, {});
    await apiFetch("/users/me");
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.credentials).toBe("include");
  });

  it("бросает ApiError при !ok ответе", async () => {
    mockFetch(401, { error: "unauthorized" });
    await expect(apiFetch("/users/me")).rejects.toBeInstanceOf(ApiError);
  });

  it("ApiError содержит status и body", async () => {
    mockFetch(422, { error: "invalid input" });
    try {
      await apiFetch("/users/me");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).body).toEqual({ error: "invalid input" });
    }
  });

  it("добавляет /api префикс к путям без него", async () => {
    mockFetch(200, {});
    await apiFetch("/users/me");
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/users\/me$/);
  });

  it("не добавляет /api к путям начинающимся с /auth/", async () => {
    mockFetch(200, {});
    await apiFetch("/auth/telegram", { method: "POST", body: "{}" });
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/telegram$/);
    expect(url).not.toContain("/api/auth/");
  });

  it("не добавляет /api к путям начинающимся с /api/", async () => {
    mockFetch(200, {});
    await apiFetch("/api/users/me");
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("/api/api/");
  });
});
