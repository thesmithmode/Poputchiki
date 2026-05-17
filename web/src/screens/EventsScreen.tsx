import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { type UserNotification, useNotifications } from "../hooks/useNotifications";
import { apiFetch } from "../lib/api";

function categoryLabel(n: UserNotification): string {
  switch (n.category) {
    case "ride_request":
      return `Новая заявка от ${(n.data?.passenger_name as string | undefined) ?? "пассажира"}`;
    case "ride_request_accepted":
      return "Ваша заявка принята водителем";
    case "ride_request_rejected":
      return "Ваша заявка отклонена";
    case "ride_cancelled":
      return "Поездка отменена водителем";
    case "confirm_participation":
      return "Подтвердите участие в поездке";
    case "like_received":
      return "Вам поставили лайк";
    case "review_received":
      return "Вам оставили отзыв";
    default:
      return n.category;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  return d.toLocaleDateString("ru-RU");
}

export function EventsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useNotifications();
  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleReadAll() {
    await apiFetch("/notifications/read-all", { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  function handleNotificationClick(n: UserNotification) {
    if (n.ride_id) navigate(`/rides/${n.ride_id}`);
  }

  return (
    <div
      data-testid="events-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
        color: "var(--brand-text)",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: "1px solid var(--brand-line)",
          background: "var(--brand-surface)",
          padding: "12px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--brand-text)", margin: 0 }}>
            События
          </h1>
          {unreadCount > 0 && (
            <span
              style={{
                background: "var(--brand-danger, #c0392b)",
                color: "#fff",
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 700,
                padding: "1px 7px",
                lineHeight: "18px",
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleReadAll}
              style={{
                padding: "6px 10px",
                border: "none",
                background: "var(--brand-surface-2)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--brand-sub)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Прочитано
            </button>
          )}
          <button
            type="button"
            data-testid="events-settings-gear"
            onClick={() => navigate("/settings/notifications")}
            aria-label="Настройки уведомлений"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "none",
              background: "var(--brand-surface-2)",
              color: "var(--brand-text)",
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ⚙️
          </button>
        </div>
      </header>

      {isLoading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p style={{ color: "var(--brand-sub)", fontSize: 14 }}>Загрузка...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div
          style={{
            flex: 1,
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 48 }}>🔔</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--brand-text)" }}>
            Пока нет событий
          </div>
          <div style={{ fontSize: 13, color: "var(--brand-sub)", maxWidth: 280 }}>
            Здесь появятся запросы на поездку, лайки, отзывы и другие уведомления.
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              data-testid={`notification-${n.id}`}
              onClick={() => handleNotificationClick(n)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                width: "100%",
                textAlign: "left",
                padding: "14px 16px",
                background: n.is_read ? "var(--brand-bg)" : "var(--brand-surface)",
                border: "none",
                borderBottom: "1px solid var(--brand-line)",
                cursor: n.ride_id ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: n.is_read ? "transparent" : "var(--brand-primary)",
                  flexShrink: 0,
                  marginTop: 5,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: n.is_read ? 400 : 600,
                    color: "var(--brand-text)",
                    marginBottom: 4,
                  }}
                >
                  {categoryLabel(n)}
                </div>
                <div style={{ fontSize: 12, color: "var(--brand-sub)" }}>
                  {formatTime(n.created_at)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
