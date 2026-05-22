import { useLocation, useNavigate } from "react-router-dom";
import { useRolePreference } from "../hooks/useRolePreference";
import { useUnreadCount } from "../hooks/useUnreadCount";
import { Icon } from "./Icon";

interface TabItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  isFab?: boolean;
}

const SHOW_ON_PATHS = new Set([
  "/",
  "/rides",
  "/map",
  "/presets",
  "/events",
  "/settings",
  "/settings/notifications",
]);

function getActiveId(pathname: string): string {
  if (pathname === "/" || pathname === "/rides") return "feed";
  if (pathname === "/map") return "map";
  if (pathname === "/events") return "notif";
  if (pathname.startsWith("/settings")) return "me";
  if (pathname === "/presets") return "me";
  return "";
}

export function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useRolePreference();
  const unreadCount = useUnreadCount();

  if (!SHOW_ON_PATHS.has(location.pathname)) return null;

  const activeId = getActiveId(location.pathname);

  const TABS: TabItem[] = [
    { id: "feed", label: "Лента", icon: "home", path: "/" },
    { id: "map", label: "Карта", icon: "map", path: "/map" },
    ...(role === "driver"
      ? [{ id: "create", label: "", icon: "plus", path: "/rides/new", isFab: true } as TabItem]
      : []),
    { id: "notif", label: "События", icon: "bell", path: "/events" },
    { id: "me", label: "Я", icon: "user", path: "/settings" },
  ];

  return (
    <nav
      aria-label="Основная навигация"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "calc(56px + env(safe-area-inset-bottom, 0px))",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        background: "var(--tab-bar-bg, rgba(255,255,255,0.92))",
        borderTop: "1px solid var(--tab-bar-border, rgba(15,23,42,0.06))",
        display: "grid",
        gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
        alignItems: "center",
        zIndex: 40,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {TABS.map((tab) => {
        const active = activeId === tab.id;

        if (tab.isFab) {
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
                  background: "var(--brand-primary)",
                  color: "var(--brand-primary-ink, #fff)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: -10,
                  boxShadow: "var(--shadow-fab)",
                  transition: "transform 0.08s",
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
              padding: "8px 0 4px",
              color: active ? "var(--brand-primary)" : "var(--brand-sub)",
              fontFamily: "inherit",
            }}
          >
            <div style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={tab.icon} size={22} stroke={active ? 2 : 1.7} />
              {tab.id === "notif" && unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -6,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: "var(--brand-danger, #e53e3e)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 3px",
                    lineHeight: 1,
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 500, letterSpacing: 0.1 }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
