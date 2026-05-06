import { useEffect } from "react";
import { getTelegramWebApp } from "../lib/telegram";

export function useTelegramBack(onBack: () => void): void {
  useEffect(() => {
    const wa = getTelegramWebApp();
    const btn = wa?.BackButton;
    if (!btn) return;
    btn.show();
    btn.onClick(onBack);
    return () => {
      btn.offClick(onBack);
      btn.hide();
    };
  }, [onBack]);
}
