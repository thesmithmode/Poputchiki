export function formatRouteDuration(durationS: number | null | undefined): string | null {
  if (durationS == null || durationS <= 0) return null;
  const minutes = Math.max(1, Math.ceil(durationS / 60));
  if (minutes < 60) return `~${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `~${hours} ч ${restMinutes} мин` : `~${hours} ч`;
}

export function formatRouteDistance(distanceM: number | null | undefined): string | null {
  if (distanceM == null || distanceM <= 0) return null;
  return distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} км` : `${distanceM} м`;
}

export function formatRouteMetrics(
  distanceM: number | null | undefined,
  durationS: number | null | undefined,
): string | null {
  const distance = formatRouteDistance(distanceM);
  const duration = formatRouteDuration(durationS);
  if (distance && duration) return `${distance} · ${duration}`;
  return duration ?? distance;
}
