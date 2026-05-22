import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

interface RideRequestSummary {
  ride_id: string;
  status: "pending" | "accepted";
}

export function useMyRideRequests(): Map<string, "pending" | "accepted"> {
  const { data } = useQuery({
    queryKey: queryKeys.rideRequests.mine,
    queryFn: () => apiFetch<{ requests: RideRequestSummary[] }>("/ride-requests/mine"),
    staleTime: 60_000,
  });

  return useMemo(
    () =>
      new Map<string, "pending" | "accepted">(
        (data?.requests ?? []).map((r) => [r.ride_id, r.status]),
      ),
    [data],
  );
}
