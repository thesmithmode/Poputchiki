import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { BannedScreen } from "./components/BannedScreen";
import { BottomTabBar } from "./components/BottomTabBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useMe } from "./hooks/useMe";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { applyTheme, getStoredTheme } from "./hooks/useThemePreference";
import { applyTelegramTheme, applyThemeParams, getTelegramWebApp } from "./lib/telegram";
import { AboutScreen } from "./screens/AboutScreen";
import { AdminScreen } from "./screens/AdminScreen";
import { ConfirmParticipationScreen } from "./screens/ConfirmParticipationScreen";
import { CreateRideScreen } from "./screens/CreateRideScreen";
import { EditProfileScreen } from "./screens/EditProfileScreen";
import { EventsScreen } from "./screens/EventsScreen";
import { FavoritesScreen } from "./screens/FavoritesScreen";
import { FeedScreen } from "./screens/FeedScreen";
import { MapScreen } from "./screens/MapScreen";
import { MyRidesScreen } from "./screens/MyRidesScreen";
import { NotificationPreferencesScreen } from "./screens/NotificationPreferencesScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { RideDetailScreen } from "./screens/RideDetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SupportScreen } from "./screens/SupportScreen";
import { PrivacyScreen } from "./screens/legal/PrivacyScreen";
import { TermsScreen } from "./screens/legal/TermsScreen";

function RideDetailRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <RideDetailScreen id={id} />;
}

function ProfileRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <ProfileScreen id={id} />;
}

function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div
      data-testid="not-found"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 16,
        padding: 24,
        background: "#f8f9fa",
      }}
    >
      <div style={{ fontSize: 48 }}>🔍</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#15191f" }}>Страница не найдена</div>
      <div style={{ fontSize: 14, color: "#7c8694", textAlign: "center" }}>
        Такой страницы не существует
      </div>
      <button
        type="button"
        onClick={() => navigate("/")}
        style={{
          marginTop: 8,
          padding: "12px 24px",
          background: "var(--brand-primary)",
          border: "none",
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 700,
          color: "#fff",
          cursor: "pointer",
        }}
      >
        На главную
      </button>
    </div>
  );
}

function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      data-testid="offline-banner"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#374151",
        color: "#fff",
        textAlign: "center",
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      Нет связи — показываем сохранённые данные
    </div>
  );
}

const TAB_PATHS = new Set([
  "/",
  "/map",
  "/favorites",
  "/events",
  "/settings",
  "/settings/notifications",
]);
// Map is full-screen — tab bar overlays it, no bottom padding needed
const FULL_SCREEN_PATHS = new Set(["/map"]);

function AppShell() {
  const location = useLocation();
  const showTabs = TAB_PATHS.has(location.pathname);
  const isFullScreen = FULL_SCREEN_PATHS.has(location.pathname);
  return (
    <>
      <a href="#main-content" className="skip-link">
        Перейти к основному контенту
      </a>
      <main id="main-content" style={showTabs && !isFullScreen ? { paddingBottom: 64 } : undefined}>
        <Routes>
          <Route path="/" element={<FeedScreen />} />
          <Route path="/rides" element={<FeedScreen />} />
          <Route path="/rides/new" element={<CreateRideScreen />} />
          <Route path="/favorites" element={<FavoritesScreen />} />
          <Route path="/map" element={<MapScreen />} />
          <Route path="/events" element={<EventsScreen />} />
          <Route path="/about" element={<AboutScreen />} />
          <Route path="/rides/:id" element={<RideDetailRoute />} />
          <Route path="/rides/:id/confirm" element={<ConfirmParticipationScreen />} />
          <Route path="/users/:id" element={<ProfileRoute />} />
          <Route path="/me/rides" element={<MyRidesScreen />} />
          <Route path="/me/edit" element={<EditProfileScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/settings/notifications" element={<NotificationPreferencesScreen />} />
          <Route path="/support" element={<SupportScreen />} />
          <Route path="/admin" element={<AdminScreen />} />
          <Route path="/privacy" element={<PrivacyScreen />} />
          <Route path="/terms" element={<TermsScreen />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <BottomTabBar />
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      networkMode: "offlineFirst",
    },
  },
});

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

  if (me.status === "error") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: 24,
          gap: 16,
          background: "var(--brand-bg, #f4f5f4)",
        }}
      >
        <p style={{ fontSize: 15, color: "#e54e5c", margin: 0, textAlign: "center" }}>
          Ошибка подключения
        </p>
        <p style={{ fontSize: 13, color: "#7c8694", margin: 0, textAlign: "center" }}>
          {me.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: "var(--brand-primary, #2D5A3D)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "12px 24px",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}

export function App() {
  useEffect(() => {
    const storedPref = getStoredTheme();
    const wa = getTelegramWebApp();
    if (wa) {
      applyThemeParams(wa.themeParams ?? {});
      if (storedPref === "system") applyTelegramTheme(wa.colorScheme);
      else applyTheme(storedPref);
      try {
        wa.ready();
        wa.expand?.();
      } catch {
        // noop
      }
      wa.onEvent("themeChanged", () => {
        const next = getTelegramWebApp();
        if (!next) return;
        applyThemeParams(next.themeParams ?? {});
        const cur = getStoredTheme();
        if (cur === "system") applyTelegramTheme(next.colorScheme);
      });
    } else {
      applyTheme(storedPref);
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <div data-testid="app-root">
          <OfflineBanner />
          <AppRoutes />
        </div>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
