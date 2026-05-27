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

export interface PassengerCoords {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}

export function useRides(
  preset: DatePreset,
  customFromAt: string | null = null,
  customToAt: string | null = null,
  passengerCoords: PassengerCoords | null = null,
) {
  return useQuery({
    queryKey: queryKeys.rides.list(preset, customFromAt, customToAt, passengerCoords),
    queryFn: () => {
      const { fromAt, toAt } = resolveDateRange({
        datePreset: preset,
        fromAt: customFromAt,
        toAt: customToAt,
      });
      const params = new URLSearchParams();
      if (fromAt) params.set("fromAt", fromAt);
      if (toAt) params.set("toAt", toAt);
      if (passengerCoords) {
        params.set("passengerFromLat", String(passengerCoords.fromLat));
        params.set("passengerFromLng", String(passengerCoords.fromLng));
        params.set("passengerToLat", String(passengerCoords.toLat));
        params.set("passengerToLng", String(passengerCoords.toLng));
      }
      return apiFetch<RidesResponse>(`/rides?${params.toString()}`);
    },
    staleTime: 20_000,
  });
}
