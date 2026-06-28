import { beforeEach, describe, expect, it } from "vitest";
import { clearTokens, getTokens, setTokens } from "../src/lib/tokenStore";

beforeEach(() => {
  localStorage.clear();
  clearTokens();
});

describe("tokenStore", () => {
  it("SENTINEL: keeps access token in memory only and never persists refresh tokens to localStorage", () => {
    setTokens("access-token");

    expect(getTokens()).toEqual({ access: "access-token" });
    expect(localStorage.getItem("pp_tokens")).toBeNull();
  });

  it("clearTokens clears in-memory access token and removes legacy localStorage tokens", () => {
    localStorage.setItem("pp_tokens", JSON.stringify({ access: "old", refresh: "secret" }));
    setTokens("access-token");

    clearTokens();

    expect(getTokens()).toBeNull();
    expect(localStorage.getItem("pp_tokens")).toBeNull();
  });
});
