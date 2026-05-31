import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { RideCard } from "../components/RideCard";
import type { Filters } from "../hooks/useFilters";
import { applyFilters } from "../hooks/useFilters";
import { useMe } from "../hooks/useMe";
import { useMyRideRequests } from "../hooks/useMyRideRequests";
import { useRealtime } from "../hooks/useRealtime";
import { useRides } from "../hooks/useRides";
import { getRideCardState, markRideViewed, readViewedRideIds } from "../lib/rideCardState";
import type { Ride } from "../types/ride";

interface FeedViewProps {
  filters: Filters;
  density: "compact" | "cozy";
  onRidesCount?: (n: number) => void;
  onFeedMeta?: (meta: { isFetching: boolean; dataUpdatedAt: number; refetch: () => void }) => void;
}

function pluralRides(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "маршрутов";
  if (mod10 === 1) return "маршрут";
  if (mod10 >= 2 && mod10 <= 4) return "маршрута";
  return "маршрутов";
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayDiffFromToday(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rideDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((rideDay.getTime() - today.getTime()) / 86400000);
}

function feedDayLabel(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const diff = dayDiffFromToday(iso);
  if (diff === 0) return `Сегодня, ${date}`;
  if (diff === 1) return `Завтра, ${date}`;
  const weekday = d.toLocaleDateString("ru-RU", { weekday: "long" });
  return `${weekday[0]?.toUpperCase() ?? ""}${weekday.slice(1)}, ${date}`;
}

function groupRidesByDepartureDay(
  rides: Ride[],
): Array<{ key: string; label: string; rides: Ride[] }> {
  const groups = new Map<string, { key: string; label: string; rides: Ride[] }>();
  for (const ride of rides) {
    const key = dayKey(ride.departure_at);
    const group = groups.get(key) ?? { key, label: feedDayLabel(ride.departure_at), rides: [] };
    group.rides.push(ride);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function FeedView({ filters, density, onRidesCount, onFeedMeta }: FeedViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const mapRideGroup = (
    location.state as
      | { mapRideGroup?: { rideIds?: string[]; fromLabel?: string; count?: number } }
      | null
      | undefined
  )?.mapRideGroup;
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useRides(
    filters.datePreset,
    filters.fromAt,
    filters.toAt,
    filters.fromLat !== null && filters.fromLng !== null
      ? { fromLat: filters.fromLat, fromLng: filters.fromLng, radiusKm: filters.radiusKm }
      : null,
  );
  useRealtime();
  const me = useMe();
  const myUserId = me.status === "ok" ? me.user.id : null;
  const requestMap = useMyRideRequests();
  const [viewedRides, setViewedRides] = useState<Set<string>>(readViewedRideIds);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const filteredRides = useMemo(() => {
    const base = applyFilters(data?.rides ?? [], filters, undefined, myUserId);
    const groupIds = new Set(mapRideGroup?.rideIds ?? []);
    if (!groupIds.size) return base;
    return base.filter((ride) => groupIds.has(ride.id));
  }, [data, filters, myUserId, mapRideGroup?.rideIds]);

  const rideGroups = useMemo(() => groupRidesByDepartureDay(filteredRides), [filteredRides]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: onRidesCount is a stable callback ref
  useEffect(() => {
    onRidesCount?.(filteredRides.length);
  }, [filteredRides.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: parent owns the callback identity
  useEffect(() => {
    onFeedMeta?.({
      isFetching,
      dataUpdatedAt,
      refetch: () => refetchRef.current(),
    });
  }, [isFetching, dataUpdatedAt]);

  const trustOn =
    filters.trustMinAccountAgeDays > 0 || filters.trustMinLikes > 0 || filters.verifiedOnly;

  const handleCardClick = (ride: Ride) => {
    setViewedRides((prev) => markRideViewed(ride.id, prev));
    navigate(`/rides/${ride.id}`);
  };

  if (isPending) {
    return (
      <div
        data-testid="loading-skeleton"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
          background: "var(--brand-bg)",
        }}
      >
        <p style={{ color: "var(--brand-sub)", fontSize: 14 }}>Загрузка...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
          padding: 16,
          background: "var(--brand-bg)",
        }}
      >
        <p style={{ color: "var(--brand-danger)", fontSize: 14 }}>Ошибка: что-то пошло не так</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "var(--brand-bg)" }}>
      {trustOn && (
        <div
          style={{
            margin: "10px 16px 0",
            padding: "10px 12px",
            borderRadius: 12,
            background: "var(--brand-primary-tint)",
            color: "var(--brand-primary)",
            fontSize: 12.5,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="shield" size={14} />
          Активны фильтры доверия
        </div>
      )}

      {mapRideGroup?.rideIds?.length ? (
        <div
          data-testid="map-group-filter"
          style={{
            margin: "10px 16px 0",
            padding: "10px 12px",
            borderRadius: 12,
            background: "var(--brand-primary-tint)",
            color: "var(--brand-primary)",
            fontSize: 12.5,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>
            Группа с карты: {mapRideGroup.rideIds.length} {pluralRides(mapRideGroup.rideIds.length)}
          </span>
          <button
            type="button"
            onClick={() => navigate("/", { replace: true, state: null })}
            style={{
              border: "none",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Сбросить
          </button>
        </div>
      ) : null}

      <div
        data-testid="ride-list"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: density === "compact" ? 3 : 8,
          padding: "12px 16px 24px",
        }}
      >
        {!filteredRides.length ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div
              style={{ fontSize: 15, fontWeight: 600, color: "var(--brand-text)", marginBottom: 4 }}
            >
              Ничего не найдено
            </div>
            <div style={{ fontSize: 13, color: "var(--brand-sub)" }}>
              Попробуйте изменить фильтры
            </div>
          </div>
        ) : density === "cozy" ? (
          rideGroups.map((group) => (
            <section key={group.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                data-testid="feed-day-heading"
                style={{
                  padding: "3px 2px 8px",
                  color: "var(--brand-sub)",
                  fontSize: 13,
                  fontWeight: 650,
                  lineHeight: 1.2,
                }}
              >
                {group.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {group.rides.map((ride) => (
                  <RideCard
                    key={ride.id}
                    ride={ride}
                    density={density}
                    onClick={handleCardClick}
                    cardState={getRideCardState(ride, myUserId, requestMap, viewedRides)}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          filteredRides.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              density={density}
              onClick={handleCardClick}
              cardState={getRideCardState(ride, myUserId, requestMap, viewedRides)}
            />
          ))
        )}
      </div>
    </div>
  );
}
