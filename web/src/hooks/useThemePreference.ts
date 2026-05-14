import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = "pp_theme";

function getSystemDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
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
