import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";

interface TabItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  big?: boolean;
}

const TABS: TabItem[] = [
  { id: "feed", label: "Поездки", icon: "home", path: "/" },
  { id: "map", label: "Карта", icon: "map", path: "/map" },
  { id: "create", label: "", icon: "plus", path: "/rides/new", big: true },
  { id: "notif", label: "События", icon: "bell", path: "/settings/notifications" },
  { id: "me", label: "Профиль", icon: "user", path: "/settings" },
];

const SHOW_ON_PATHS = new Set(["/", "/map", "/favorites", "/settings", "/settings/notifications"]);

function getActiveId(pathname: string): string {
  if (pathname === "/") return "feed";
  if (pathname === "/map") return "map";
  if (pathname === "/settings/notifications") return "notif";
  if (pathname.startsWith("/settings")) return "me";
  if (pathname === "/favorites") return "feed";
  return "";
}

export function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  if (!SHOW_ON_PATHS.has(location.pathname)) return null;

  const activeId = getActiveId(location.pathname);
  const accent = "var(--brand-primary)";
  const fg = "var(--brand-sub)";
  const bg = "rgba(255,255,255,0.92)";

  return (
    <nav
      aria-label="Основная навигация"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        background: bg,
        borderTop: "1px solid rgba(15,23,42,0.06)",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        zIndex: 40,
        padding: "6px 6px 0",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {TABS.map((tab) => {
        const active = activeId === tab.id;

        if (tab.big) {
          return (
            <div
              key={tab.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <button
                type="button"
                aria-label="Создать поездку"
                onClick={() => navigate(tab.path)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: accent,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 6px 18px -4px rgba(45,90,61,0.4), 0 0 0 4px #fff",
                  marginTop: -10,
                }}
              >
                <Icon name="plus" size={22} stroke={2.4} />
              </button>
            </div>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            onClick={() => navigate(tab.path)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              color: active ? accent : fg,
              padding: 0,
              fontFamily: "inherit",
            }}
          >
            <Icon name={tab.icon} size={22} stroke={active ? 2 : 1.7} />
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 500, letterSpacing: 0.1 }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
