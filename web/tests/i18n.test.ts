import { describe, expect, it } from "vitest";

describe("i18n", () => {
  it("инициализируется с ru локалью", async () => {
    const i18n = (await import("../src/i18n")).default;
    expect(i18n.language).toBe("ru");
  });

  it("переводит ключ common.loading", async () => {
    const i18n = (await import("../src/i18n")).default;
    expect(i18n.t("common.loading")).toBe("Загрузка...");
  });

  it("переводит ключ errors.offline", async () => {
    const i18n = (await import("../src/i18n")).default;
    expect(i18n.t("errors.offline")).toBe("Нет подключения к интернету");
  });

  it("возвращает ключ для несуществующего перевода", async () => {
    const i18n = (await import("../src/i18n")).default;
    expect(i18n.t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("plural rides.seats работает", async () => {
    const i18n = (await import("../src/i18n")).default;
    expect(i18n.t("rides.seats", { count: 1 })).toBe("1 место");
    expect(i18n.t("rides.seats", { count: 3 })).toBe("3 места");
    expect(i18n.t("rides.seats", { count: 5 })).toBe("5 мест");
  });
});
