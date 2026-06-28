import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPersistedQueryCache,
  hydratePersistedQueryCache,
  persistQueryClientCache,
} from "../src/lib/queryCachePersistence";

describe("queryCachePersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("не сохраняет пользовательские и админские ответы в localStorage", () => {
    const client = new QueryClient();
    client.setQueryData(["support-tickets"], [{ text: "SECRET_SUPPORT" }]);
    client.setQueryData(["admin-tickets"], [{ text: "SECRET_ADMIN" }]);
    client.setQueryData(["notifications"], [{ text: "SECRET_NOTIFICATION" }]);
    client.setQueryData(["ride-requests", "mine"], [{ id: "request-1" }]);
    client.setQueryData(["rides", "mine", "passenger", "future"], [{ id: "ride-private" }]);
    client.setQueryData(["ride", "ride-1"], { route: "PRIVATE_ROUTE" });
    client.setQueryData(["rides", "list", "24h", null, null], [{ id: "ride-public" }]);

    persistQueryClientCache(client);

    const raw = localStorage.getItem("pp_qc_v1") ?? "";
    expect(raw).toContain("ride-public");
    expect(raw).not.toContain("SECRET_SUPPORT");
    expect(raw).not.toContain("SECRET_ADMIN");
    expect(raw).not.toContain("SECRET_NOTIFICATION");
    expect(raw).not.toContain("request-1");
    expect(raw).not.toContain("ride-private");
    expect(raw).not.toContain("PRIVATE_ROUTE");
  });

  it("восстанавливает только разрешённый публичный кэш из нового и старого формата", () => {
    const source = new QueryClient();
    source.setQueryData(["support-tickets"], [{ text: "SECRET_SUPPORT" }]);
    source.setQueryData(["rides", "list", "24h", null, null], [{ id: "ride-public" }]);
    persistQueryClientCache(source);

    const restored = new QueryClient();
    hydratePersistedQueryCache(restored);

    expect(restored.getQueryData(["rides", "list", "24h", null, null])).toEqual([
      { id: "ride-public" },
    ]);
    expect(restored.getQueryData(["support-tickets"])).toBeUndefined();
  });

  it("не восстанавливает чувствительные queries из старого глобального кэша", () => {
    localStorage.setItem(
      "pp_qc_v1",
      JSON.stringify({
        ts: Date.now(),
        state: {
          mutations: [],
          queries: [
            {
              queryKey: ["support-tickets"],
              queryHash: '["support-tickets"]',
              state: { data: [{ text: "SECRET_SUPPORT" }], status: "success" },
            },
            {
              queryKey: ["rides", "list", "24h", null, null],
              queryHash: '["rides","list","24h",null,null]',
              state: { data: [{ id: "ride-public" }], status: "success" },
            },
          ],
        },
      }),
    );

    const restored = new QueryClient();
    hydratePersistedQueryCache(restored);

    expect(restored.getQueryData(["support-tickets"])).toBeUndefined();
    expect(restored.getQueryData(["rides", "list", "24h", null, null])).toEqual([
      { id: "ride-public" },
    ]);
  });

  it("очищает сохранённый QueryClient cache при logout/account mismatch", () => {
    localStorage.setItem("pp_qc_v1", JSON.stringify({ ts: Date.now(), state: {} }));

    clearPersistedQueryCache();

    expect(localStorage.getItem("pp_qc_v1")).toBeNull();
  });
});
