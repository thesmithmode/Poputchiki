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

export interface NearbyFromCoords {
  fromLat: number;
  fromLng: number;
  radiusKm: number;
}

export function useRides(
  preset: DatePreset,
  customFromAt: string | null = null,
  customToAt: string | null = null,
  spatialCoords: PassengerCoords | NearbyFromCoords | null = null,
) {
  return useQuery({
    queryKey: queryKeys.rides.list(preset, customFromAt, customToAt, spatialCoords),
    queryFn: () => {
      const { fromAt, toAt } = resolveDateRange({
        datePreset: preset,
        fromAt: customFromAt,
        toAt: customToAt,
      });
      const params = new URLSearchParams();
      if (fromAt) params.set("fromAt", fromAt);
      if (toAt) params.set("toAt", toAt);
      if (spatialCoords) {
        if ("toLat" in spatialCoords) {
          params.set("passengerFromLat", String(spatialCoords.fromLat));
          params.set("passengerFromLng", String(spatialCoords.fromLng));
          params.set("passengerToLat", String(spatialCoords.toLat));
          params.set("passengerToLng", String(spatialCoords.toLng));
        } else {
          params.set("fromLat", String(spatialCoords.fromLat));
          params.set("fromLng", String(spatialCoords.fromLng));
          params.set("radiusKm", String(spatialCoords.radiusKm));
        }
      }
      return apiFetch<RidesResponse>(`/rides?${params.toString()}`);
    },
    staleTime: 20_000,
  });
}
