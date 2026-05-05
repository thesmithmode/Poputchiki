import { useNavigate } from "react-router-dom";
import { useRide } from "../hooks/useRide";
import { ApiError } from "../lib/api";

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

export function RideDetailScreen({ id }: Props) {
  const navigate = useNavigate();
  const { data: ride, isLoading, isError, error } = useRide(id);

  if (isLoading) {
    return (
      <div
        data-testid="detail-loading"
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
        data-testid="detail-error"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <p style={{ color: "#e74c3c", fontSize: 14 }}>
          {is404 ? "Поездка не найдена" : "Ошибка загрузки"}
        </p>
      </div>
    );
  }

  if (!ride) return null;

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
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "#15191f", margin: 0 }}>Поездка</h1>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "12px 16px 120px", overflowY: "auto" }}>
        {/* Map placeholder */}
        <div
          data-testid="map-placeholder"
          style={{
            height: 180,
            background: "#e8f4ea",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <span style={{ color: "#666", fontSize: 13 }}>Карта маршрута</span>
        </div>

        {/* Route + stats card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "#7c8694",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  marginBottom: 3,
                }}
              >
                От
              </div>
              <div style={{ fontSize: 14, color: "#15191f", fontWeight: 500 }}>
                {ride.from_label}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "#7c8694",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  marginBottom: 3,
                }}
              >
                До
              </div>
              <div style={{ fontSize: 14, color: "#15191f", fontWeight: 500 }}>{ride.to_label}</div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              paddingTop: 16,
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <Stat label="Отправление" value={departure.time} sub={departure.rel} />
            {ride.price_rub !== null ? (
              <Stat label="Цена" value={`${ride.price_rub} ₽`} sub="за место" />
            ) : (
              <Stat label="Цена" value="Бесплатно" />
            )}
            <Stat
              label="Свободно"
              value={`${seatsLeft} из ${ride.seats_total}`}
              sub="мест"
              highlight={seatsLeft === 0}
            />
            <Stat label="Тип" value="Разовая" />
          </div>
        </div>

        {/* Comment */}
        {ride.comment && (
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#7c8694",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 6,
              }}
            >
              Комментарий
            </div>
            <div style={{ fontSize: 14, color: "#15191f", lineHeight: 1.45 }}>{ride.comment}</div>
          </div>
        )}

        {/* Driver */}
        <div
          style={{
            fontSize: 13,
            color: "#7c8694",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            padding: "12px 4px 8px",
          }}
        >
          Водитель
        </div>
        <button
          type="button"
          data-testid="driver-card"
          onClick={() => navigate(`/users/${ride.driver.id}`)}
          style={{
            width: "100%",
            textAlign: "left",
            background: "#fff",
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
            border: "1px solid #e5e7eb",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "#e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              👤
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: "#15191f" }}>
                  {driverName}
                </span>
                {isNew(ride.driver.created_at) && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      background: "#e8f4ea",
                      color: "#047857",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    NEW
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: "#7c8694" }}>
                👍 {ride.driver.likes_received_count}
              </div>
            </div>
            <span style={{ color: "#7c8694" }}>→</span>
          </div>
        </button>

        {/* Passengers */}
        {ride.passengers.length > 0 && (
          <>
            <div
              style={{
                fontSize: 13,
                color: "#7c8694",
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
                background: "#fff",
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                marginBottom: 16,
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
                    padding: "12px 14px",
                    borderBottom: i === ride.passengers.length - 1 ? "none" : "1px solid #e5e7eb",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "#e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    👤
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#15191f" }}>
                      {p.first_name}
                      {p.last_name ? ` ${p.last_name[0]}.` : ""}
                    </div>
                    {p.likes_received_count > 0 && (
                      <div style={{ fontSize: 12, color: "#7c8694", marginTop: 2 }}>
                        👍 {p.likes_received_count}
                      </div>
                    )}
                  </div>
                  <span style={{ color: "#7c8694" }}>→</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom action bar */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid #e5e7eb",
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
            background: "#f0f1f3",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: "#333",
            textAlign: "center",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✉️ В Telegram
        </a>
        <button
          type="button"
          data-testid="respond-btn"
          onClick={() => console.log("respond", id)}
          style={{
            flex: 1.6,
            padding: "12px 16px",
            background: "#0ea5e9",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Откликнуться
        </button>
      </div>
    </div>
  );
}

function Stat({
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
          color: "#7c8694",
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
          color: highlight ? "#e54e5c" : "#15191f",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: "#7c8694", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
