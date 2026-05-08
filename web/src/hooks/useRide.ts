import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { Ride } from "../types/ride";

export interface RideDriver {
  id: string;
  first_name: string;
  last_name: string | null;
  tg_id: number;
  likes_received_count: number;
  created_at: string;
}

export interface RidePassenger {
  id: string;
  first_name: string;
  last_name: string | null;
  tg_id: number;
  likes_received_count: number;
}

export interface RideDetail extends Ride {
  driver: RideDriver;
  passengers: RidePassenger[];
}

export function useRide(id: string) {
  return useQuery({
    queryKey: ["ride", id],
    queryFn: () => apiFetch<RideDetail>(`/rides/${id}`),
    enabled: !!id,
  });
}
