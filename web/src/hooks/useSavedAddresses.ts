import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { useMe } from "./useMe";

export interface SavedAddress {
  id: string;
  type: "home" | "work" | "custom";
  name: string;
  address_label: string;
  lat: number;
  lng: number;
  created_at: string;
  updated_at: string;
}

interface CreateInput {
  type: "home" | "work" | "custom";
  name: string;
  address_label: string;
  lat: number;
  lng: number;
}

interface UpdateInput {
  name?: string;
  address_label?: string;
  lat?: number;
  lng?: number;
}

export function useSavedAddresses() {
  const qc = useQueryClient();
  const me = useMe();
  const userId = me.status === "ok" ? me.user.id : "anonymous";
  const queryKey = queryKeys.savedAddresses.byUser(userId);

  const query = useQuery({
    queryKey,
    queryFn: () => apiFetch<SavedAddress[]>("/saved-addresses"),
    staleTime: 5 * 60_000,
    enabled: me.status === "ok",
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateInput) =>
      apiFetch<SavedAddress>("/saved-addresses", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedAddresses.all }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...input }: UpdateInput & { id: string }) =>
      apiFetch<SavedAddress>(`/saved-addresses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedAddresses.all }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/saved-addresses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedAddresses.all }),
  });

  return {
    addresses: query.data ?? [],
    isLoading: query.isLoading,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
