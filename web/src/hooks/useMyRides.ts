import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { Ride } from "../types/ride";

export type MyRidesRole = "driver" | "passenger";
export type MyRidesWhen = "future" | "past";

interface MyRidesResponse {
  rides: Ride[];
}

export function useMyRides(role: MyRidesRole, when: MyRidesWhen) {
  return useQuery({
    queryKey: queryKeys.rides.mine(role, when),
    queryFn: () => apiFetch<MyRidesResponse>(`/rides/mine?role=${role}&when=${when}`),
  });
}
