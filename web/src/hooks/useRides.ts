import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { Ride } from "../types/ride";
import type { DatePreset } from "./useFilters";
import { resolveDateRange } from "./useFilters";

export interface RidesResponse {
  rides: Ride[];
  nextCursor: string | null;
}

export function useRides(
  preset: DatePreset,
  customFromAt: string | null = null,
  customToAt: string | null = null,
) {
  return useQuery({
    queryKey: queryKeys.rides.list(preset, customFromAt, customToAt),
    queryFn: () => {
      const { fromAt, toAt } = resolveDateRange({
        datePreset: preset,
        fromAt: customFromAt,
        toAt: customToAt,
      });
      const params = new URLSearchParams();
      if (fromAt) params.set("fromAt", fromAt);
      if (toAt) params.set("toAt", toAt);
      return apiFetch<RidesResponse>(`/rides?${params.toString()}`);
    },
    staleTime: 20_000,
    // refetchInterval убран — SSE (useRealtime) инвалидирует при изменениях,
    // при обрыве SSE его fallback polling делает то же каждые 30s
  });
}
