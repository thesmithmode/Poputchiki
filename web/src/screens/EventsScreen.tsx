import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type UserNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useRespondRideRequest,
} from "../hooks/useNotifications";

function getRequestId(n: UserNotification): string | null {
  const id = n.data?.request_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

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
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const respond = useRespondRideRequest();
  const [respondState, setRespondState] = useState<Record<string, "loading" | "done" | "error">>(
    {},
  );
  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function handleReadAll() {
    markAllRead.mutate();
  }

  function handleNotificationClick(n: UserNotification) {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.ride_id) navigate(`/rides/${n.ride_id}`);
  }

  function handleRespond(n: UserNotification, action: "accept" | "reject") {
    const requestId = getRequestId(n);
    if (!requestId) return;
    setRespondState((p) => ({ ...p, [n.id]: "loading" }));
    respond.mutate(
      { requestId, action },
      {
        onSuccess: () => {
          setRespondState((p) => ({ ...p, [n.id]: "done" }));
          if (!n.is_read) markRead.mutate(n.id);
        },
        onError: () => setRespondState((p) => ({ ...p, [n.id]: "error" })),
      },
    );
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
          {notifications.map((n) => {
            const requestId = getRequestId(n);
            const showActions = n.category === "ride_request" && requestId !== null;
            const state = respondState[n.id];
            return (
              <div
                key={n.id}
                data-testid={`notification-${n.id}-row`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  background: n.is_read ? "var(--brand-bg)" : "var(--brand-surface)",
                  borderBottom: "1px solid var(--brand-line)",
                  padding: "14px 16px",
                }}
              >
                <button
                  type="button"
                  data-testid={`notification-${n.id}`}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    width: "100%",
                    textAlign: "left",
                    padding: 0,
                    background: "transparent",
                    border: "none",
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
                {showActions && state !== "done" && (
                  <div style={{ display: "flex", gap: 8, paddingLeft: 22 }}>
                    <button
                      type="button"
                      data-testid={`notification-${n.id}-accept`}
                      disabled={state === "loading"}
                      onClick={() => handleRespond(n, "accept")}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        border: "none",
                        borderRadius: 8,
                        background: "var(--brand-primary)",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: state === "loading" ? "wait" : "pointer",
                        fontFamily: "inherit",
                        opacity: state === "loading" ? 0.6 : 1,
                      }}
                    >
                      Принять
                    </button>
                    <button
                      type="button"
                      data-testid={`notification-${n.id}-reject`}
                      disabled={state === "loading"}
                      onClick={() => handleRespond(n, "reject")}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        border: "1px solid var(--brand-line)",
                        borderRadius: 8,
                        background: "var(--brand-surface-2)",
                        color: "var(--brand-text)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: state === "loading" ? "wait" : "pointer",
                        fontFamily: "inherit",
                        opacity: state === "loading" ? 0.6 : 1,
                      }}
                    >
                      Отклонить
                    </button>
                  </div>
                )}
                {state === "done" && (
                  <div
                    style={{
                      paddingLeft: 22,
                      fontSize: 12,
                      color: "var(--brand-sub)",
                      fontStyle: "italic",
                    }}
                  >
                    Ответ отправлен
                  </div>
                )}
                {state === "error" && (
                  <div
                    style={{
                      paddingLeft: 22,
                      fontSize: 12,
                      color: "var(--brand-danger, #c0392b)",
                    }}
                  >
                    Ошибка — попробуйте ещё раз
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
