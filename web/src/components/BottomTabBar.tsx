import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";

interface TabItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

const TABS: TabItem[] = [
  { id: "feed", label: "Лента", icon: "list", path: "/" },
  { id: "map", label: "Карта", icon: "map", path: "/map" },
  { id: "notif", label: "События", icon: "bell", path: "/settings/notifications" },
  { id: "me", label: "Я", icon: "user", path: "/settings" },
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

  return (
    <>
      <button
        type="button"
        aria-label="Создать поездку"
        onClick={() => navigate("/rides/new")}
        style={{
          position: "fixed",
          bottom: 80,
          right: 16,
          width: 54,
          height: 54,
          borderRadius: 18,
          background: "var(--brand-primary)",
          color: "var(--brand-primary-ink, #fff)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 12px 30px -6px rgba(45,90,61,0.45), 0 0 0 1px rgba(0,0,0,0.04)",
          zIndex: 39,
          transition: "transform 0.08s",
        }}
      >
        <Icon name="plus" size={26} stroke={2.2} />
      </button>

      <nav
        aria-label="Основная навигация"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--brand-surface)",
          borderTop: "1px solid var(--brand-line)",
          display: "flex",
          alignItems: "stretch",
          zIndex: 40,
          paddingBottom: "env(safe-area-inset-bottom, 18px)",
        }}
      >
        {TABS.map((tab) => {
          const active = activeId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              onClick={() => navigate(tab.path)}
              style={{
                flex: 1,
                padding: "8px 0 4px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                color: active ? "var(--brand-primary)" : "var(--brand-sub)",
                fontFamily: "inherit",
              }}
            >
              <Icon name={tab.icon} size={22} stroke={active ? 2 : 1.7} />
              <span style={{ fontSize: 10.5, fontWeight: 600 }}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
