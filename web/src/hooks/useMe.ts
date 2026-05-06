import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";

export type MeUser = {
  id: string;
  display_name: string;
  onboarded: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
};

export type MeState =
  | { status: "loading" }
  | { status: "banned"; reason: string | null; banned_at: string | null }
  | { status: "ok"; user: MeUser }
  | { status: "error"; message: string };

export function useMe(): MeState {
  const [state, setState] = useState<MeState>({ status: "loading" });

  useEffect(() => {
    apiFetch<MeUser>("/users/me")
      .then((user) => {
        if (user.is_banned) {
          setState({ status: "banned", reason: user.ban_reason, banned_at: user.banned_at });
        } else {
          setState({ status: "ok", user });
        }
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            setState({ status: "error", message: "unauthorized" });
          } else if (err.status === 403) {
            const body = err.body as { reason?: string; banned_at?: string } | null;
            setState({
              status: "banned",
              reason: body?.reason ?? null,
              banned_at: body?.banned_at ?? null,
            });
          } else {
            setState({ status: "error", message: String(err) });
          }
        } else {
          setState({ status: "error", message: String(err) });
        }
      });
  }, []);

  return state;
}
