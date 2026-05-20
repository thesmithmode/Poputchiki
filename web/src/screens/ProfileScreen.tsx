import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFavorites } from "../hooks/useFavorites";
import { useMe } from "../hooks/useMe";
import { useUser } from "../hooks/useUser";
import { ApiError } from "../lib/api";

interface Props {
  id: string;
}

type RoleView = "driver" | "passenger";

function monthsInService(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.floor(ms / (30 * 24 * 60 * 60 * 1000));
}

export function ProfileScreen({ id }: Props) {
  const navigate = useNavigate();
  const me = useMe();
  const { data: user, isLoading, isError, error } = useUser(id);
  const [roleView, setRoleView] = useState<RoleView>("passenger");
  const [tab, setTab] = useState<"schedule" | "reviews" | "rides">("schedule");

  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const isOwnProfile = me.status === "ok" && me.user.id === id;
  const showFavBtn = me.status === "ok" && !isOwnProfile;

  if (isLoading) {
    return (
      <div
        data-testid="profile-loading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "var(--brand-bg)",
        }}
      >
        <p style={{ color: "var(--brand-sub)", fontSize: 14 }}>Загрузка...</p>
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
          background: "var(--brand-bg)",
        }}
      >
        <p style={{ color: "var(--brand-danger)", fontSize: 14 }}>
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

  const ridesInRole =
    roleView === "driver" ? user.stats.rides_as_driver_completed : user.stats.rides_as_passenger;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
        color: "var(--brand-text)",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "var(--brand-surface)",
          borderBottom: "1px solid var(--brand-line)",
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
            color: "var(--brand-text)",
          }}
          aria-label="Назад"
        >
          ←
        </button>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--brand-text)",
            margin: 0,
            flex: 1,
          }}
        >
          Профиль
        </h1>
        {showFavBtn && (
          <button
            type="button"
            data-testid="fav-btn"
            onClick={() =>
              toggleFavorite(id, {
                display_name: user.display_name,
                tg_username: user.tg_username,
                avatar_url: user.avatar_url,
              })
            }
            style={{
              background: "none",
              border: "1px solid var(--brand-line)",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 18,
              cursor: "pointer",
            }}
            aria-label={isFavorite(id) ? "Убрать из избранного" : "Добавить в избранное"}
          >
            {isFavorite(id) ? "❤️" : "🤍"}
          </button>
        )}
        {isOwnProfile && (
          <button
            type="button"
            data-testid="edit-btn"
            onClick={() => navigate("/settings/profile")}
            style={{
              background: "none",
              border: "1px solid var(--brand-line)",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--brand-primary)",
              cursor: "pointer",
            }}
          >
            Редактировать
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
        {/* Hero */}
        <div
          style={{
            background: "var(--brand-surface)",
            padding: "24px 16px 20px",
            borderBottom: "1px solid var(--brand-line)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: user.avatar_url ? "transparent" : "var(--brand-surface-2)",
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

          <div
            style={{ fontSize: 22, fontWeight: 700, color: "var(--brand-text)", marginBottom: 4 }}
          >
            {user.display_name}
          </div>
          {user.tg_username && (
            <div style={{ fontSize: 13, color: "var(--brand-sub)", marginBottom: 12 }}>
              @{user.tg_username}
            </div>
          )}

          {/* Role view toggle */}
          <div
            data-testid="role-view-toggle"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              padding: 4,
              background: "var(--brand-surface-2)",
              borderRadius: 12,
              marginTop: 12,
            }}
          >
            {(["passenger", "driver"] as const).map((r) => {
              const active = roleView === r;
              return (
                <button
                  key={r}
                  type="button"
                  data-testid={`role-view-${r}`}
                  onClick={() => setRoleView(r)}
                  style={{
                    padding: "8px 4px",
                    borderRadius: 8,
                    border: "none",
                    background: active ? "var(--brand-primary)" : "transparent",
                    color: active ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {r === "passenger" ? "Как пассажир" : "Как водитель"}
                </button>
              );
            })}
          </div>

          {/* Stats for selected role */}
          <div
            data-testid="big-stats"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, marginTop: 16 }}
          >
            <BigStat value={user.stats.likes_received} label="лайки" />
            <BigStat
              value={
                roleView === "driver"
                  ? user.stats.driver_avg_stars != null
                    ? user.stats.driver_avg_stars.toFixed(1)
                    : "—"
                  : user.stats.passenger_avg_stars != null
                    ? user.stats.passenger_avg_stars.toFixed(1)
                    : "—"
              }
              label="рейтинг"
            />
            <BigStat value={ridesInRole} label="поездки" />
          </div>
          <div style={{ fontSize: 11, color: "var(--brand-sub)", marginTop: 8 }}>
            {roleView === "driver" ? "Статистика как водителя" : "Статистика как пассажира"}
          </div>
        </div>

        {/* Public stats 2x2 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            background: "var(--brand-line)",
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

        {isOwnProfile && (
          <div style={{ margin: "0 16px 12px" }}>
            <button
              type="button"
              data-testid="notifications-btn"
              onClick={() => navigate("/settings/notifications")}
              style={{
                width: "100%",
                padding: "14px 16px",
                background: "var(--brand-surface)",
                border: "1px solid var(--brand-line)",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 500,
                color: "var(--brand-text)",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>🔔 Настройки уведомлений</span>
              <span style={{ color: "var(--brand-sub)" }}>→</span>
            </button>
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            margin: "0 16px 12px",
            background: "var(--brand-surface-2)",
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
                background: tab === t ? "var(--brand-surface)" : "transparent",
                color: tab === t ? "var(--brand-text)" : "var(--brand-sub)",
                transition: "all 0.15s",
              }}
            >
              {t === "schedule" ? "Расписание" : t === "reviews" ? "Отзывы" : "Поездки"}
            </button>
          ))}
        </div>

        <div style={{ margin: "0 16px" }}>
          {tab === "schedule" && (
            <CardEmpty testId="tab-schedule" icon="📅" text="Нет регулярных поездок" />
          )}
          {tab === "reviews" && (
            <div
              data-testid="tab-reviews"
              style={{
                background: "var(--brand-surface)",
                borderRadius: 16,
                padding: 24,
                textAlign: "center",
                border: "1px solid var(--brand-line)",
              }}
            >
              {user.stats.reviews_count === 0 ? (
                <>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
                  <div style={{ fontSize: 14, color: "var(--brand-sub)" }}>Пока нет отзывов</div>
                </>
              ) : (
                <div>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      color: "var(--brand-text)",
                      marginBottom: 4,
                    }}
                  >
                    {roleView === "driver"
                      ? (user.stats.driver_avg_stars?.toFixed(1) ?? "—")
                      : (user.stats.passenger_avg_stars?.toFixed(1) ?? "—")}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--brand-sub)" }}>
                    {roleView === "driver"
                      ? user.stats.driver_reviews_count
                      : user.stats.passenger_reviews_count}{" "}
                    отзывов · {roleView === "driver" ? "как водитель" : "как пассажир"}
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "rides" && (
            <CardEmpty
              testId="tab-rides"
              icon="🚗"
              text={
                user.stats.rides_as_driver_completed + user.stats.rides_as_passenger === 0
                  ? "Нет поездок"
                  : `${user.stats.rides_as_driver_completed + user.stats.rides_as_passenger} поездок`
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BigStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ padding: "12px 0", borderRight: "1px solid var(--brand-line)" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--brand-text)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--brand-sub)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--brand-surface)", padding: "14px 16px" }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--brand-sub)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--brand-text)" }}>{value}</div>
    </div>
  );
}

function CardEmpty({ icon, text, testId }: { icon: string; text: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        background: "var(--brand-surface)",
        borderRadius: 16,
        padding: 24,
        textAlign: "center",
        border: "1px solid var(--brand-line)",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14, color: "var(--brand-sub)" }}>{text}</div>
    </div>
  );
}
