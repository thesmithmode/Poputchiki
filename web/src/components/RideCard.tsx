import type { Ride } from "../types/ride";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

export type RideCardState = "own" | "applied" | "approved" | "viewed" | "default";

interface RideCardProps {
  ride: Ride;
  density?: "compact" | "cozy";
  onClick?: (ride: Ride) => void;
  cardState?: RideCardState;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

const MAX_ADDR_LEN = 22;

function formatAddress(label: string): string {
  if (!label) return label;
  const cleaned = label
    .replace(/,?\s*г\.?\s*Казань\b/gi, "")
    .replace(/,?\s*\bКазань\b/gi, "")
    .replace(/,?\s*Республика\s+Татарстан\b/gi, "")
    .replace(/,?\s*\bТатарстан\b/gi, "")
    .replace(/,?\s*\bРоссия\b/gi, "")
    .replace(/\bулица\b/gi, "ул.")
    .replace(/\bпроспект\b/gi, "пр.")
    .replace(/\bпереулок\b/gi, "пер.")
    .replace(/\bбульвар\b/gi, "бул.")
    .replace(/\bшоссе\b/gi, "ш.")
    .replace(/\bнабережная\b/gi, "наб.")
    .replace(/^\s*,\s*/, "")
    .replace(/,\s*$/, "")
    .trim();
  const result = cleaned || label;
  return result.length > MAX_ADDR_LEN ? `${result.slice(0, MAX_ADDR_LEN - 1)}…` : result;
}

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

function getCardBg(state: RideCardState): string {
  switch (state) {
    case "own":
      return "var(--ride-own-soft)";
    case "applied":
      return "var(--ride-applied-soft)";
    case "approved":
      return "var(--ride-approved-soft)";
    case "viewed":
      return "var(--ride-viewed-soft)";
    default:
      return "var(--brand-surface)";
  }
}

function getCardBorderColor(state: RideCardState): string | undefined {
  switch (state) {
    case "own":
      return "var(--ride-own)";
    case "applied":
      return "var(--ride-applied)";
    case "approved":
      return "var(--ride-approved)";
    default:
      return undefined;
  }
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
  const bg = getCardBg(cardState);
  const borderColor = getCardBorderColor(cardState);
  const badge = getBadgeConfig(cardState);

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
            {formatAddress(ride.from_label)}
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
            {formatAddress(ride.to_label)}
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
        borderRadius: 18,
        padding: 14,
        cursor: onClick ? "pointer" : "default",
        boxShadow: "var(--shadow-sm)",
        fontFamily: "inherit",
        transition: "transform 0.08s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        ...(borderColor && {
          borderLeft: `3px solid ${borderColor}`,
          paddingLeft: 11,
        }),
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          {dateBadge && (
            <span
              style={{
                fontSize: 10,
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
              fontSize: 18,
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
              fontSize: 11,
              fontWeight: 600,
              color: badge.color,
              background: badge.bg,
              borderRadius: 6,
              padding: "2px 7px",
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {badge.label}
          </span>
        )}
        <div
          style={{
            fontSize: 15,
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
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--brand-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              flexShrink: 0,
              minWidth: 54,
            }}
          >
            Откуда
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--brand-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              minWidth: 0,
            }}
          >
            {formatAddress(ride.from_label)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--brand-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              flexShrink: 0,
              minWidth: 54,
            }}
          >
            Куда
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--brand-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              minWidth: 0,
            }}
          >
            {formatAddress(ride.to_label)}
          </span>
        </div>
      </div>

      {/* Bottom row: driver + seats + comment */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingTop: 8,
          borderTop: "1px solid var(--brand-line-soft)",
        }}
      >
        {ride.driver_display_name && (
          <div
            data-testid="driver-info"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--brand-sub)",
              fontWeight: 500,
              minWidth: 0,
            }}
          >
            <Avatar
              tgId={ride.driver_tg_id ?? 0}
              photoUrl={ride.driver_photo_url ?? null}
              displayName={ride.driver_display_name}
              size={18}
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
            fontSize: 12,
            color: noSeats ? "var(--brand-danger)" : "var(--brand-sub)",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          <Icon name="seat" size={13} />
          {noSeats ? "нет мест" : `${seats} мест`}
        </div>
        {ride.comment !== null && (
          <div
            style={{
              flex: 1,
              fontSize: 12,
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
