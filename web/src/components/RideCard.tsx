import { compactAddressLabel, compactAddressTitle } from "../lib/addressFormat";
import { type RideCardState, getRideCardBg, getRideCardBorderColor } from "../lib/rideCardState";
import { formatRouteMetrics } from "../lib/routeMetrics";
import type { Ride } from "../types/ride";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

export type { RideCardState } from "../lib/rideCardState";

interface RideCardProps {
  ride: Ride;
  density?: "compact" | "cozy";
  onClick?: (ride: Ride) => void;
  cardState?: RideCardState;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  isAlongTheWay?: boolean | undefined;
}

const MAX_ADDR_LEN = 22;

function dateLabel(departureAt: string): string | null {
  const dep = new Date(departureAt);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const depStart = new Date(dep.getFullYear(), dep.getMonth(), dep.getDate());
  const diffDays = Math.round((depStart.getTime() - todayStart.getTime()) / 86400000);
  if (diffDays <= 0) return null;
  if (diffDays === 1) return "завтра";
  return dep.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function relativeTime(departureAt: string): string {
  const diff = Math.round((new Date(departureAt).getTime() - Date.now()) / 60000);
  if (diff < 0) return "уже уехал";
  if (diff === 0) return "сейчас";
  if (diff < 60) return `через ${diff} мин`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `через ${h} ч ${m} мин` : `через ${h} ч`;
}

function getBadgeConfig(state: RideCardState): { label: string; color: string; bg: string } | null {
  switch (state) {
    case "own":
      return { label: "Ваша поездка", color: "var(--ride-own)", bg: "var(--ride-own-soft)" };
    case "applied":
      return {
        label: "Заявка подана",
        color: "var(--ride-applied)",
        bg: "var(--ride-applied-soft)",
      };
    case "approved":
      return { label: "Одобрено", color: "var(--ride-approved)", bg: "var(--ride-approved-soft)" };
    default:
      return null;
  }
}

export function RideCard({
  ride,
  density = "cozy",
  onClick,
  cardState = "default",
  isAlongTheWay,
}: RideCardProps) {
  const time = new Date(ride.departure_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const seats = ride.seats_total - ride.seats_taken;
  const priceLabel = ride.price_rub !== null ? `${ride.price_rub} ₽` : "0 ₽";
  const noSeats = seats === 0;
  const rel = relativeTime(ride.departure_at);
  const dateBadge = dateLabel(ride.departure_at);
  const bg = getRideCardBg(cardState);
  const borderColor = getRideCardBorderColor(cardState);
  const badge = getBadgeConfig(cardState);
  const routeMetrics = formatRouteMetrics(ride.route_distance_m, ride.route_duration_s);
  const fromLabel = compactAddressLabel(ride.from_label, { maxLen: MAX_ADDR_LEN });
  const toLabel = compactAddressLabel(ride.to_label, { maxLen: MAX_ADDR_LEN });
  const fromTitle = compactAddressTitle(ride.from_label, fromLabel);
  const toTitle = compactAddressTitle(ride.to_label, toLabel);

  if (density === "compact") {
    return (
      <button
        type="button"
        onClick={() => onClick?.(ride)}
        style={{
          width: "100%",
          textAlign: "left",
          background: bg,
          borderRadius: 8,
          padding: "6px 12px",
          cursor: "pointer",
          border: "none",
          boxShadow: borderColor
            ? `inset 0 0 0 1.5px ${borderColor}, var(--shadow-sm)`
            : "var(--shadow-sm)",
          fontFamily: "inherit",
          transition: "transform 0.08s",
          display: "grid",
          gridTemplateColumns: "40px minmax(0,1fr) 52px 24px",
          alignItems: "center",
          columnGap: 8,
          fontVariantNumeric: "tabular-nums",
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = "scale(0.98)";
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = "";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "";
        }}
      >
        {/* Time */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 1,
          }}
        >
          {dateBadge && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: "var(--brand-primary)",
                lineHeight: 1,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              {dateBadge}
            </span>
          )}
          <span
            style={{
              color: "var(--brand-text)",
              fontWeight: 700,
              fontSize: 12.5,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            {time}
          </span>
        </div>

        {/* From → To inline, split 50/50 */}
        <div
          style={{
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              fontWeight: 400,
              color: "var(--brand-sub)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span title={fromTitle}>{fromLabel}</span>
          </span>
          <span
            style={{
              color: "var(--brand-faint)",
              fontSize: 11,
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            →
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              fontWeight: 400,
              color: "var(--brand-sub)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textAlign: "right",
            }}
          >
            <span title={toTitle}>{toLabel}</span>
          </span>
        </div>

        {/* Price */}
        <div
          style={{
            fontWeight: 700,
            fontSize: 12.5,
            color: noSeats ? "var(--brand-danger)" : "var(--brand-text)",
            lineHeight: 1,
            textAlign: "right",
            whiteSpace: "nowrap",
          }}
        >
          {priceLabel}
        </div>

        {/* Seats */}
        <div
          style={{
            fontSize: 11,
            color: noSeats ? "var(--brand-danger)" : "var(--brand-sub)",
            lineHeight: 1,
            textAlign: "right",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 2,
            whiteSpace: "nowrap",
          }}
        >
          <Icon name="seat" size={10} />
          {seats}
        </div>
      </button>
    );
  }

  // Cozy mode — v2 layout
  return (
    <article
      data-testid="ride-card"
      onClick={() => onClick?.(ride)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.(ride);
      }}
      tabIndex={onClick ? 0 : undefined}
      style={{
        width: "100%",
        textAlign: "left",
        background: bg,
        borderRadius: 14,
        padding: 12,
        cursor: onClick ? "pointer" : "default",
        boxShadow: borderColor
          ? `inset 3px 0 0 ${borderColor}, var(--shadow-sm)`
          : "var(--shadow-sm)",
        fontFamily: "inherit",
        transition: "transform 0.08s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(0.98)";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
      }}
    >
      {/* Top row: time + relative + [state badge] + price */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          {dateBadge && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: "var(--brand-primary)",
                lineHeight: 1,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              {dateBadge}
            </span>
          )}
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "var(--brand-text)",
              letterSpacing: "-0.01em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {time}
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--brand-sub)",
            lineHeight: 1.2,
            minWidth: 0,
            flex: 1,
          }}
        >
          {rel}
        </div>
        {badge && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: badge.color,
              background: badge.bg,
              borderRadius: 6,
              padding: "2px 6px",
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {badge.label}
          </span>
        )}
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 700,
            color: "var(--brand-text)",
            letterSpacing: -0.3,
            lineHeight: 1,
            whiteSpace: "nowrap",
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {priceLabel}
        </div>
      </div>

      {/* Route: two labelled rows — "Откуда: <addr>" and "Куда: <addr>" */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--brand-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              flexShrink: 0,
              minWidth: 46,
            }}
          >
            Откуда
          </span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--brand-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              minWidth: 0,
            }}
          >
            <span title={fromTitle}>{fromLabel}</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--brand-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              flexShrink: 0,
              minWidth: 46,
            }}
          >
            Куда
          </span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--brand-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              minWidth: 0,
            }}
          >
            <span title={toTitle}>{toLabel}</span>
          </span>
        </div>
      </div>

      {/* Route info + along-the-way badge */}
      {(routeMetrics || isAlongTheWay) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 18 }}>
          {routeMetrics && (
            <span style={{ fontSize: 11.5, color: "var(--brand-sub)" }}>{routeMetrics}</span>
          )}
          {isAlongTheWay && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--brand-primary)",
                background: "var(--brand-primary-soft, rgba(45,90,61,0.1))",
                borderRadius: 6,
                padding: "1px 6px",
                lineHeight: 1.35,
                whiteSpace: "nowrap",
              }}
            >
              По пути
            </span>
          )}
        </div>
      )}

      {/* Bottom row: driver + seats + comment */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 6,
          borderTop: "1px solid var(--brand-line-soft)",
        }}
      >
        {ride.driver_display_name && (
          <div
            data-testid="driver-info"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              color: "var(--brand-sub)",
              fontWeight: 500,
              minWidth: 0,
            }}
          >
            <Avatar
              tgId={ride.driver_tg_id ?? 0}
              photoUrl={ride.driver_photo_url ?? null}
              displayName={ride.driver_display_name}
              size={16}
            />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ride.driver_display_name}
            </span>
          </div>
        )}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11.5,
            color: noSeats ? "var(--brand-danger)" : "var(--brand-sub)",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          <Icon name="seat" size={12} />
          {noSeats ? "нет мест" : `${seats} мест`}
        </div>
        {ride.comment !== null && (
          <div
            style={{
              flex: 1,
              fontSize: 11.5,
              color: "var(--brand-sub)",
              fontStyle: "italic",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "right",
            }}
          >
            {ride.comment}
          </div>
        )}
      </div>
    </article>
  );
}
