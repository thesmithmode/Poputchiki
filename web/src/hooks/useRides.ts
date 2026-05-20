import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { Ride } from "../types/ride";

export interface RidesResponse {
  rides: Ride[];
  nextCursor: string | null;
}

export function useRides() {
  return useQuery({
    queryKey: queryKeys.rides.all,
    queryFn: () => apiFetch<RidesResponse>("/rides"),
  });
}
