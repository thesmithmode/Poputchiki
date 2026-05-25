import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type UserNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useRespondRideRequest,
  useRespondSubscription,
} from "../hooks/useNotifications";

function getRequestId(n: UserNotification): string | null {
  const id = n.data?.request_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function getSubscriptionId(n: UserNotification): string | null {
  const id = n.data?.subscription_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function getString(n: UserNotification, key: string): string | null {
  const v = n.data?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function displayName(n: UserNotification): string {
  return (
    getString(n, "actor_name") ??
    getString(n, "passenger_name") ??
    getString(n, "driver_name") ??
    getString(n, "liker_name") ??
    getString(n, "reviewer_name") ??
    getString(n, "sender_name") ??
    "Пользователь"
  );
}

function actionText(n: UserNotification): string {
  const dest = getString(n, "destination") ?? getString(n, "ride_destination");
  switch (n.category) {
    case "ride_request":
      return dest
        ? `откликнулся(-ась) на Вашу поездку в ${dest}`
        : "откликнулся(-ась) на Вашу поездку";
    case "ride_request_accepted":
      return dest ? `принял Вашу заявку на поездку в ${dest}` : "принял Вашу заявку";
    case "ride_request_rejected":
      return dest ? `отклонил Вашу заявку на поездку в ${dest}` : "отклонил Вашу заявку";
    case "ride_request_cancelled":
      return dest ? `отменил заявку на поездку в ${dest}` : "отменил заявку на поездку";
    case "ride_cancelled":
      return "отменил поездку";
    case "ride_completed":
      return "завершил поездку";
    case "ride_changed":
      return "изменил параметры поездки";
    case "confirm_participation":
      return dest ? `подтвердите, что Вы ездили в ${dest}` : "подтвердите, что Вы ездили";
    case "participation_request":
      return "подтвердил Ваше участие в поездке";
    case "like_received":
      return "поставил(-а) Вам лайк";
    case "review_received":
      return "оставила отзыв 5★";
    case "ride_published":
      return dest ? `опубликовал поездку в ${dest}` : "опубликовал поездку";
    case "favorite_new_ride":
      return dest ? `опубликовал новую поездку в ${dest}` : "опубликовал новую поездку";
    case "support_reply":
      return "ответ от поддержки";
    case "system":
      return "Системное уведомление";
    case "template_subscription_request": {
      const dest = getString(n, "destination");
      return dest ? `хочет ездить с тобой регулярно в ${dest}` : "хочет ездить с тобой регулярно";
    }
    case "template_subscription_accepted": {
      const dest = getString(n, "destination");
      return dest
        ? `принял заявку на регулярные поездки в ${dest}`
        : "принял заявку на регулярные поездки";
    }
    case "template_subscription_rejected": {
      const dest = getString(n, "destination");
      return dest
        ? `отклонил заявку на регулярные поездки в ${dest}`
        : "отклонил заявку на регулярные поездки";
    }
    case "template_subscription_revoked":
      return "отменил подписку на маршрут";
    case "admin_review_cancellation_abuse":
      return "слишком много отмен — требуется проверка";
    case "welcome":
      return "Добро пожаловать в Попутчики Царёво!";
    default:
      return "новое уведомление";
  }
}

function isSystem(n: UserNotification): boolean {
  return n.category === "welcome" || n.category === "system" || n.category === "support_reply";
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
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "вчера";
  if (diffD < 7) return `${diffD} дня назад`;
  if (diffD < 14) return "неделю назад";
  return d.toLocaleDateString("ru-RU");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

const AVATAR_PALETTE = [
  { bg: "#7b6cd9", fg: "#fff" }, // фиолетовый
  { bg: "#3f7cd4", fg: "#fff" }, // синий
  { bg: "#9c4dd4", fg: "#fff" }, // пурпурный
  { bg: "#e07a3f", fg: "#fff" }, // оранжевый
  { bg: "#2d8a5a", fg: "#fff" }, // зелёный
  { bg: "#c75151", fg: "#fff" }, // красный
];

function avatarColor(seed: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (
    AVATAR_PALETTE[h % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0] ?? { bg: "#888", fg: "#fff" }
  );
}

function metaIcon(category: string): string {
  switch (category) {
    case "ride_request":
      return "○";
    case "confirm_participation":
      return "✓";
    case "like_received":
      return "👍";
    case "review_received":
      return "★";
    case "ride_published":
      return "♥";
    case "ride_request_accepted":
      return "✓";
    case "ride_request_rejected":
      return "✕";
    default:
      return "○";
  }
}

export function EventsScreen() {
  const navigate = useNavigate();
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const respond = useRespondRideRequest();
  const respondSub = useRespondSubscription();
  const [respondState, setRespondState] = useState<Record<string, "loading" | "done" | "error">>(
    {},
  );
  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const unread = notifications.filter((n) => !n.is_read || respondState[n.id]);
  const read = notifications.filter((n) => n.is_read && !respondState[n.id]);

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

  function handleRespondSub(n: UserNotification, action: "accept" | "reject") {
    const subscriptionId = getSubscriptionId(n);
    if (!subscriptionId) return;
    setRespondState((p) => ({ ...p, [n.id]: "loading" }));
    respondSub.mutate(
      { subscriptionId, action },
      {
        onSuccess: () => {
          setRespondState((p) => ({ ...p, [n.id]: "done" }));
          if (!n.is_read) markRead.mutate(n.id);
        },
        onError: () => setRespondState((p) => ({ ...p, [n.id]: "error" })),
      },
    );
  }

  function renderAvatar(n: UserNotification, size: number) {
    if (isSystem(n)) {
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            border: "1.5px solid var(--brand-line)",
            background: "transparent",
            flexShrink: 0,
          }}
        />
      );
    }
    const name = displayName(n);
    const { bg, fg } = avatarColor(name + n.id);
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: bg,
          color: fg,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.4),
          fontWeight: 700,
          letterSpacing: 0.2,
        }}
      >
        {initials(name)}
      </div>
    );
  }

  function renderMessage(n: UserNotification, opts: { bold: boolean }) {
    if (isSystem(n)) {
      return (
        <span
          style={{
            fontSize: 14,
            fontWeight: opts.bold ? 600 : 400,
            color: "var(--brand-text)",
          }}
        >
          {actionText(n)}
        </span>
      );
    }
    const name = displayName(n);
    return (
      <span style={{ fontSize: 14, color: "var(--brand-text)", lineHeight: 1.35 }}>
        <span style={{ fontWeight: opts.bold ? 700 : 600 }}>{name}</span>{" "}
        <span style={{ fontWeight: opts.bold ? 600 : 400 }}>{actionText(n)}</span>
      </span>
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
          justifyContent: "center",
          borderBottom: "1px solid var(--brand-line)",
          background: "var(--brand-surface)",
          padding: "14px 16px",
        }}
      >
        <h1
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--brand-text)",
            margin: 0,
          }}
        >
          События
        </h1>
        <button
          type="button"
          data-testid="events-settings-gear"
          onClick={() => navigate("/settings/notifications")}
          aria-label="Настройки уведомлений"
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "var(--brand-sub)",
            cursor: "pointer",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ⚙️
        </button>
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
        <div
          style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <h2
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--brand-text)",
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              События
            </h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleReadAll}
                style={{
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "var(--brand-primary)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Прочитать все
              </button>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--brand-sub)", marginTop: -8 }}>
            <span data-testid="events-unread-count">{unreadCount}</span>{" "}
            <span>{unreadCount === 1 ? "непрочитанное" : "непрочитанных"}</span>
          </div>

          {unread.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {unread.map((n) => {
                const requestId = getRequestId(n);
                const subscriptionId = getSubscriptionId(n);
                const showActions = n.category === "ride_request" && requestId !== null;
                const showSubActions =
                  n.category === "template_subscription_request" && subscriptionId !== null;
                const state = respondState[n.id];
                return (
                  <div
                    key={n.id}
                    data-testid={`notification-${n.id}-row`}
                    style={{
                      background: "var(--brand-surface)",
                      border: "1px solid var(--brand-line)",
                      borderRadius: 16,
                      padding: 14,
                      boxShadow: "0 1px 2px rgba(14,20,16,0.04)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
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
                      {renderAvatar(n, 40)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: 4 }}>{renderMessage(n, { bold: true })}</div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--brand-sub)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              width: 12,
                              height: 12,
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--brand-faint)",
                              fontSize: 11,
                            }}
                          >
                            {metaIcon(n.category)}
                          </span>
                          {formatTime(n.created_at)}
                        </div>
                      </div>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "var(--brand-primary)",
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    </button>
                    {showActions && state !== "done" && (
                      <div style={{ display: "flex", gap: 8, paddingLeft: 52 }}>
                        <button
                          type="button"
                          data-testid={`notification-${n.id}-accept`}
                          disabled={state === "loading"}
                          onClick={() => handleRespond(n, "accept")}
                          style={{
                            padding: "8px 18px",
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
                            padding: "8px 18px",
                            border: "1px solid var(--brand-line)",
                            borderRadius: 8,
                            background: "transparent",
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
                    {showSubActions && state !== "done" && (
                      <div style={{ display: "flex", gap: 8, paddingLeft: 52 }}>
                        <button
                          type="button"
                          data-testid={`notification-${n.id}-sub-accept`}
                          disabled={state === "loading"}
                          onClick={() => handleRespondSub(n, "accept")}
                          style={{
                            padding: "8px 18px",
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
                          data-testid={`notification-${n.id}-sub-reject`}
                          disabled={state === "loading"}
                          onClick={() => handleRespondSub(n, "reject")}
                          style={{
                            padding: "8px 18px",
                            border: "1px solid var(--brand-line)",
                            borderRadius: 8,
                            background: "transparent",
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
                    {n.category === "confirm_participation" && (
                      <div style={{ paddingLeft: 52 }}>
                        <button
                          type="button"
                          data-testid={`notification-${n.id}-confirm`}
                          onClick={() => handleNotificationClick(n)}
                          style={{
                            padding: "8px 18px",
                            border: "none",
                            borderRadius: 8,
                            background: "var(--brand-primary)",
                            color: "#fff",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          Подтвердить
                        </button>
                      </div>
                    )}
                    {state === "done" && (
                      <div
                        style={{
                          paddingLeft: 52,
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
                          paddingLeft: 52,
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

          {read.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {read.map((n) => {
                const requestId = getRequestId(n);
                const subscriptionId = getSubscriptionId(n);
                const showActions = n.category === "ride_request" && requestId !== null;
                const showSubActions =
                  n.category === "template_subscription_request" && subscriptionId !== null;
                const state = respondState[n.id];
                return (
                  <div
                    key={n.id}
                    data-testid={`notification-${n.id}-row`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: "10px 4px",
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
                      {renderAvatar(n, 36)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: 3 }}>{renderMessage(n, { bold: false })}</div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--brand-sub)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              width: 12,
                              height: 12,
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--brand-faint)",
                              fontSize: 11,
                            }}
                          >
                            {metaIcon(n.category)}
                          </span>
                          {formatTime(n.created_at)}
                        </div>
                      </div>
                    </button>
                    {showActions && state !== "done" && (
                      <div style={{ display: "flex", gap: 8, paddingLeft: 48 }}>
                        <button
                          type="button"
                          data-testid={`notification-${n.id}-accept`}
                          disabled={state === "loading"}
                          onClick={() => handleRespond(n, "accept")}
                          style={{
                            padding: "6px 14px",
                            border: "none",
                            borderRadius: 8,
                            background: "var(--brand-primary)",
                            color: "#fff",
                            fontSize: 12,
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
                            padding: "6px 14px",
                            border: "1px solid var(--brand-line)",
                            borderRadius: 8,
                            background: "transparent",
                            color: "var(--brand-text)",
                            fontSize: 12,
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
                    {showSubActions && state !== "done" && (
                      <div style={{ display: "flex", gap: 8, paddingLeft: 48 }}>
                        <button
                          type="button"
                          data-testid={`notification-${n.id}-sub-accept`}
                          disabled={state === "loading"}
                          onClick={() => handleRespondSub(n, "accept")}
                          style={{
                            padding: "6px 14px",
                            border: "none",
                            borderRadius: 8,
                            background: "var(--brand-primary)",
                            color: "#fff",
                            fontSize: 12,
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
                          data-testid={`notification-${n.id}-sub-reject`}
                          disabled={state === "loading"}
                          onClick={() => handleRespondSub(n, "reject")}
                          style={{
                            padding: "6px 14px",
                            border: "1px solid var(--brand-line)",
                            borderRadius: 8,
                            background: "transparent",
                            color: "var(--brand-text)",
                            fontSize: 12,
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
