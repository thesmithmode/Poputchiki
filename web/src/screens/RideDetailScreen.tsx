import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { RouteBlock } from "../components/RouteBlock";
import { useMe } from "../hooks/useMe";
import { useRide } from "../hooks/useRide";
import { useTelegramBack } from "../hooks/useTelegramBack";
import { ApiError, apiFetch } from "../lib/api";

interface Props {
  id: string;
}

function formatDeparture(dateStr: string) {
  const date = new Date(dateStr);
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
  const rel = sameDay(date, today)
    ? "Сегодня"
    : sameDay(date, tomorrow)
      ? "Завтра"
      : date.toLocaleDateString("ru-RU");
  return { time, rel };
}

function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;
}

type RequestStatus = "idle" | "loading" | "sent" | "full" | "duplicate" | "error";
type LikeStatus = "idle" | "loading" | "liked" | "error";

export function RideDetailScreen({ id }: Props) {
  const navigate = useNavigate();
  useTelegramBack(() => navigate(-1));
  const { data: ride, isLoading, isError, error } = useRide(id);
  const me = useMe();
  const [reqStatus, setReqStatus] = useState<RequestStatus>("idle");
  const [likeStatus, setLikeStatus] = useState<LikeStatus>("idle");

  if (isLoading) {
    return (
      <div
        data-testid="detail-loading"
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
        data-testid="detail-error"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "var(--brand-bg)",
        }}
      >
        <p style={{ color: "#e54e5c", fontSize: 14 }}>
          {is404 ? "Поездка не найдена" : "Ошибка загрузки"}
        </p>
      </div>
    );
  }

  if (!ride) return null;

  const isOwnRide = me.status === "ok" && me.user.id === ride.driver.id;

  async function handleRespond() {
    setReqStatus("loading");
    try {
      await apiFetch(`/rides/${id}/request`, { method: "POST" });
      setReqStatus("sent");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { code?: string } | undefined;
        setReqStatus(body?.code === "no_seats" ? "full" : "duplicate");
      } else {
        setReqStatus("error");
      }
    }
  }

  async function handleLike() {
    setLikeStatus("loading");
    try {
      await apiFetch("/likes", {
        method: "POST",
        body: JSON.stringify({ ride_id: id, target_user_id: ride?.driver.id }),
      });
      setLikeStatus("liked");
    } catch {
      setLikeStatus("error");
    }
  }

  const departure = formatDeparture(ride.departure_at);
  const seatsLeft = ride.seats_total - ride.seats_taken;
  const driverName = ride.driver.last_name
    ? `${ride.driver.first_name} ${ride.driver.last_name}`
    : ride.driver.first_name;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
      }}
    >
      {/* Sticky header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
          background: "rgba(255,255,255,0.78)",
          borderBottom: "1px solid rgba(15,23,42,0.05)",
          padding: "10px 16px 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: "none",
            background: "#F1F4F8",
            color: "var(--brand-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Icon name="chevron-l" size={18} />
        </button>
        <h1
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "var(--brand-text)",
            margin: 0,
            letterSpacing: -0.2,
          }}
        >
          Поездка
        </h1>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, padding: "12px 16px 120px", overflowY: "auto" }}>
        {/* Map placeholder */}
        <div
          data-testid="map-placeholder"
          style={{
            height: 180,
            background: "#e8f0ea",
            borderRadius: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <span style={{ color: "var(--brand-sub)", fontSize: 13 }}>Карта маршрута</span>
        </div>

        {/* Route card */}
        <div
          style={{
            background: "var(--brand-surface)",
            borderRadius: 18,
            padding: 16,
            marginBottom: 12,
            boxShadow: "0 1px 2px rgba(20,30,50,0.04)",
          }}
        >
          <RouteBlock fromLabel={ride.from_label} toLabel={ride.to_label} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--brand-border)",
            }}
          >
            <StatBlock label="Отправление" value={departure.time} sub={departure.rel} />
            {ride.price_rub !== null ? (
              <StatBlock label="Цена" value={`${ride.price_rub} ₽`} sub="за место" />
            ) : (
              <StatBlock label="Цена" value="Бесплатно" />
            )}
            <StatBlock
              label="Свободно"
              value={`${seatsLeft} из ${ride.seats_total}`}
              sub="мест"
              highlight={seatsLeft === 0}
            />
            <StatBlock label="Тип" value="Разовая" />
          </div>
        </div>

        {/* Comment */}
        {ride.comment && (
          <div
            style={{
              background: "var(--brand-surface)",
              borderRadius: 18,
              padding: 16,
              marginBottom: 12,
              boxShadow: "0 1px 2px rgba(20,30,50,0.04)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--brand-sub)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 6,
              }}
            >
              Комментарий
            </div>
            <div style={{ fontSize: 14, color: "var(--brand-text)", lineHeight: 1.45 }}>
              {ride.comment}
            </div>
          </div>
        )}

        {/* Driver section label */}
        <div
          style={{
            fontSize: 11,
            color: "var(--brand-sub)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            padding: "12px 4px 8px",
          }}
        >
          Водитель
        </div>

        {/* Driver card */}
        <button
          type="button"
          data-testid="driver-card"
          onClick={() => navigate(`/users/${ride.driver.id}`)}
          style={{
            width: "100%",
            textAlign: "left",
            background: "var(--brand-surface)",
            borderRadius: 18,
            padding: 16,
            marginBottom: 12,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(20,30,50,0.04)",
            fontFamily: "inherit",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "#D8E6DC",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="user" size={24} style={{ color: "var(--brand-primary)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--brand-text)",
                  }}
                >
                  {driverName}
                </span>
                {isNew(ride.driver.created_at) && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      background: "rgba(45,90,61,0.1)",
                      color: "var(--brand-primary)",
                      padding: "2px 6px",
                      borderRadius: 6,
                    }}
                  >
                    новый сосед
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12.5,
                  color: "var(--brand-sub)",
                }}
              >
                <Icon name="thumb-fill" size={11} style={{ color: "var(--brand-primary)" }} />
                {ride.driver.likes_received_count}
              </div>
            </div>
            <Icon name="chevron-r" size={18} style={{ color: "var(--brand-sub)" }} />
          </div>
        </button>

        {/* Like driver */}
        {!isOwnRide && (
          <button
            type="button"
            data-testid="like-driver-btn"
            disabled={likeStatus !== "idle"}
            onClick={handleLike}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: likeStatus === "liked" ? "#22c55e" : "#F1F4F8",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              color: likeStatus === "liked" ? "#fff" : "var(--brand-text)",
              cursor: likeStatus !== "idle" ? "not-allowed" : "pointer",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontFamily: "inherit",
            }}
          >
            <Icon name="thumb" size={16} />
            {likeStatus === "liked"
              ? "Лайк поставлен!"
              : likeStatus === "loading"
                ? "..."
                : likeStatus === "error"
                  ? "Ошибка"
                  : "Поставить лайк водителю"}
          </button>
        )}

        {/* Passengers */}
        {ride.passengers.length > 0 && (
          <>
            <div
              style={{
                fontSize: 11,
                color: "var(--brand-sub)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                padding: "12px 4px 8px",
              }}
            >
              Едут с водителем · {ride.passengers.length}
            </div>
            <div
              style={{
                background: "var(--brand-surface)",
                borderRadius: 18,
                overflow: "hidden",
                marginBottom: 16,
                boxShadow: "0 1px 2px rgba(20,30,50,0.04)",
              }}
            >
              {ride.passengers.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => navigate(`/users/${p.id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom:
                      i === ride.passengers.length - 1 ? "none" : "1px solid var(--brand-border)",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "#D8E6DC",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="user" size={18} style={{ color: "var(--brand-primary)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-text)" }}>
                      {p.first_name}
                      {p.last_name ? ` ${p.last_name[0]}.` : ""}
                    </div>
                    {p.likes_received_count > 0 && (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontSize: 12,
                          color: "var(--brand-sub)",
                          marginTop: 2,
                        }}
                      >
                        <Icon
                          name="thumb-fill"
                          size={10}
                          style={{ color: "var(--brand-primary)" }}
                        />
                        {p.likes_received_count}
                      </div>
                    )}
                  </div>
                  <Icon name="chevron-r" size={16} style={{ color: "var(--brand-sub)" }} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Fixed bottom action bar */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid var(--brand-border)",
          display: "flex",
          gap: 8,
          zIndex: 30,
        }}
      >
        <a
          href={`tg://user?id=${ride.driver.tg_id}`}
          data-testid="telegram-link"
          style={{
            flex: 1,
            padding: "12px 16px",
            background: "#F1F4F8",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--brand-text)",
            textAlign: "center",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Icon name="tg" size={16} />В Telegram
        </a>
        {!isOwnRide && (
          <button
            type="button"
            data-testid="respond-btn"
            disabled={reqStatus !== "idle"}
            onClick={handleRespond}
            style={{
              flex: 1.6,
              padding: "12px 16px",
              background:
                reqStatus === "sent"
                  ? "#22c55e"
                  : reqStatus !== "idle"
                    ? "#93c5fd"
                    : "var(--brand-primary)",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              cursor: reqStatus !== "idle" ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {reqStatus === "sent"
              ? "Заявка отправлена"
              : reqStatus === "loading"
                ? "Отправляем..."
                : reqStatus === "full"
                  ? "Мест нет"
                  : reqStatus === "duplicate"
                    ? "Уже отправлено"
                    : reqStatus === "error"
                      ? "Ошибка, повторите"
                      : "Откликнуться"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  sub,
  highlight,
}: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--brand-sub)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: highlight ? "#e54e5c" : "var(--brand-text)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--brand-sub)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
