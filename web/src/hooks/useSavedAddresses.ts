import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { getTelegramWebApp } from "../lib/telegram";
import { decodeJwtSub, getTokens } from "../lib/tokenStore";

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

  const tgUser = getTelegramWebApp()?.initDataUnsafe?.user as { id?: number } | undefined;
  const tgId = tgUser?.id;
  const accessToken = getTokens()?.access;
  const tokenSub = accessToken ? decodeJwtSub(accessToken) : null;
  const userScope = tgId ?? tokenSub ?? "anonymous";
  const savedAddressesKey = queryKeys.savedAddresses.byTelegramUser(userScope);

  const query = useQuery({
    queryKey: savedAddressesKey,
    queryFn: () => apiFetch<SavedAddress[]>("/saved-addresses"),
    staleTime: 5 * 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateInput) =>
      apiFetch<SavedAddress>("/saved-addresses", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedAddressesKey }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...input }: UpdateInput & { id: string }) =>
      apiFetch<SavedAddress>(`/saved-addresses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedAddressesKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/saved-addresses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedAddressesKey }),
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
