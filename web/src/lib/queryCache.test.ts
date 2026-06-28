import { describe, expect, it } from "vitest";
import { filterPersistedQueryState } from "./queryCache";

describe("queryCache persistence", () => {
  it("сохраняет только публичный список поездок и отбрасывает пользовательские запросы", () => {
    const state = {
      queries: [
        { queryKey: ["rides", "list", "24h", null, null], state: { data: [{ id: "public" }] } },
        { queryKey: ["support-tickets"], state: { data: [{ text: "USER_A_SECRET" }] } },
        { queryKey: ["notifications"], state: { data: { items: [{ rideId: "private" }] } } },
        { queryKey: ["rides", "mine", "passenger", "future"], state: { data: { rides: [] } } },
        { queryKey: ["me"], state: { data: { id: "user-a" } } },
      ],
      mutations: [{ mutationKey: ["join-ride"] }],
    };

    expect(filterPersistedQueryState(state)).toEqual({
      queries: [
        { queryKey: ["rides", "list", "24h", null, null], state: { data: [{ id: "public" }] } },
      ],
      mutations: [],
    });
  });
});
