import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { RouteBlock } from "../components/RouteBlock";
import { RouteMapLeaflet } from "../components/RouteMapLeaflet";
import { useMe } from "../hooks/useMe";
import { useRide } from "../hooks/useRide";
import { useTelegramBack } from "../hooks/useTelegramBack";
import { ApiError, apiFetch } from "../lib/api";
import { getTelegramWebApp } from "../lib/telegram";

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
type ActionStatus = "idle" | "loading" | "done" | "error";

export function RideDetailScreen({ id }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useTelegramBack(() => navigate(-1));
  const { data: ride, isLoading, isError, error } = useRide(id);
  const me = useMe();
  const [reqStatus, setReqStatus] = useState<RequestStatus>("idle");
  const [likeStatus, setLikeStatus] = useState<LikeStatus>("idle");
  const [actionStatus, setActionStatus] = useState<Record<string, ActionStatus>>({});

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
        <p style={{ color: "var(--brand-danger)", fontSize: 14 }}>
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
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { error?: string } | undefined;
        setReqStatus(body?.error === "no_seats" ? "full" : "duplicate");
      } else {
        setReqStatus("error");
      }
    }
  }

  async function handleRequestAction(reqId: string, action: "accept" | "reject") {
    setActionStatus((prev) => ({ ...prev, [reqId]: "loading" }));
    try {
      await apiFetch(`/ride-requests/${reqId}/${action}`, { method: "POST" });
      setActionStatus((prev) => ({ ...prev, [reqId]: "done" }));
      queryClient.invalidateQueries({ queryKey: ["ride", id] });
    } catch {
      setActionStatus((prev) => ({ ...prev, [reqId]: "error" }));
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

  function handleContactDriver() {
    if (!ride) return;
    const tg = getTelegramWebApp();
    const url = `tg://user?id=${ride.driver.tg_id}`;
    if (tg && (tg as unknown as { openLink?: (u: string) => void }).openLink) {
      (tg as unknown as { openLink: (u: string) => void }).openLink(url);
    } else {
      window.open(url, "_blank");
    }
  }

  const departure = formatDeparture(ride.departure_at);
  const seatsLeft = ride.seats_total - ride.seats_taken;
  const driverName = ride.driver.last_name
    ? `${ride.driver.first_name} ${ride.driver.last_name}`
    : ride.driver.first_name;

  // Кнопка записи на поездку (для пассажира)
  const serverRequestStatus = ride.my_request_status;
  const requestIsActive = serverRequestStatus !== null && serverRequestStatus !== "cancelled";
  const respondBtnDisabled = reqStatus === "loading" || requestIsActive;
  const respondBtnBg =
    serverRequestStatus === "accepted"
      ? "var(--brand-primary)"
      : requestIsActive || reqStatus === "sent"
        ? "var(--brand-primary-soft)"
        : "var(--brand-primary)";
  const respondBtnLabel =
    serverRequestStatus === "pending"
      ? "Заявка на рассмотрении"
      : serverRequestStatus === "accepted"
        ? "Вы в поездке!"
        : serverRequestStatus === "rejected"
          ? "Заявка отклонена"
          : serverRequestStatus === "cancelled"
            ? "Заявка отменена"
            : reqStatus === "sent"
              ? "Заявка отправлена"
              : reqStatus === "loading"
                ? "Отправляем..."
                : reqStatus === "full"
                  ? "Мест нет"
                  : reqStatus === "duplicate"
                    ? "Уже отправлено"
                    : reqStatus === "error"
                      ? "Ошибка, повторите"
                      : "Записаться";

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
          background: "var(--tab-bar-bg)",
          borderBottom: "1px solid var(--brand-line)",
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
            background: "var(--brand-surface-2)",
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
        {/* Route map */}
        <div data-testid="route-map" style={{ marginBottom: 12 }}>
          <RouteMapLeaflet
            fromLat={ride.from_lat}
            fromLng={ride.from_lng}
            toLat={ride.to_lat}
            toLng={ride.to_lng}
          />
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
            <StatBlock label="Тип" value={ride.template_id ? "Регулярная" : "Разовая"} />
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
                background: "var(--brand-primary-soft)",
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
              background:
                likeStatus === "liked" ? "var(--brand-primary)" : "var(--brand-surface-2)",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              color: likeStatus === "liked" ? "var(--brand-primary-ink)" : "var(--brand-text)",
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
                      background: "var(--brand-primary-soft)",
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

        {/* Pending requests — только для водителя */}
        {isOwnRide && ride.pending_requests.length > 0 && (
          <>
            <div
              style={{
                fontSize: 11,
                color: "var(--brand-warn)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                padding: "12px 4px 8px",
              }}
            >
              Заявки на поездку · {ride.pending_requests.length}
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
              {ride.pending_requests.map((pr, i) => {
                const st = actionStatus[pr.id] ?? "idle";
                return (
                  <div
                    key={pr.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 16px",
                      borderBottom:
                        i === ride.pending_requests.length - 1
                          ? "none"
                          : "1px solid var(--brand-border)",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "var(--brand-primary-soft)",
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
                        {pr.first_name}
                      </div>
                    </div>
                    {st === "done" ? (
                      <div style={{ fontSize: 12, color: "var(--brand-sub)" }}>Готово</div>
                    ) : st === "error" ? (
                      <div style={{ fontSize: 12, color: "var(--brand-danger)" }}>Ошибка</div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          disabled={st === "loading"}
                          onClick={() => handleRequestAction(pr.id, "accept")}
                          style={{
                            padding: "6px 12px",
                            background: "var(--brand-primary)",
                            color: "var(--brand-primary-ink)",
                            border: "none",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: st === "loading" ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                            opacity: st === "loading" ? 0.6 : 1,
                          }}
                        >
                          Принять
                        </button>
                        <button
                          type="button"
                          disabled={st === "loading"}
                          onClick={() => handleRequestAction(pr.id, "reject")}
                          style={{
                            padding: "6px 12px",
                            background: "var(--brand-surface-2, var(--brand-surface))",
                            color: "var(--brand-danger)",
                            border: "1px solid var(--brand-danger)",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: st === "loading" ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                            opacity: st === "loading" ? 0.6 : 1,
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
          </>
        )}
      </div>

      {/* Fixed bottom action bar — скрыт пока me не загрузился (иначе кнопки мигают) */}
      {me.status !== "loading" && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "12px 16px",
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
            background: "var(--tab-bar-bg)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderTop: "1px solid var(--brand-border)",
            display: "flex",
            gap: 8,
            zIndex: 30,
          }}
        >
          {!isOwnRide && (
            <button
              type="button"
              data-testid="telegram-link"
              onClick={handleContactDriver}
              style={{
                flex: 1,
                padding: "12px 16px",
                background: "var(--brand-surface-2)",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--brand-text)",
                textAlign: "center",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontFamily: "inherit",
              }}
            >
              <Icon name="tg" size={16} />
              Связаться
            </button>
          )}
          {!isOwnRide && (
            <button
              type="button"
              data-testid="respond-btn"
              disabled={respondBtnDisabled}
              onClick={handleRespond}
              style={{
                flex: 1.6,
                padding: "12px 16px",
                background: respondBtnBg,
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--brand-primary-ink)",
                cursor: respondBtnDisabled ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {respondBtnLabel}
            </button>
          )}
        </div>
      )}
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
          color: highlight ? "var(--brand-danger)" : "var(--brand-text)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--brand-sub)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
