import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFilterPresets } from "../src/hooks/useFilterPresets";
import { DEFAULT_FILTERS } from "../src/hooks/useFilters";

function setTelegramUser(id: number | undefined) {
  if (id === undefined) {
    (window as unknown as { Telegram?: unknown }).Telegram = undefined;
    return;
  }
  (window as unknown as { Telegram: unknown }).Telegram = {
    WebApp: {
      initDataUnsafe: { user: { id } },
      onEvent: () => {},
      ready: () => {},
    },
  };
}

describe("useFilterPresets", () => {
  beforeEach(() => {
    localStorage.clear();
    setTelegramUser(undefined);
  });

  it("scopes saved presets by Telegram user id", () => {
    setTelegramUser(101);
    const firstUser = renderHook(() => useFilterPresets());

    act(() => {
      firstUser.result.current.addPreset("Дом → работа", {
        ...DEFAULT_FILTERS,
        direction: "Дом: ул. Ленина 1 → Работа: БЦ Север",
      });
    });

    firstUser.unmount();
    setTelegramUser(202);
    const secondUser = renderHook(() => useFilterPresets());

    expect(secondUser.result.current.presets).toEqual([]);
    expect(localStorage.getItem("pp_filter_presets")).toBeNull();
    expect(localStorage.getItem("pp_filter_presets:tg:101")).toContain("БЦ Север");
  });
});
