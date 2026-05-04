import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { BannedScreen } from "./components/BannedScreen";
import { useMe } from "./hooks/useMe";
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

function AppRoutes() {
  const me = useMe();

  if (me.status === "loading") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <p>Загрузка...</p>
      </div>
    );
  }

  if (me.status === "banned") {
    return <BannedScreen reason={me.reason} bannedAt={me.banned_at} />;
  }

  // "ok" or "error" (401 / network) — show routes normally
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
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
      <AppRoutes />
    </div>
  );
}
