import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

export interface TemplateSubscription {
  id: string;
  template_id: string;
  passenger_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled" | "revoked";
  active_from: string;
  active_to: string | null;
  message: string | null;
  from_label: string;
  to_label: string;
  departure_time: string;
  weekdays: number[];
  created_at: string;
  updated_at: string;
}

export interface DriverSubscription extends TemplateSubscription {
  passenger_display_name: string;
  passenger_tg_id: number;
}

export function useMySubscriptions() {
  return useQuery({
    queryKey: queryKeys.templateSubscriptions.mine,
    queryFn: () =>
      apiFetch<{ subscriptions: TemplateSubscription[] }>("/template-subscriptions/mine").then(
        (r) => r.subscriptions,
      ),
    staleTime: 30_000,
  });
}

export function useDriverSubscriptions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.templateSubscriptions.driver,
    queryFn: () =>
      apiFetch<{ subscriptions: DriverSubscription[] }>("/template-subscriptions/driver").then(
        (r) => r.subscriptions,
      ),
    staleTime: 30_000,
    enabled,
  });
}

export function useSubscribeMutation(rideId: string, templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { activeTo?: string | null; message?: string }) =>
      apiFetch<TemplateSubscription>("/template-subscriptions", {
        method: "POST",
        body: JSON.stringify({
          template_id: templateId,
          active_to: vars.activeTo,
          message: vars.message,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.templateSubscriptions.mine });
      queryClient.invalidateQueries({ queryKey: queryKeys.ride.detail(rideId) });
    },
  });
}

export function useSubscriptionActionMutation(rideId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      subId,
      action,
    }: { subId: string; action: "accept" | "reject" | "cancel" | "revoke" }) =>
      apiFetch<unknown>(`/template-subscriptions/${subId}/${action}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.templateSubscriptions.mine });
      queryClient.invalidateQueries({ queryKey: queryKeys.templateSubscriptions.driver });
      if (rideId) queryClient.invalidateQueries({ queryKey: queryKeys.ride.detail(rideId) });
    },
  });
}
