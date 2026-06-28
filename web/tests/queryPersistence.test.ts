import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "../src/lib/queryKeys";
import {
  PERSISTED_QUERY_CACHE_KEY,
  clearPersistedQueryCache,
  dehydratePersistentQueryCache,
} from "../src/lib/queryPersistence";

describe("query persistence privacy", () => {
  it("does not persist saved addresses with precise coordinates", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.savedAddresses.byUser("user-a"), [
      { id: "home", name: "Дом", address_label: "ул. Тукая, 4", lat: 55.731234, lng: 49.219876 },
    ]);
    qc.setQueryData(["rides"], [{ id: "ride-1" }]);

    const state = dehydratePersistentQueryCache(qc);
    const queryHashes = state.queries.map((q) => q.queryHash);

    expect(queryHashes).not.toContain(JSON.stringify(queryKeys.savedAddresses.byUser("user-a")));
    expect(JSON.stringify(state)).not.toContain("55.731234");
    expect(queryHashes).toContain(JSON.stringify(["rides"]));
  });

  it("removes persisted query cache from localStorage on identity reset", () => {
    localStorage.setItem(PERSISTED_QUERY_CACHE_KEY, "cached");

    clearPersistedQueryCache();

    expect(localStorage.getItem(PERSISTED_QUERY_CACHE_KEY)).toBeNull();
  });

  it("ignores localStorage errors while clearing persisted cache", () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked storage");
    });

    expect(() => clearPersistedQueryCache()).not.toThrow();

    spy.mockRestore();
  });
});
