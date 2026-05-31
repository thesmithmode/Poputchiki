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
const URGENT_DEPARTURE_MINUTES = 20;

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
function isDepartureUrgent(departureAt: string): boolean {
  const diff = Math.round((new Date(departureAt).getTime() - Date.now()) / 60000);
  return diff >= 0 && diff <= URGENT_DEPARTURE_MINUTES;
}

function formatDriverRating(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";
}

function clampNonNegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
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
  const seatsLabel = `${seats}/${ride.seats_total}`;
  const priceLabel = ride.price_rub !== null ? `${ride.price_rub} ₽` : "0 ₽";
  const noSeats = seats === 0;
  const rel = relativeTime(ride.departure_at);
  const urgentDeparture = isDepartureUrgent(ride.departure_at);
  const dateBadge = dateLabel(ride.departure_at);
  const bg = getRideCardBg(cardState);
  const borderColor = getRideCardBorderColor(cardState);
  const railColor = borderColor ?? "var(--brand-faint)";
  const routeMetrics = formatRouteMetrics(ride.route_distance_m, ride.route_duration_s);
  const driverRating = formatDriverRating(ride.driver_avg_stars);
  const driverLikes = clampNonNegative(ride.driver_likes_received_count);
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

        {/* From to To inline, split 50/50 */}
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

  // Cozy mode - expanded dense route-card layout.
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
        borderRadius: 12,
        padding: 0,
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${borderColor ?? "var(--brand-line)"}`,
        boxShadow: borderColor
          ? `inset 3px 0 0 ${borderColor}, var(--shadow-sm)`
          : "var(--shadow-sm)",
        fontFamily: "inherit",
        transition: "transform 0.08s",
        overflow: "hidden",
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
      <div
        data-testid="ride-card-expanded-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "84px 16px minmax(0, 1fr) 58px",
          columnGap: 8,
          padding: "10px 10px",
          alignItems: "stretch",
        }}
      >
        <div
          data-testid="ride-card-driver-meta"
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>
            {dateBadge ? (
              <div
                style={{
                  marginBottom: 3,
                  fontSize: 10,
                  fontWeight: 700,
                  color: railColor,
                  lineHeight: 1.1,
                  textTransform: "uppercase",
                }}
              >
                {dateBadge}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: borderColor ?? "var(--brand-text)",
                letterSpacing: 0,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {time}
            </div>
            <div
              data-testid="ride-card-relative-time"
              style={{
                marginTop: 7,
                fontSize: 12,
                color: urgentDeparture ? "var(--brand-danger)" : "var(--brand-sub)",
                lineHeight: 1.2,
              }}
            >
              {rel}
            </div>
          </div>

          {ride.driver_display_name ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  minWidth: 0,
                  fontSize: 12.5,
                  color: "var(--brand-sub)",
                  fontWeight: 600,
                }}
              >
                <Avatar
                  tgId={ride.driver_tg_id ?? 0}
                  photoUrl={ride.driver_photo_url ?? null}
                  displayName={ride.driver_display_name}
                  size={22}
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
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span
                  data-testid="driver-rating"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: "#6B7280",
                    fontSize: 12.5,
                    fontWeight: 650,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <Icon name="star-fill" size={15} style={{ color: "#F5B301" }} />
                  {driverRating}
                </span>
                <span
                  data-testid="driver-likes"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: "#6B7280",
                    fontSize: 12.5,
                    fontWeight: 650,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <Icon name="heart-fill" size={15} style={{ color: "#E03131" }} />
                  {driverLikes}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div
          data-testid="ride-card-route-rail"
          style={{
            width: 16,
            minHeight: 86,
            position: "relative",
            marginTop: dateBadge ? 18 : 2,
            color: railColor,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 5,
              left: 4,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "currentColor",
              boxShadow: `0 0 0 2px ${bg}`,
            }}
          />
          <span
            style={{
              position: "absolute",
              top: 13,
              bottom: 13,
              left: 7,
              width: 2,
              borderRadius: 2,
              background: "currentColor",
              opacity: 0.78,
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: 5,
              left: 4,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "currentColor",
              boxShadow: `0 0 0 2px ${bg}`,
            }}
          />
        </div>

        <div
          data-testid="ride-card-route-body"
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            data-testid="ride-card-route-lines"
            style={{
              display: "grid",
              gridTemplateColumns: "42px minmax(0, 1fr)",
              columnGap: 7,
              rowGap: 7,
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 750,
                color: "var(--brand-sub)",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                lineHeight: 1.2,
              }}
            >
              Откуда
            </span>
            <span
              data-testid="ride-card-from-address"
              style={{
                minWidth: 0,
                fontSize: 13.5,
                fontWeight: 700,
                color: "var(--brand-text)",
                lineHeight: 1.18,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={fromTitle}
            >
              {ride.from_label}
            </span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 750,
                color: "var(--brand-sub)",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                lineHeight: 1.2,
              }}
            >
              Куда
            </span>
            <span
              data-testid="ride-card-to-address"
              style={{
                minWidth: 0,
                fontSize: 13.5,
                fontWeight: 700,
                color: "var(--brand-text)",
                lineHeight: 1.18,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={toTitle}
            >
              {ride.to_label}
            </span>
          </div>

          <div
            style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 18, minWidth: 0 }}
          >
            {routeMetrics ? (
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--brand-sub)",
                  lineHeight: 1.25,
                  whiteSpace: "nowrap",
                }}
              >
                {routeMetrics}
              </span>
            ) : null}
          </div>
        </div>

        <div
          data-testid="ride-card-side-meta"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 850,
              color: noSeats ? "var(--brand-danger)" : "var(--brand-text)",
              lineHeight: 1,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {priceLabel}
          </div>
          <div
            data-testid="ride-card-seats-chip"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              minWidth: 48,
              minHeight: 34,
              padding: "0 9px",
              borderRadius: 9,
              background: "rgba(255,255,255,0.56)",
              color: noSeats ? "var(--brand-danger)" : "var(--brand-ink-2)",
              fontSize: 14,
              fontWeight: 700,
              boxShadow: "inset 0 0 0 1px var(--brand-line-soft)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Icon name="car" size={18} />
            {seatsLabel}
          </div>
          <div
            data-testid="ride-card-chevron"
            aria-hidden="true"
            style={{
              color: "var(--brand-sub)",
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="chevron-r" size={20} />
          </div>
        </div>
      </div>
    </article>
  );
}
