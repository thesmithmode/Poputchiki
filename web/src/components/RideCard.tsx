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

interface CountdownLabel {
  label: string | null;
  value: string;
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

function countdownLabel(departureAt: string): CountdownLabel {
  const diff = Math.round((new Date(departureAt).getTime() - Date.now()) / 60000);
  if (diff < 0) return { label: null, value: "уже уехал" };
  if (diff === 0) return { label: null, value: "сейчас" };
  if (diff < 60) return { label: "до отправления", value: `${diff} м` };
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return { label: "до отправления", value: m > 0 ? `${h} ч ${m} м` : `${h} ч` };
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
  const isViewed = cardState === "viewed";
  const time = new Date(ride.departure_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const seats = ride.seats_total - ride.seats_taken;
  const seatsLabel = `${seats}/${ride.seats_total}`;
  const priceLabel = ride.price_rub !== null ? `${ride.price_rub} ₽` : "0 ₽";
  const noSeats = seats === 0;
  const countdown = countdownLabel(ride.departure_at);
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
          gridTemplateColumns: "82px minmax(0, 1fr) 50px",
          columnGap: 8,
          padding: "9px 10px",
          alignItems: "stretch",
          opacity: isViewed ? 0.68 : 1,
          filter: isViewed ? "saturate(0.76)" : "none",
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
                  color: isViewed ? "var(--brand-faint)" : railColor,
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
                fontSize: 11.5,
                color: urgentDeparture ? "var(--brand-danger)" : "var(--brand-sub)",
                lineHeight: 1.2,
              }}
            >
              {countdown.label ? (
                <>
                  <span style={{ display: "block" }}>{countdown.label}</span>
                  <span style={{ display: "block", fontWeight: 650 }}>{countdown.value}</span>
                </>
              ) : (
                countdown.value
              )}
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
          data-testid="ride-card-route-body"
          style={{
            minWidth: 0,
            display: "flex",
            alignItems: "stretch",
          }}
        >
          <div
            data-testid="ride-card-route-lines"
            style={{
              display: "grid",
              gridTemplateColumns: "14px 38px minmax(0, 1fr)",
              gridTemplateRows: "minmax(44px, auto) 18px minmax(44px, auto)",
              columnGap: 6,
              rowGap: 2,
              minHeight: 112,
              width: "100%",
              position: "relative",
              color: railColor,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                gridColumn: 1,
                gridRow: "1 / 4",
                position: "absolute",
                top: 22,
                bottom: 22,
                left: 6,
                width: 2,
                borderRadius: 2,
                background: "currentColor",
                opacity: 0.78,
              }}
            />
            <span
              data-testid="ride-card-from-dot"
              aria-hidden="true"
              style={{
                gridColumn: 1,
                gridRow: 1,
                alignSelf: "center",
                justifySelf: "center",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "currentColor",
                boxShadow: `0 0 0 2px ${bg}`,
                zIndex: 1,
              }}
            />
            <span
              style={{
                gridColumn: 2,
                gridRow: 1,
                alignSelf: "center",
                fontSize: 9,
                fontWeight: 750,
                color: isViewed ? "var(--brand-faint)" : "var(--brand-sub)",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                lineHeight: 1.1,
              }}
            >
              Откуда
            </span>
            <span
              data-testid="ride-card-from-address"
              style={{
                gridColumn: 3,
                gridRow: 1,
                alignSelf: "center",
                minWidth: 0,
                fontSize: 12.5,
                fontWeight: 650,
                color: "var(--brand-text)",
                lineHeight: 1.15,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={fromTitle}
            >
              {ride.from_label}
            </span>
            <div
              data-testid="ride-card-route-metrics"
              style={{
                gridColumn: 3,
                gridRow: 2,
                display: "flex",
                alignItems: "center",
                minWidth: 0,
                minHeight: 18,
              }}
            >
              {routeMetrics ? (
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 550,
                    color: "var(--brand-sub)",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {routeMetrics}
                </span>
              ) : null}
            </div>
            <span
              data-testid="ride-card-to-dot"
              aria-hidden="true"
              style={{
                gridColumn: 1,
                gridRow: 3,
                alignSelf: "center",
                justifySelf: "center",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "currentColor",
                boxShadow: `0 0 0 2px ${bg}`,
                zIndex: 1,
              }}
            />
            <span
              style={{
                gridColumn: 2,
                gridRow: 3,
                alignSelf: "center",
                fontSize: 9,
                fontWeight: 750,
                color: isViewed ? "var(--brand-faint)" : "var(--brand-sub)",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                lineHeight: 1.1,
              }}
            >
              Куда
            </span>
            <span
              data-testid="ride-card-to-address"
              style={{
                gridColumn: 3,
                gridRow: 3,
                alignSelf: "center",
                minWidth: 0,
                fontSize: 12.5,
                fontWeight: 650,
                color: "var(--brand-text)",
                lineHeight: 1.15,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={toTitle}
            >
              {ride.to_label}
            </span>
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
              gap: 5,
              minWidth: 40,
              minHeight: 24,
              padding: 0,
              color: noSeats ? "var(--brand-danger)" : "var(--brand-ink-2)",
              fontSize: 12.5,
              fontWeight: 650,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Icon name="car" size={15} />
            {seatsLabel}
          </div>
        </div>
      </div>
    </article>
  );
}
