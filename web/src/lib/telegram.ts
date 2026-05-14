export type TelegramColorScheme = "light" | "dark";

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

export interface TelegramBackButton {
  show: () => void;
  hide: () => void;
  onClick: (fn: () => void) => void;
  offClick: (fn: () => void) => void;
}

export interface TelegramMainButton {
  text: string;
  show: () => void;
  hide: () => void;
  onClick: (fn: () => void) => void;
  offClick: (fn: () => void) => void;
  enable: () => void;
  disable: () => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
}

export type HapticImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
export type HapticNotificationType = "error" | "success" | "warning";

export interface TelegramHapticFeedback {
  impactOccurred: (style: HapticImpactStyle) => void;
  notificationOccurred: (type: HapticNotificationType) => void;
  selectionChanged: () => void;
}

export interface TelegramViewport {
  expand: () => void;
  height: number;
  isExpanded: boolean;
}

export interface TelegramWebApp {
  colorScheme: TelegramColorScheme;
  themeParams?: TelegramThemeParams;
  BackButton?: TelegramBackButton;
  MainButton?: TelegramMainButton;
  HapticFeedback?: TelegramHapticFeedback;
  viewportHeight?: number;
  expand?: () => void;
  disableSwipeClose?: boolean;
  disableVerticalSwipes?: () => void;
  onEvent: (event: string, handler: (...args: unknown[]) => void) => void;
  ready: () => void;
  initData?: string;
  initDataUnsafe?: Record<string, unknown>;
}

const FALLBACK_LIGHT: Required<TelegramThemeParams> = {
  bg_color: "#ffffff",
  text_color: "#000000",
  hint_color: "#999999",
  link_color: "#2481cc",
  button_color: "#2481cc",
  button_text_color: "#ffffff",
  secondary_bg_color: "#f1f1f1",
};

export function applyThemeParams(params: TelegramThemeParams): void {
  const root = document.documentElement;
  root.style.setProperty("--tg-bg", params.bg_color ?? FALLBACK_LIGHT.bg_color);
  root.style.setProperty("--tg-text", params.text_color ?? FALLBACK_LIGHT.text_color);
  root.style.setProperty("--tg-hint", params.hint_color ?? FALLBACK_LIGHT.hint_color);
  root.style.setProperty("--tg-link", params.link_color ?? FALLBACK_LIGHT.link_color);
  root.style.setProperty("--tg-accent", params.button_color ?? FALLBACK_LIGHT.button_color);
  root.style.setProperty(
    "--tg-button-text",
    params.button_text_color ?? FALLBACK_LIGHT.button_text_color,
  );
  root.style.setProperty(
    "--tg-secondary-bg",
    params.secondary_bg_color ?? FALLBACK_LIGHT.secondary_bg_color,
  );
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
