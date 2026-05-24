import { QueryClient, QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
const BannedScreen = lazy(() =>
  import("./components/BannedScreen").then((m) => ({ default: m.BannedScreen })),
);
const BottomTabBar = lazy(() =>
  import("./components/BottomTabBar").then((m) => ({ default: m.BottomTabBar })),
);
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
const FilterPresetsScreen = lazy(() =>
  import("./screens/FilterPresetsScreen").then((m) => ({ default: m.FilterPresetsScreen })),
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

const TAB_PATHS = new Set([
  "/",
  "/map",
  "/presets",
  "/events",
  "/settings",
  "/settings/notifications",
]);
// RidesScreen manages its own full-height layout — no bottom padding from main
const SELF_MANAGED_PATHS = new Set(["/", "/rides", "/map"]);

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
            <Route path="/presets" element={<FilterPresetsScreen />} />
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
      <Suspense fallback={null}>
        <BottomTabBar />
      </Suspense>
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60_000,
      networkMode: "offlineFirst",
    },
  },
});

const CACHE_KEY = "pp_qc_v1";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

// Восстанавливаем дегидрированный кэш из localStorage при старте
try {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw) {
    const { ts, state } = JSON.parse(raw) as { ts: number; state: unknown };
    if (Date.now() - ts < CACHE_MAX_AGE) hydrate(queryClient, state);
  }
} catch {}

// Сохраняем кэш в localStorage каждые 3 сек через throttle
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
queryClient.getQueryCache().subscribe(() => {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), state: dehydrate(queryClient) }),
      );
    } catch {}
  }, 3000);
});

function AppRoutes() {
  const me = useMe();

  if (me.status === "loading") {
    const phaseConfig = {
      init: { label: "Запуск приложения…", pct: 15 },
      auth: { label: "Выполняется вход…", pct: 50 },
      profile: { label: "Загрузка профиля…", pct: 80 },
      done: { label: "Готово!", pct: 100 },
    };
    const { label, pct } = phaseConfig[me.phase];
    return (
      <div
        style={{
          background: "var(--brand-bg, #f4f5f4)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: "0 40px",
        }}
      >
        {/* Logo / app name */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "var(--brand-primary, #2d5a3d)",
            letterSpacing: "-0.02em",
            fontFamily: "inherit",
          }}
        >
          Попутчики
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: "100%",
            maxWidth: 280,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              width: "100%",
              height: 4,
              borderRadius: 2,
              background: "var(--brand-line, rgba(15,23,42,0.1))",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                borderRadius: 2,
                background: "var(--brand-primary, #2d5a3d)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--brand-sub, #6b7a6e)",
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            {label}
          </div>
        </div>
      </div>
    );
  }

  if (me.status === "banned") {
    return (
      <Suspense fallback={null}>
        <BannedScreen reason={me.reason} bannedAt={me.banned_at} />
      </Suspense>
    );
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

function usePrefetchRides() {
  useEffect(() => {
    // Prefetch с ключом идентичным useRides("24h", null, null).
    // queryFn вычисляет даты в момент запроса — аналогично useRides.
    const now = new Date();
    const fromAt = now.toISOString();
    const toAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
    queryClient.prefetchQuery({
      queryKey: ["rides", "list", "24h", null, null],
      queryFn: () =>
        import("./lib/api").then(({ apiFetch }) =>
          apiFetch(`/rides?fromAt=${encodeURIComponent(fromAt)}&toAt=${encodeURIComponent(toAt)}`),
        ),
      staleTime: 20_000,
    });
  }, []);
}

function usePrefetchScreens() {
  useEffect(() => {
    const timer = setTimeout(() => {
      // Prefetch all lazy screens in background after first render
      // so subsequent navigation feels instant
      import("./screens/ProfileScreen");
      import("./screens/CreateRideScreen");
      import("./screens/MyRidesScreen");
      import("./screens/RideDetailScreen");
      import("./screens/SettingsScreen");
      import("./screens/EditProfileScreen");
      import("./screens/FilterPresetsScreen");
      import("./screens/EventsScreen");
      import("./screens/NotificationPreferencesScreen");
      import("./screens/AdminScreen");
    }, 1500);
    return () => clearTimeout(timer);
  }, []);
}

export function App() {
  usePrefetchRides();
  usePrefetchScreens();
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
