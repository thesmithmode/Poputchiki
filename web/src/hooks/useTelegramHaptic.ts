import { useCallback } from "react";
import { getTelegramWebApp } from "../lib/telegram";
import type { HapticImpactStyle, HapticNotificationType } from "../lib/telegram";

export function useTelegramHaptic() {
  const impact = useCallback((style: HapticImpactStyle) => {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
  }, []);

  const notification = useCallback((type: HapticNotificationType) => {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
  }, []);

  const selection = useCallback(() => {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged();
  }, []);

  return { impact, notification, selection };
}
