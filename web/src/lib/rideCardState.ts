import type { Ride } from "../types/ride";

export const VIEWED_RIDES_KEY = "pp_viewed_rides";

export type RideCardState = "own" | "applied" | "approved" | "viewed" | "default";
export type RideRequestStatus = "pending" | "accepted";
export type RideRequestStatusMap = Map<string, RideRequestStatus>;

export function readViewedRideIds(): Set<string> {
  try {
    const raw = localStorage.getItem(VIEWED_RIDES_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

export function markRideViewed(id: string, current: Set<string>): Set<string> {
  const next = new Set<string>(current);
  next.add(id);
  try {
    const arr = [...next].slice(-200);
    localStorage.setItem(VIEWED_RIDES_KEY, JSON.stringify(arr));
    return new Set<string>(arr);
  } catch {
    return next;
  }
}

export function getRideCardState(
  ride: Ride,
  myUserId: string | null,
  requestMap: RideRequestStatusMap,
  viewedRideIds: Set<string>,
): RideCardState {
  if (myUserId && ride.driver_id === myUserId) return "own";
  const reqStatus = requestMap.get(ride.id);
  if (reqStatus === "accepted") return "approved";
  if (reqStatus === "pending") return "applied";
  if (viewedRideIds.has(ride.id)) return "viewed";
  return "default";
}

export function getRideCardBg(state: RideCardState): string {
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

export function getRideCardBorderColor(state: RideCardState): string | undefined {
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

export function getRideBadgeConfig(
  state: RideCardState,
): { label: string; color: string; bg: string } | null {
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
