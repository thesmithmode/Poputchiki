import { QueryClient, dehydrate } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CACHE_KEY,
  clearPersistedQueryCache,
  shouldPersistQuery,
} from "../src/lib/queryCachePersistence";
import { clearTokens, setTokens } from "../src/lib/tokenStore";

const savedAddress = {
  id: "addr-1",
  user_id: "user-a",
  type: "home",
  name: "Дом",
  address_label: "Царёво, дом 1",
  lat: 55.796391,
  lng: 49.108891,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
};

describe("query cache persistence privacy", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not dehydrate saved addresses with exact coordinates", () => {
    const qc = new QueryClient();
    qc.setQueryData(["saved-addresses"], [savedAddress]);
    qc.setQueryData(["rides"], [{ id: "ride-1" }]);

    const state = dehydrate(qc, { shouldDehydrateQuery: shouldPersistQuery });
    const serialized = JSON.stringify(state);

    expect(serialized).not.toContain("Царёво, дом 1");
    expect(serialized).not.toContain("55.796391");
    expect(serialized).not.toContain("saved-addresses");
    expect(serialized).toContain("ride-1");
  });

  it("removes persisted query cache when tokens are cleared", () => {
    setTokens("access", "refresh");
    localStorage.setItem(CACHE_KEY, JSON.stringify({ state: "cached" }));

    clearTokens();

    expect(localStorage.getItem("pp_tokens")).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("clearPersistedQueryCache is idempotent", () => {
    localStorage.setItem(CACHE_KEY, "cached");
    clearPersistedQueryCache();
    clearPersistedQueryCache();

    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});
