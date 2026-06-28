import { describe, expect, it } from "vitest";
import { queryKeys } from "../src/lib/queryKeys";

describe("queryKeys", () => {
  it("SECURITY: scopes saved-address cache keys by Telegram user", () => {
    expect(queryKeys.savedAddresses.byTelegramUser(123)).toEqual(["saved-addresses", "tg", "123"]);
    expect(queryKeys.savedAddresses.byTelegramUser(456)).toEqual(["saved-addresses", "tg", "456"]);
    expect(queryKeys.savedAddresses.byTelegramUser(123)).not.toEqual(
      queryKeys.savedAddresses.byTelegramUser(456),
    );
    expect(queryKeys.savedAddresses.byTelegramUser(123)).not.toEqual(queryKeys.savedAddresses.all);
  });
});
