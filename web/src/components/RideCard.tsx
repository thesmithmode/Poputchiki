import { useTelegramHaptic } from "../hooks/useTelegramHaptic";
import type { Ride } from "../types/ride";
import { Icon } from "./Icon";
import { RouteBlock } from "./RouteBlock";

interface RideCardProps {
  ride: Ride;
  onClick?: (ride: Ride) => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

export function RideCard({ ride, onClick, isFavorited, onToggleFavorite }: RideCardProps) {
  const { selection } = useTelegramHaptic();
  const time = new Date(ride.departure_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const seats = ride.seats_total - ride.seats_taken;
  const priceLabel = ride.price_rub !== null ? `${ride.price_rub} ₽` : "Бесплатно";
  const noSeats = seats === 0;

  return (
    <button
      type="button"
      onClick={() => onClick?.(ride)}
      style={{
        width: "100%",
        textAlign: "left",
        background: "var(--brand-surface)",
        borderRadius: 14,
        padding: 12,
        cursor: "pointer",
        border: "none",
        boxShadow: "0 1px 2px rgba(20,30,50,0.04), 0 1px 0 rgba(20,30,50,0.03)",
        fontFamily: "inherit",
        transition: "transform 0.08s",
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
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <RouteBlock fromLabel={ride.from_label} toLabel={ride.to_label} compact />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: "var(--brand-sub)",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Icon name="clock" size={10} />
              {time}
            </span>
            <div style={{ flex: 1 }} />
            <span
              style={{
                fontSize: 11.5,
                color: noSeats ? "#E54E5C" : "var(--brand-sub)",
                fontWeight: 500,
              }}
            >
              {noSeats ? "нет мест" : `${seats} мест`}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--brand-text)",
                letterSpacing: -0.3,
              }}
            >
              {priceLabel}
            </span>
          </div>

          {ride.comment !== null && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--brand-sub)",
                fontStyle: "italic",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ride.comment}
            </div>
          )}
        </div>

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
              flexShrink: 0,
              padding: 4,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              color: isFavorited ? "#E54E5C" : "var(--brand-sub)",
            }}
          >
            {isFavorited ? "❤️" : "🤍"}
          </button>
        )}
      </div>
    </button>
  );
}
