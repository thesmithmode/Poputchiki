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

export interface PendingRequest {
  id: string;
  passenger_id: string;
  first_name: string;
  tg_id: number;
}

export interface RideDetail extends Ride {
  driver: RideDriver;
  passengers: RidePassenger[];
  pending_requests: PendingRequest[];
  my_request_status: "pending" | "accepted" | "rejected" | "cancelled" | null;
}

export function useRide(id: string) {
  return useQuery({
    queryKey: ["ride", id],
    queryFn: () => apiFetch<RideDetail>(`/rides/${id}`),
    enabled: !!id,
  });
}
