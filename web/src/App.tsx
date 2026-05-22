import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { BannedScreen } from "./components/BannedScreen";
import { BottomTabBar } from "./components/BottomTabBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useMe } from "./hooks/useMe";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { applyTheme, getStoredTheme } from "./hooks/useThemePreference";
import { apiFetch } from "./lib/api";
import { applyTelegramTheme, applyThemeParams, getTelegramWebApp } from "./lib/telegram";
// Все экраны lazy — skeleton показывается пока auth + chunk загружаются
const RidesScreen = lazy(() =>
  import("./screens/RidesScreen").then((m) => ({ default: m.RidesScreen })),
);
const AboutScreen = lazy(() =>
  import("./screens/AboutScreen").then((m) => ({ default: m.AboutScreen })),
);
const AdminScreen = lazy(() =>
  import("./screens/AdminScreen").then((m) => ({ default: m.AdminScreen })),
);
const ConfirmParticipationScreen = lazy(() =>
  import("./screens/ConfirmParticipationScreen").then((m) => ({
    default: m.ConfirmParticipationScreen,
  })),
);
const CreateRideScreen = lazy(() =>
  import("./screens/CreateRideScreen").then((m) => ({ default: m.CreateRideScreen })),
);
const EditProfileScreen = lazy(() =>
  import("./screens/EditProfileScreen").then((m) => ({ default: m.EditProfileScreen })),
);
const EventsScreen = lazy(() =>
  import("./screens/EventsScreen").then((m) => ({ default: m.EventsScreen })),
);
const FavoritesScreen = lazy(() =>
  import("./screens/FavoritesScreen").then((m) => ({ default: m.FavoritesScreen })),
);
const MyRidesScreen = lazy(() =>
  import("./screens/MyRidesScreen").then((m) => ({ default: m.MyRidesScreen })),
);
const NotificationPreferencesScreen = lazy(() =>
  import("./screens/NotificationPreferencesScreen").then((m) => ({
    default: m.NotificationPreferencesScreen,
  })),
);
const ProfileScreen = lazy(() =>
  import("./screens/ProfileScreen").then((m) => ({ default: m.ProfileScreen })),
);
const RideDetailScreen = lazy(() =>
  import("./screens/RideDetailScreen").then((m) => ({ default: m.RideDetailScreen })),
);
const SettingsScreen = lazy(() =>
  import("./screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })),
);
const SupportScreen = lazy(() =>
  import("./screens/SupportScreen").then((m) => ({ default: m.SupportScreen })),
);
const PrivacyScreen = lazy(() =>
  import("./screens/legal/PrivacyScreen").then((m) => ({ default: m.PrivacyScreen })),
);
const TermsScreen = lazy(() =>
  import("./screens/legal/TermsScreen").then((m) => ({ default: m.TermsScreen })),
);

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
        background: "var(--brand-bg)",
      }}
    >
      <div style={{ fontSize: 48 }}>🔍</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--brand-text)" }}>
        Страница не найдена
      </div>
      <div style={{ fontSize: 14, color: "var(--brand-sub)", textAlign: "center" }}>
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
          color: "var(--brand-primary-ink)",
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
        background: "var(--brand-warn)",
        color: "var(--brand-primary-ink)",
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

function AutoOnboard() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/users/me", { method: "PATCH", body: JSON.stringify({ onboarded: true }) })
      .then(() => window.location.reload())
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: 16,
          padding: 24,
          background: "var(--brand-bg, #f4f5f4)",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--brand-danger)", textAlign: "center" }}>{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: "var(--brand-primary)",
            color: "var(--brand-primary-ink)",
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--brand-bg, #f4f5f4)",
      }}
    />
  );
}

const TAB_PATHS = new Set(["/", "/favorites", "/events", "/settings", "/settings/notifications"]);
// RidesScreen manages its own full-height layout — no bottom padding from main
const SELF_MANAGED_PATHS = new Set(["/", "/rides"]);

function AppShell() {
  const location = useLocation();
  const showTabs = TAB_PATHS.has(location.pathname);
  const selfManaged = SELF_MANAGED_PATHS.has(location.pathname);
  return (
    <>
      <a href="#main-content" className="skip-link">
        Перейти к основному контенту
      </a>
      <main id="main-content" style={showTabs && !selfManaged ? { paddingBottom: 64 } : undefined}>
        <Suspense
          fallback={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "60vh",
              }}
            />
          }
        >
          <Routes>
            <Route path="/" element={<RidesScreen />} />
            <Route path="/rides" element={<RidesScreen />} />
            <Route path="/map" element={<RidesScreen />} />
            <Route path="/rides/new" element={<CreateRideScreen />} />
            <Route path="/favorites" element={<FavoritesScreen />} />
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
        </Suspense>
      </main>
      <BottomTabBar />
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
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
          background: "var(--brand-bg, #f4f5f4)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header skeleton */}
        <div
          style={{
            padding: "16px 16px 8px",
            background: "var(--brand-surface, #fff)",
            borderBottom: "1px solid var(--brand-line, rgba(15,23,42,0.06))",
          }}
        >
          <div
            style={{
              width: 140,
              height: 20,
              borderRadius: 6,
              background: "var(--brand-line, #e8e9e8)",
            }}
          />
        </div>
        {/* Ride card skeletons */}
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {[88, 96, 80, 92].map((h, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              key={i}
              style={{
                height: h,
                borderRadius: 16,
                background: "var(--brand-surface, #fff)",
                border: "1px solid var(--brand-line, rgba(15,23,42,0.06))",
              }}
            />
          ))}
        </div>
        {/* BottomTabBar skeleton */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: 64,
            background: "var(--brand-surface, #fff)",
            borderTop: "1px solid var(--brand-line, rgba(15,23,42,0.06))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            padding: "0 16px",
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "var(--brand-line, #e8e9e8)",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (me.status === "banned") {
    return <BannedScreen reason={me.reason} bannedAt={me.banned_at} />;
  }

  if (me.status === "ok" && !me.user.onboarded) {
    return <AutoOnboard />;
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
        <p style={{ fontSize: 15, color: "var(--brand-danger)", margin: 0, textAlign: "center" }}>
          Ошибка подключения
        </p>
        <p style={{ fontSize: 13, color: "var(--brand-sub)", margin: 0, textAlign: "center" }}>
          {me.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: "var(--brand-primary)",
            color: "var(--brand-primary-ink)",
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
