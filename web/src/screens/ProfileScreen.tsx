import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMe } from "../hooks/useMe";
import { useUser } from "../hooks/useUser";
import { ApiError } from "../lib/api";

interface Props {
  id: string;
}

function monthsInService(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.floor(ms / (30 * 24 * 60 * 60 * 1000));
}

export function ProfileScreen({ id }: Props) {
  const navigate = useNavigate();
  const me = useMe();
  const { data: user, isLoading, isError, error } = useUser(id);
  const [tab, setTab] = useState<"schedule" | "reviews" | "rides">("schedule");

  const isOwnProfile = me.status === "ok" && me.user.id === id;

  if (isLoading) {
    return (
      <div
        data-testid="profile-loading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <p style={{ color: "#666", fontSize: 14 }}>Загрузка...</p>
      </div>
    );
  }

  if (isError) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <div
        data-testid="profile-error"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <p style={{ color: "#e74c3c", fontSize: 14 }}>
          {is404 ? "Пользователь не найден" : "Ошибка загрузки"}
        </p>
      </div>
    );
  }

  if (!user) return null;

  const months = monthsInService(user.created_at);
  const completionPct =
    user.stats.rides_as_driver_completed + user.stats.rides_as_passenger > 0
      ? Math.round(
          (user.stats.rides_as_driver_completed /
            Math.max(user.stats.rides_as_driver_completed + user.stats.rides_as_passenger, 1)) *
            100,
        )
      : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#f8f9fa",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            padding: 4,
            color: "#333",
          }}
          aria-label="Назад"
        >
          ←
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "#15191f", margin: 0, flex: 1 }}>
          Профиль
        </h1>
        {isOwnProfile && (
          <button
            type="button"
            data-testid="edit-btn"
            onClick={() => navigate("/settings/profile")}
            style={{
              background: "none",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              color: "#0ea5e9",
              cursor: "pointer",
            }}
          >
            Редактировать
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
        {/* Hero card */}
        <div
          style={{
            background: "#fff",
            padding: "24px 16px 20px",
            borderBottom: "1px solid #e5e7eb",
            textAlign: "center",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: user.avatar_url ? "transparent" : "#e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              margin: "0 auto 12px",
              overflow: "hidden",
            }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "👤"
            )}
          </div>

          <div style={{ fontSize: 22, fontWeight: 700, color: "#15191f", marginBottom: 4 }}>
            {user.display_name}
          </div>
          {user.tg_username && (
            <div style={{ fontSize: 13, color: "#7c8694", marginBottom: 12 }}>
              @{user.tg_username}
            </div>
          )}

          {/* 3 big stats */}
          <div
            data-testid="big-stats"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, marginTop: 16 }}
          >
            <BigStat value={user.stats.likes_received} label="лайки" />
            <BigStat
              value={user.stats.avg_stars !== null ? user.stats.avg_stars.toFixed(1) : "—"}
              label="рейтинг"
            />
            <BigStat
              value={user.stats.rides_as_driver_completed + user.stats.rides_as_passenger}
              label="поездки"
            />
          </div>
        </div>

        {/* Public stats 2x2 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            background: "#e5e7eb",
            margin: "12px 16px",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <MiniStat label="% состоялось" value={`${completionPct}%`} />
          <MiniStat label="в сервисе" value={`${months} мес.`} />
          <MiniStat label="как водитель" value={String(user.stats.rides_as_driver_completed)} />
          <MiniStat label="как пассажир" value={String(user.stats.rides_as_passenger)} />
        </div>

        {/* Own profile settings */}
        {isOwnProfile && (
          <div style={{ margin: "0 16px 12px" }}>
            <button
              type="button"
              data-testid="notifications-btn"
              onClick={() => navigate("/settings/notifications")}
              style={{
                width: "100%",
                padding: "14px 16px",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 500,
                color: "#15191f",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>🔔 Настройки уведомлений</span>
              <span style={{ color: "#7c8694" }}>→</span>
            </button>
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            margin: "0 16px 12px",
            background: "#f0f1f3",
            borderRadius: 10,
            padding: 3,
          }}
        >
          {(["schedule", "reviews", "rides"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "8px 4px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? "#15191f" : "#7c8694",
                transition: "all 0.15s",
              }}
            >
              {t === "schedule" ? "Расписание" : t === "reviews" ? "Отзывы" : "Поездки"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ margin: "0 16px" }}>
          {tab === "schedule" && (
            <div
              data-testid="tab-schedule"
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 24,
                textAlign: "center",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
              <div style={{ fontSize: 14, color: "#7c8694" }}>Нет регулярных поездок</div>
            </div>
          )}
          {tab === "reviews" && (
            <div
              data-testid="tab-reviews"
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 24,
                textAlign: "center",
                border: "1px solid #e5e7eb",
              }}
            >
              {user.stats.reviews_count === 0 ? (
                <>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
                  <div style={{ fontSize: 14, color: "#7c8694" }}>Пока нет отзывов</div>
                </>
              ) : (
                <div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: "#15191f", marginBottom: 4 }}>
                    {user.stats.avg_stars?.toFixed(1) ?? "—"}
                  </div>
                  <div style={{ fontSize: 13, color: "#7c8694" }}>
                    {user.stats.reviews_count} отзывов
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "rides" && (
            <div
              data-testid="tab-rides"
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 24,
                textAlign: "center",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🚗</div>
              <div style={{ fontSize: 14, color: "#7c8694" }}>
                {user.stats.rides_as_driver_completed + user.stats.rides_as_passenger === 0
                  ? "Нет поездок"
                  : `${user.stats.rides_as_driver_completed + user.stats.rides_as_passenger} поездок`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BigStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ padding: "12px 0", borderRight: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#15191f" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#7c8694", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#fff", padding: "14px 16px" }}>
      <div
        style={{
          fontSize: 11,
          color: "#7c8694",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#15191f" }}>{value}</div>
    </div>
  );
}
