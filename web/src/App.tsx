import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { applyTelegramTheme, getTelegramWebApp } from "./lib/telegram";

function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <h1 className="text-2xl font-semibold">Poputchiki</h1>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <p>404</p>
    </main>
  );
}

export function App() {
  useEffect(() => {
    const wa = getTelegramWebApp();
    if (!wa) return;
    applyTelegramTheme(wa.colorScheme);
    try {
      wa.ready();
    } catch {
      // noop
    }
    wa.onEvent("themeChanged", () => {
      const next = getTelegramWebApp();
      if (next) applyTelegramTheme(next.colorScheme);
    });
  }, []);

  return (
    <div data-testid="app-root">
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </HashRouter>
    </div>
  );
}
