import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { RouteBlock } from "../components/RouteBlock";
import { RouteMapLeaflet } from "../components/RouteMapLeaflet";
import { useMe } from "../hooks/useMe";
import type { RideDetail } from "../hooks/useRide";
import { useRide } from "../hooks/useRide";
import { useTelegramBack } from "../hooks/useTelegramBack";
import {
  useDriverSubscriptions,
  useSubscribeMutation,
  useSubscriptionActionMutation,
} from "../hooks/useTemplateSubscription";
import { ApiError, apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
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
type LikeStatus = "idle" | "loading" | "liked" | "error" | "not_confirmed";
type ActionStatus = "idle" | "loading" | "done" | "error";
type CancelStatus = "idle" | "loading" | "done" | "error";
type EditStatus = "idle" | "loading" | "done" | "error";

export function RideDetailScreen({ id }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useTelegramBack(() => navigate(-1));
  const { data: ride, isLoading, isError, error } = useRide(id);
  const me = useMe();
  const [reqStatus, setReqStatus] = useState<RequestStatus>("idle");
  const [likeStatus, setLikeStatus] = useState<LikeStatus>("idle");
  const [actionStatus, setActionStatus] = useState<Record<string, ActionStatus>>({});
  const [cancelReqStatus, setCancelReqStatus] = useState<CancelStatus>("idle");
  const [cancelRideStatus, setCancelRideStatus] = useState<CancelStatus>("idle");
  const [completeRideStatus, setCompleteRideStatus] = useState<CancelStatus>("idle");
  const [showEditForm, setShowEditForm] = useState(false);
  const [editStatus, setEditStatus] = useState<EditStatus>("idle");
  const [editSeats, setEditSeats] = useState<string>("");
  const [editPrice, setEditPrice] = useState<string>("");
  const [editComment, setEditComment] = useState<string>("");
  const [showJoinSheet, setShowJoinSheet] = useState(false);
  const [joinStep, setJoinStep] = useState<"choice" | "subscription">("choice");
  const [subActiveTo, setSubActiveTo] = useState<string>("");
  const [subMessage, setSubMessage] = useState<string>("");

  /*
   * Optimistic UI для двух самых частых действий на экране:
   * - respondMutation (пассажир «откликнуться»): сразу красит карточку
   *   как «заявка отправлена», на ошибку откатывает.
   * - requestActionMutation (driver accept/reject): мгновенно убирает
   *   запрос из pending_requests, на accept добавляет в passengers
   *   placeholder из данных pending_requests.
   *
   * Остальные действия (cancel/complete/edit/like/cancelRequest) пока
   * остаются с invalidate-only — у них меньше частота кликов и
   * destructive-confirm-диалог уже маскирует задержку сети.
   *
   * useMutation вызовы ОБЯЗАТЕЛЬНО до early-return по isLoading/isError —
   * Rules of Hooks: число хуков должно быть стабильным между рендерами.
   */
  const rideKey = queryKeys.ride.detail(id);

  const templateId = ride?.template_id ?? null;
  const subscribeMutation = useSubscribeMutation(id, templateId ?? "");
  const subActionMutation = useSubscriptionActionMutation(id);
  const isDriver = me.status === "ok" && ride?.driver_id === me.user.id;
  const { data: driverSubs } = useDriverSubscriptions(isDriver);

  const pendingDriverSubs =
    driverSubs?.filter((s) => s.template_id === templateId && s.status === "pending") ?? [];
  const acceptedDriverSubs =
    driverSubs?.filter((s) => s.template_id === templateId && s.status === "accepted") ?? [];

  const respondMutation = useMutation({
    mutationFn: () => apiFetch(`/rides/${id}/request`, { method: "POST" }),
    onMutate: async () => {
      setReqStatus("loading");
      await queryClient.cancelQueries({ queryKey: rideKey });
      const previous = queryClient.getQueryData<RideDetail>(rideKey);
      if (previous) {
        queryClient.setQueryData<RideDetail>(rideKey, {
          ...previous,
          my_request_status: "pending",
        });
      }
      return { previous };
    },
    onSuccess: () => {
      setReqStatus("sent");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(rideKey, ctx.previous);
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { error?: string } | undefined;
        setReqStatus(body?.error === "no_seats" ? "full" : "duplicate");
      } else {
        setReqStatus("error");
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: rideKey });
    },
  });

  const requestActionMutation = useMutation({
    mutationFn: ({ reqId, action }: { reqId: string; action: "accept" | "reject" }) =>
      apiFetch(`/ride-requests/${reqId}/${action}`, { method: "POST" }),
    onMutate: async ({ reqId, action }) => {
      setActionStatus((prev) => ({ ...prev, [reqId]: "loading" }));
      await queryClient.cancelQueries({ queryKey: rideKey });
      const previous = queryClient.getQueryData<RideDetail>(rideKey);
      if (previous) {
        const pending = previous.pending_requests.find((r) => r.id === reqId);
        const nextRequests = previous.pending_requests.filter((r) => r.id !== reqId);
        const next: RideDetail = {
          ...previous,
          pending_requests: nextRequests,
          // accept — добавляем placeholder-пассажира из данных pending request
          // (поля likes_received_count/last_name отсутствуют в pending_requests,
          // ставим дефолты — invalidate подтянет реальные).
          passengers:
            action === "accept" && pending
              ? [
                  ...previous.passengers,
                  {
                    id: pending.passenger_id,
                    first_name: pending.first_name,
                    last_name: null,
                    tg_id: pending.tg_id,
                    likes_received_count: 0,
                  },
                ]
              : previous.passengers,
        };
        queryClient.setQueryData<RideDetail>(rideKey, next);
      }
      return { previous };
    },
    onSuccess: (_data, { reqId }) => {
      setActionStatus((prev) => ({ ...prev, [reqId]: "done" }));
      // Драйверская карточка уведомления становится прочитанной целиком.
      apiFetch("/notifications/read-all", { method: "POST" })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        })
        .catch(() => {});
    },
    onError: (_err, { reqId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(rideKey, ctx.previous);
      setActionStatus((prev) => ({ ...prev, [reqId]: "error" }));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: rideKey });
    },
  });

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

  function handleRespond() {
    if (templateId && !requestIsActive && !ride?.my_subscription_id) {
      setJoinStep("choice");
      setShowJoinSheet(true);
    } else {
      respondMutation.mutate();
    }
  }

  function handleRequestAction(reqId: string, action: "accept" | "reject") {
    requestActionMutation.mutate({ reqId, action });
  }

  async function handleLike() {
    setLikeStatus("loading");
    try {
      await apiFetch("/likes", {
        method: "POST",
        body: JSON.stringify({ ride_id: id, target_user_id: ride?.driver.id }),
      });
      setLikeStatus("liked");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setLikeStatus("not_confirmed");
      } else {
        setLikeStatus("error");
      }
    }
  }

  async function handleCancelRequest() {
    if (!ride?.my_request_id) return;
    const tg = getTelegramWebApp();
    const wa = tg as unknown as
      | { showConfirm?: (msg: string, cb: (ok: boolean) => void) => void }
      | undefined;
    const confirmed = await new Promise<boolean>((resolve) => {
      if (wa?.showConfirm) {
        wa.showConfirm("Отозвать заявку на поездку?", resolve);
      } else {
        resolve(window.confirm("Отозвать заявку на поездку?"));
      }
    });
    if (!confirmed) return;
    setCancelReqStatus("loading");
    try {
      await apiFetch(`/ride-requests/${ride.my_request_id}/cancel`, { method: "POST" });
      setCancelReqStatus("done");
      queryClient.invalidateQueries({ queryKey: queryKeys.ride.detail(id) });
    } catch {
      setCancelReqStatus("error");
    }
  }

  async function handleCancelRide() {
    const tg = getTelegramWebApp();
    const wa = tg as unknown as
      | { showConfirm?: (msg: string, cb: (ok: boolean) => void) => void }
      | undefined;
    const confirmed = await new Promise<boolean>((resolve) => {
      if (wa?.showConfirm) {
        wa.showConfirm("Отменить поездку? Все пассажиры получат уведомление.", resolve);
      } else {
        resolve(window.confirm("Отменить поездку? Все пассажиры получат уведомление."));
      }
    });
    if (!confirmed) return;
    setCancelRideStatus("loading");
    try {
      await apiFetch(`/rides/${id}/cancel`, { method: "PATCH" });
      setCancelRideStatus("done");
      queryClient.invalidateQueries({ queryKey: queryKeys.ride.detail(id) });
    } catch {
      setCancelRideStatus("error");
    }
  }

  async function handleCompleteRide() {
    const tg = getTelegramWebApp();
    const wa = tg as unknown as
      | { showConfirm?: (msg: string, cb: (ok: boolean) => void) => void }
      | undefined;
    const confirmed = await new Promise<boolean>((resolve) => {
      if (wa?.showConfirm) {
        wa.showConfirm("Завершить поездку? Пассажиры получат уведомление.", resolve);
      } else {
        resolve(window.confirm("Завершить поездку? Пассажиры получат уведомление."));
      }
    });
    if (!confirmed) return;
    setCompleteRideStatus("loading");
    try {
      await apiFetch(`/rides/${id}/complete`, { method: "POST" });
      setCompleteRideStatus("done");
      queryClient.invalidateQueries({ queryKey: queryKeys.ride.detail(id) });
    } catch {
      setCompleteRideStatus("error");
    }
  }

  function handleOpenEdit() {
    if (!ride) return;
    setEditSeats(String(ride.seats_total));
    setEditPrice(ride.price_rub !== null ? String(ride.price_rub) : "");
    setEditComment(ride.comment ?? "");
    setEditStatus("idle");
    setShowEditForm(true);
  }

  async function handleSaveEdit() {
    if (!ride) return;
    const patch: Record<string, unknown> = {};
    const seats = Number.parseInt(editSeats, 10);
    if (!Number.isNaN(seats) && seats !== ride.seats_total) patch.seats_total = seats;
    const price = editPrice === "" ? null : Number.parseInt(editPrice, 10);
    if (price !== ride.price_rub) patch.price_rub = price;
    const comment = editComment.trim() || null;
    if (comment !== (ride.comment ?? null)) patch.comment = comment;
    if (Object.keys(patch).length === 0) {
      setShowEditForm(false);
      return;
    }
    setEditStatus("loading");
    try {
      await apiFetch(`/rides/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setEditStatus("done");
      setShowEditForm(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.ride.detail(id) });
    } catch {
      setEditStatus("error");
    }
  }

  function handleContactDriver() {
    if (!ride) return;
    const tg = getTelegramWebApp();
    const wa = tg as unknown as {
      openTelegramLink?: (u: string) => void;
      openLink?: (u: string) => void;
    };
    const username = (ride.driver as { tg_username?: string }).tg_username;
    if (username) {
      const url = `https://t.me/${username}`;
      if (wa.openTelegramLink) {
        wa.openTelegramLink(url);
      } else {
        window.open(url, "_blank");
      }
    } else {
      const url = `tg://user?id=${ride.driver.tg_id}`;
      if (wa.openLink) {
        wa.openLink(url);
      } else {
        window.open(url, "_blank");
      }
    }
  }

  async function handleSubscribe() {
    if (!templateId) return;
    await subscribeMutation.mutateAsync({
      activeTo: subActiveTo || null,
      ...(subMessage ? { message: subMessage } : {}),
    });
    setShowJoinSheet(false);
    setSubActiveTo("");
    setSubMessage("");
  }

  async function handleCancelSubscription() {
    if (!ride?.my_subscription_id) return;
    const tg = getTelegramWebApp();
    const wa = tg as unknown as {
      showConfirm?: (m: string, cb: (ok: boolean) => void) => void;
    };
    const confirmed = await new Promise<boolean>((resolve) => {
      if (wa?.showConfirm) wa.showConfirm("Отписаться от регулярных поездок?", resolve);
      else resolve(window.confirm("Отписаться от регулярных поездок?"));
    });
    if (!confirmed) return;
    subActionMutation.mutate({ subId: ride.my_subscription_id as string, action: "cancel" });
  }

  async function handleRevokeSubscription(subId: string) {
    const tg = getTelegramWebApp();
    const wa = tg as unknown as {
      showConfirm?: (m: string, cb: (ok: boolean) => void) => void;
    };
    const confirmed = await new Promise<boolean>((resolve) => {
      if (wa?.showConfirm)
        wa.showConfirm("Убрать пассажира с маршрута? Все будущие поездки будут отменены.", resolve);
      else
        resolve(window.confirm("Убрать пассажира с маршрута? Все будущие поездки будут отменены."));
    });
    if (!confirmed) return;
    subActionMutation.mutate({ subId, action: "revoke" });
  }

  const departure = formatDeparture(ride.departure_at);
  const seatsLeft = ride.seats_total - ride.seats_taken;
  const driverName = ride.driver.last_name
    ? `${ride.driver.first_name} ${ride.driver.last_name}`
    : ride.driver.first_name;

  // Кнопка записи на поездку (для пассажира)
  const serverRequestStatus = ride.my_request_status;
  // cancelled — нельзя подать повторно (UNIQUE constraint), disabled
  const requestIsActive =
    serverRequestStatus !== null &&
    serverRequestStatus !== "cancelled" &&
    serverRequestStatus !== "rejected";
  const respondBtnDisabled =
    isLoading ||
    reqStatus === "loading" ||
    requestIsActive ||
    serverRequestStatus === "cancelled" ||
    serverRequestStatus === "rejected";
  const respondBtnBg =
    serverRequestStatus === "accepted"
      ? "var(--brand-primary)"
      : requestIsActive || reqStatus === "sent"
        ? "var(--brand-primary-soft)"
        : "var(--brand-primary)";
  const respondBtnLabel =
    isLoading && reqStatus === "idle"
      ? "Проверяем места…"
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

  // Пассажир может отозвать заявку (pending или accepted)
  const canCancelRequest =
    (serverRequestStatus === "pending" || serverRequestStatus === "accepted") &&
    ride.my_request_id !== null &&
    cancelReqStatus !== "done";
  const cancelReqLabel =
    cancelReqStatus === "loading"
      ? "Отменяем..."
      : cancelReqStatus === "error"
        ? "Ошибка, повторите"
        : serverRequestStatus === "accepted"
          ? "Отменить участие"
          : "Отозвать заявку";

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
            routePolyline={ride.route_polyline}
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

          {ride.route_distance_m != null && ride.route_duration_s != null && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 8,
                fontSize: 13,
                color: "var(--brand-text-secondary)",
              }}
            >
              <span>
                {ride.route_distance_m >= 1000
                  ? `${(ride.route_distance_m / 1000).toFixed(1)} км`
                  : `${ride.route_distance_m} м`}
              </span>
              <span>·</span>
              <span>~{Math.ceil(ride.route_duration_s / 60)} мин</span>
            </div>
          )}

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
                : likeStatus === "not_confirmed"
                  ? "Лайк доступен после поездки"
                  : likeStatus === "error"
                    ? "Ошибка, повторите"
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

        {/* Статус подписки на регулярный маршрут — только если есть активная заявка/подписка */}
        {!isOwnRide && templateId && ride.my_subscription_status === "pending" && (
          <div
            style={{
              background: "var(--brand-surface)",
              borderRadius: 14,
              padding: "10px 14px",
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--brand-warn)" }}>
              Заявка на регулярные поездки — ждём водителя
            </span>
            <button
              type="button"
              onClick={handleCancelSubscription}
              style={{
                fontSize: 12,
                color: "var(--brand-sub)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              Отозвать
            </button>
          </div>
        )}
        {!isOwnRide && templateId && ride.my_subscription_status === "accepted" && (
          <div
            style={{
              background: "var(--brand-surface)",
              borderRadius: 14,
              padding: "10px 14px",
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--brand-primary)" }}>
              ✓ Регулярные поездки активны
            </span>
            <button
              type="button"
              onClick={handleCancelSubscription}
              style={{
                fontSize: 12,
                color: "var(--brand-sub)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              Отписаться
            </button>
          </div>
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
                    <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--brand-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {pr.first_name}
                      </div>
                    </div>
                    {st === "done" ? (
                      <div style={{ fontSize: 12, color: "var(--brand-sub)", flexShrink: 0 }}>
                        Готово
                      </div>
                    ) : st === "error" ? (
                      <div style={{ fontSize: 12, color: "var(--brand-danger)", flexShrink: 0 }}>
                        Ошибка
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          data-testid={`accept-${pr.id}`}
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
                          data-testid={`reject-${pr.id}`}
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
        {/* Pending subscription requests — только для водителя */}
        {isOwnRide && templateId && pendingDriverSubs.length > 0 && (
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
              Заявки на постоянные поездки · {pendingDriverSubs.length}
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
              {pendingDriverSubs.map((sub, i) => (
                <div
                  key={sub.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 16px",
                    borderBottom:
                      i === pendingDriverSubs.length - 1 ? "none" : "1px solid var(--brand-border)",
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
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--brand-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sub.passenger_display_name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--brand-sub)", marginTop: 2 }}>
                      {sub.active_to
                        ? `до ${new Date(sub.active_to).toLocaleDateString("ru-RU")}`
                        : "бессрочно"}
                      {sub.message ? ` · ${sub.message}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {(() => {
                      const isItemPending =
                        subActionMutation.isPending &&
                        subActionMutation.variables?.subId === sub.id;
                      return (
                        <>
                          <button
                            type="button"
                            disabled={isItemPending}
                            onClick={() =>
                              subActionMutation.mutate({ subId: sub.id, action: "accept" })
                            }
                            style={{
                              padding: "6px 12px",
                              background: "var(--brand-primary)",
                              color: "var(--brand-primary-ink)",
                              border: "none",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: isItemPending ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                              opacity: isItemPending ? 0.6 : 1,
                            }}
                          >
                            {isItemPending ? "..." : "Принять"}
                          </button>
                          <button
                            type="button"
                            disabled={isItemPending}
                            onClick={() =>
                              subActionMutation.mutate({ subId: sub.id, action: "reject" })
                            }
                            style={{
                              padding: "6px 12px",
                              background: "var(--brand-surface-2, var(--brand-surface))",
                              color: "var(--brand-danger)",
                              border: "1px solid var(--brand-danger)",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: isItemPending ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                              opacity: isItemPending ? 0.6 : 1,
                            }}
                          >
                            {isItemPending ? "..." : "Отклонить"}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Активные подписчики — только для водителя */}
        {isOwnRide && templateId && acceptedDriverSubs.length > 0 && (
          <>
            <div
              style={{
                fontSize: 11,
                color: "var(--brand-sub)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                padding: "12px 4px 8px",
              }}
            >
              Постоянные пассажиры · {acceptedDriverSubs.length}
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
              {acceptedDriverSubs.map((sub, i) => (
                <div
                  key={sub.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 16px",
                    borderBottom:
                      i === acceptedDriverSubs.length - 1
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
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--brand-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sub.passenger_display_name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--brand-sub)", marginTop: 2 }}>
                      {sub.active_to
                        ? `до ${new Date(sub.active_to).toLocaleDateString("ru-RU")}`
                        : "бессрочно"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevokeSubscription(sub.id)}
                    style={{
                      background: "none",
                      border: "1px solid var(--brand-danger)",
                      color: "var(--brand-danger)",
                      borderRadius: 8,
                      padding: "5px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      flexShrink: 0,
                    }}
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Unified join sheet — выбор типа записи */}
      {showJoinSheet && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 100,
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setShowJoinSheet(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowJoinSheet(false)}
        >
          <div
            style={{
              background: "var(--brand-surface)",
              borderRadius: "20px 20px 0 0",
              padding: "20px 16px calc(32px + env(safe-area-inset-bottom, 0px))",
              width: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {joinStep === "choice" ? (
              <>
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: 16,
                    margin: "0 0 4px",
                    color: "var(--brand-text)",
                  }}
                >
                  Как хотите ехать?
                </p>
                <p style={{ fontSize: 13, color: "var(--brand-sub)", margin: "0 0 16px" }}>
                  Этот водитель ездит по маршруту регулярно
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinSheet(false);
                    respondMutation.mutate();
                  }}
                  style={{
                    background: "var(--brand-primary)",
                    color: "var(--brand-primary-ink)",
                    border: "none",
                    borderRadius: 14,
                    padding: "13px 16px",
                    width: "100%",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    marginBottom: 10,
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Только эта поездка</div>
                  <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>
                    Отправить разовую заявку
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setJoinStep("subscription")}
                  style={{
                    background: "var(--brand-surface-2, var(--brand-bg))",
                    color: "var(--brand-text)",
                    border: "1px solid var(--brand-border)",
                    borderRadius: 14,
                    padding: "13px 16px",
                    width: "100%",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Регулярный маршрут</div>
                  <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>
                    Записываться на все поездки автоматически
                  </div>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setJoinStep("choice")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--brand-primary)",
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: "0 0 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  ← Назад
                </button>
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: 16,
                    margin: "0 0 4px",
                    color: "var(--brand-text)",
                  }}
                >
                  Регулярный маршрут
                </p>
                <p style={{ fontSize: 13, color: "var(--brand-sub)", margin: "0 0 16px" }}>
                  Водитель одобрит заявку — после этого вы автоматически записываетесь на все
                  поездки по маршруту
                </p>
                <label
                  htmlFor="sub-active-to"
                  style={{
                    fontSize: 13,
                    color: "var(--brand-sub)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  До какой даты (оставьте пустым — бессрочно)
                </label>
                <input
                  id="sub-active-to"
                  type="date"
                  value={subActiveTo}
                  onChange={(e) => setSubActiveTo(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--brand-border)",
                    background: "var(--brand-bg)",
                    color: "var(--brand-text)",
                    fontSize: 14,
                    marginBottom: 10,
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
                <label
                  htmlFor="sub-message"
                  style={{
                    fontSize: 13,
                    color: "var(--brand-sub)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Сообщение водителю (необязательно)
                </label>
                <input
                  id="sub-message"
                  type="text"
                  value={subMessage}
                  onChange={(e) => setSubMessage(e.target.value)}
                  placeholder="Например: буду каждый будний день"
                  maxLength={200}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--brand-border)",
                    background: "var(--brand-bg)",
                    color: "var(--brand-text)",
                    fontSize: 14,
                    marginBottom: 16,
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={subscribeMutation.isPending}
                  style={{
                    background: "var(--brand-primary)",
                    color: "var(--brand-primary-ink)",
                    border: "none",
                    borderRadius: 14,
                    padding: "13px 0",
                    width: "100%",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: subscribeMutation.isPending ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: subscribeMutation.isPending ? 0.6 : 1,
                  }}
                >
                  {subscribeMutation.isPending ? "Отправляем..." : "Отправить заявку"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit form — inline, shown above action bar */}
      {showEditForm && (
        <div
          data-testid="edit-ride-form"
          style={{
            position: "fixed",
            bottom: 68,
            left: 0,
            right: 0,
            background: "var(--brand-surface)",
            borderTop: "1px solid var(--brand-border)",
            borderBottom: "1px solid var(--brand-border)",
            padding: "16px 16px 12px",
            zIndex: 29,
            boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
          }}
        >
          {ride.passengers.length > 0 && (
            <div
              data-testid="edit-passenger-warning"
              style={{
                fontSize: 12,
                color: "var(--brand-warn)",
                background: "rgba(200,120,0,0.08)",
                borderRadius: 8,
                padding: "8px 10px",
                marginBottom: 12,
                lineHeight: 1.4,
              }}
            >
              Принятые пассажиры получат уведомление об изменении поездки
            </div>
          )}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}
          >
            <div>
              <label
                htmlFor="edit-seats-total"
                style={{
                  fontSize: 11,
                  color: "var(--brand-sub)",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Мест всего
              </label>
              <select
                id="edit-seats-total"
                data-testid="edit-seats-total"
                value={editSeats}
                onChange={(e) => setEditSeats(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--brand-border)",
                  background: "var(--brand-bg)",
                  color: "var(--brand-text)",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="edit-price-rub"
                style={{
                  fontSize: 11,
                  color: "var(--brand-sub)",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Цена (₽)
              </label>
              <input
                id="edit-price-rub"
                data-testid="edit-price-rub"
                type="number"
                min="0"
                placeholder="Бесплатно"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--brand-border)",
                  background: "var(--brand-bg)",
                  color: "var(--brand-text)",
                  fontSize: 14,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label
              htmlFor="edit-comment"
              style={{
                fontSize: 11,
                color: "var(--brand-sub)",
                fontWeight: 600,
                display: "block",
                marginBottom: 4,
              }}
            >
              Комментарий
            </label>
            <textarea
              id="edit-comment"
              data-testid="edit-comment"
              value={editComment}
              onChange={(e) => setEditComment(e.target.value)}
              maxLength={200}
              rows={2}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--brand-border)",
                background: "var(--brand-bg)",
                color: "var(--brand-text)",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="edit-cancel-btn"
              onClick={() => setShowEditForm(false)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 10,
                border: "1px solid var(--brand-border)",
                background: "var(--brand-bg)",
                color: "var(--brand-text)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              data-testid="edit-save-btn"
              disabled={editStatus === "loading"}
              onClick={handleSaveEdit}
              style={{
                flex: 2,
                padding: "10px",
                borderRadius: 10,
                border: "none",
                background: "var(--brand-primary)",
                color: "var(--brand-primary-ink)",
                fontSize: 14,
                fontWeight: 600,
                cursor: editStatus === "loading" ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: editStatus === "loading" ? 0.6 : 1,
              }}
            >
              {editStatus === "loading"
                ? "Сохраняем..."
                : editStatus === "error"
                  ? "Ошибка, повторите"
                  : "Сохранить"}
            </button>
          </div>
        </div>
      )}

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
          {isOwnRide && ride.status === "active" && (
            <button
              type="button"
              data-testid="edit-ride-btn"
              onClick={handleOpenEdit}
              style={{
                flex: 1,
                padding: "12px 16px",
                background: "var(--brand-surface-2)",
                border: "1px solid var(--brand-border)",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--brand-text)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Изменить
            </button>
          )}
          {isOwnRide && ride.status === "active" && (
            <button
              type="button"
              data-testid="complete-ride-btn"
              disabled={completeRideStatus === "loading" || completeRideStatus === "done"}
              onClick={handleCompleteRide}
              style={{
                flex: 1,
                padding: "12px 16px",
                background: "var(--brand-primary)",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--brand-primary-ink)",
                cursor:
                  completeRideStatus === "loading" || completeRideStatus === "done"
                    ? "not-allowed"
                    : "pointer",
                fontFamily: "inherit",
                opacity: completeRideStatus === "loading" ? 0.6 : 1,
              }}
            >
              {completeRideStatus === "loading"
                ? "Завершаем..."
                : completeRideStatus === "done"
                  ? "Поездка завершена"
                  : completeRideStatus === "error"
                    ? "Ошибка, повторите"
                    : "Завершить"}
            </button>
          )}
          {isOwnRide && ride.status === "active" && (
            <button
              type="button"
              data-testid="cancel-ride-btn"
              disabled={cancelRideStatus === "loading" || cancelRideStatus === "done"}
              onClick={handleCancelRide}
              style={{
                flex: 1,
                padding: "12px 16px",
                background: "var(--brand-surface-2)",
                border: "1px solid var(--brand-danger)",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--brand-danger)",
                cursor:
                  cancelRideStatus === "loading" || cancelRideStatus === "done"
                    ? "not-allowed"
                    : "pointer",
                fontFamily: "inherit",
                opacity: cancelRideStatus === "loading" ? 0.6 : 1,
              }}
            >
              {cancelRideStatus === "loading"
                ? "Отменяем..."
                : cancelRideStatus === "done"
                  ? "Поездка отменена"
                  : cancelRideStatus === "error"
                    ? "Ошибка, повторите"
                    : "Отменить поездку"}
            </button>
          )}
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
              Связаться с водителем
            </button>
          )}
          {!isOwnRide && canCancelRequest && (
            <button
              type="button"
              data-testid="cancel-request-btn"
              disabled={cancelReqStatus === "loading"}
              onClick={handleCancelRequest}
              style={{
                flex: 1.6,
                padding: "12px 16px",
                background: "var(--brand-surface-2)",
                border: "1px solid var(--brand-danger)",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--brand-danger)",
                cursor: cancelReqStatus === "loading" ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: cancelReqStatus === "loading" ? 0.6 : 1,
              }}
            >
              {cancelReqLabel}
            </button>
          )}
          {!isOwnRide && !canCancelRequest && (
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
