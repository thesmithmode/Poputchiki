import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = "pp_theme";

// Для "system" приоритет — Telegram WebApp colorScheme (PC Telegram использует свою
// тему, не Windows), и только если Telegram недоступен — браузерный prefers-color-scheme.
// Без этого: App.tsx ставит .dark по Telegram light, а useThemePreference в SettingsScreen
// перезаписывает классом по Windows dark → light --tg-* vars + .dark --brand-* = смешанная тема.
function getSystemDark(): boolean {
  if (typeof window !== "undefined") {
    const wa = (window as unknown as { Telegram?: { WebApp?: { colorScheme?: string } } }).Telegram
      ?.WebApp;
    if (wa?.colorScheme === "light" || wa?.colorScheme === "dark") {
      return wa.colorScheme === "dark";
    }
  }
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isTelegramEnv(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp;
}

export function getStoredTheme(): ThemePref {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  const dark = pref === "dark" || (pref === "system" && getSystemDark());
  if (dark) root.classList.add("dark");
  else root.classList.remove("dark");
}

export function useThemePreference(): {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
} {
  const [pref, setPrefState] = useState<ThemePref>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system") return;
    // В Telegram-окружении подписку на смену системной темы держит App.tsx
    // через wa.onEvent("themeChanged"). Подписываться на browser MQ здесь — значит
    // конфликтовать с Telegram colorScheme (Windows dark vs Telegram light).
    if (isTelegramEnv()) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [pref]);

  const setPref = (p: ThemePref) => {
    localStorage.setItem(STORAGE_KEY, p);
    setPrefState(p);
  };

  return { pref, setPref };
}
