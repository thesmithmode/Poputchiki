export type TelegramColorScheme = "light" | "dark";

export interface TelegramWebApp {
  colorScheme: TelegramColorScheme;
  onEvent: (event: string, handler: (...args: unknown[]) => void) => void;
  ready: () => void;
  initData?: string;
  initDataUnsafe?: Record<string, unknown>;
}

export function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function applyTelegramTheme(scheme: TelegramColorScheme): void {
  const root = document.documentElement;
  if (scheme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}
