import { useTelegramHaptic } from "../hooks/useTelegramHaptic";
import type { Ride } from "../types/ride";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

interface RideCardProps {
  ride: Ride;
  density?: "compact" | "cozy";
  onClick?: (ride: Ride) => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  isOwnRide?: boolean;
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

export function RideCard({
  ride,
  density = "cozy",
  onClick,
  isFavorited,
  onToggleFavorite,
  isOwnRide = false,
}: RideCardProps) {
  const { selection } = useTelegramHaptic();
  const time = new Date(ride.departure_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const seats = ride.seats_total - ride.seats_taken;
  const priceLabel = ride.price_rub !== null ? `${ride.price_rub} ₽` : "0 ₽";
  const noSeats = seats === 0;
  const rel = relativeTime(ride.departure_at);

  if (density === "compact") {
    return (
      <button
        type="button"
        onClick={() => onClick?.(ride)}
        style={{
          width: "100%",
          textAlign: "left",
          background: isOwnRide ? "var(--brand-primary-soft)" : "var(--brand-surface)",
          borderRadius: 8,
          padding: "7px 12px",
          cursor: "pointer",
          border: "none",
          boxShadow: isOwnRide
            ? "inset 0 0 0 1.5px var(--brand-primary-line), var(--shadow-sm)"
            : "var(--shadow-sm)",
          fontFamily: "inherit",
          transition: "transform 0.08s",
          display: "grid",
          gridTemplateColumns: "44px 8px minmax(0,1fr) 56px 26px",
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
            color: "var(--brand-text)",
            fontWeight: 500,
            fontSize: 12.5,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          {time}
        </div>

        {/* Colored dot */}
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--brand-primary)",
            display: "block",
          }}
        />

        {/* Destination — truncates on long text */}
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: "var(--brand-text)",
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {ride.to_label}
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
        background: isOwnRide ? "var(--brand-primary-soft)" : "var(--brand-surface)",
        borderRadius: 18,
        padding: 14,
        cursor: onClick ? "pointer" : "default",
        boxShadow: "var(--shadow-sm)",
        fontFamily: "inherit",
        transition: "transform 0.08s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        ...(isOwnRide && {
          borderLeft: "3px solid var(--brand-primary)",
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
      {/* Top row: time + relative + [own badge] + price */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: "var(--brand-text)",
            letterSpacing: "-0.01em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {time}
        </div>
        <div style={{ fontSize: 12, color: "var(--brand-sub)", lineHeight: 1 }}>{rel}</div>
        {isOwnRide && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--brand-primary)",
              background: "var(--brand-primary-soft)",
              borderRadius: 6,
              padding: "2px 7px",
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}
          >
            Ваша поездка
          </span>
        )}
        <div style={{ flex: 1 }} />
        {onToggleFavorite && (
          <button
            type="button"
            data-testid="fav-toggle"
            onClick={(e) => {
              e.stopPropagation();
              selection();
              onToggleFavorite();
            }}
            aria-label={isFavorited ? "Убрать из избранного" : "Добавить в избранное"}
            style={{
              padding: 4,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              color: isFavorited ? "var(--brand-accent)" : "var(--brand-faint)",
              flexShrink: 0,
            }}
          >
            {isFavorited ? "❤️" : "🤍"}
          </button>
        )}
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--brand-text)",
            letterSpacing: -0.3,
            lineHeight: 1,
          }}
        >
          {priceLabel}
        </div>
      </div>

      {/* Route row: from dot → line → pin + to */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--route-from)",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: "var(--brand-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ride.from_label}
        </div>
        <div
          style={{
            flex: "0 1 24px",
            height: 1.5,
            background: "var(--brand-line)",
            minWidth: 14,
            flexShrink: 0,
          }}
        />
        <Icon name="pin" size={13} style={{ color: "var(--route-to)", flexShrink: 0 }} />
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--brand-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            minWidth: 0,
          }}
        >
          {ride.to_label}
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
