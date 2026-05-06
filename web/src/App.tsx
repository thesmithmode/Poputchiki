import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { HashRouter, Route, Routes, useParams } from "react-router-dom";
import { BannedScreen } from "./components/BannedScreen";
import { useMe } from "./hooks/useMe";
import { applyTelegramTheme, getTelegramWebApp } from "./lib/telegram";
import { CreateRideScreen } from "./screens/CreateRideScreen";
import { FavoritesScreen } from "./screens/FavoritesScreen";
import { FeedScreen } from "./screens/FeedScreen";
import { MapScreen } from "./screens/MapScreen";
import { NotificationPreferencesScreen } from "./screens/NotificationPreferencesScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { RideDetailScreen } from "./screens/RideDetailScreen";

function RideDetailRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <RideDetailScreen id={id} />;
}

function ProfileRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <ProfileScreen id={id} />;
}

const queryClient = new QueryClient();

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

  if (me.status === "ok" && !me.user.onboarded) {
    return (
      <OnboardingScreen
        displayName={me.user.display_name}
        onComplete={() => window.location.reload()}
      />
    );
  }

  // "ok" or "error" (401 / network) — show routes normally
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<FeedScreen />} />
        <Route path="/rides" element={<FeedScreen />} />
        <Route path="/rides/new" element={<CreateRideScreen />} />
        <Route path="/favorites" element={<FavoritesScreen />} />
        <Route path="/map" element={<MapScreen />} />
        <Route path="/rides/:id" element={<RideDetailRoute />} />
        <Route path="/users/:id" element={<ProfileRoute />} />
        <Route path="/settings/notifications" element={<NotificationPreferencesScreen />} />
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
    <QueryClientProvider client={queryClient}>
      <div data-testid="app-root">
        <AppRoutes />
      </div>
    </QueryClientProvider>
  );
}
