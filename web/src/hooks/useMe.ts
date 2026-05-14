import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { getTelegramWebApp } from "../lib/telegram";
import { clearTokens, getTokens, setTokens } from "../lib/tokenStore";

export type MeUser = {
  id: string;
  display_name: string;
  onboarded: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  role: "user" | "admin";
};

export type MeState =
  | { status: "loading" }
  | { status: "banned"; reason: string | null; banned_at: string | null }
  | { status: "ok"; user: MeUser }
  | { status: "error"; message: string };

async function telegramAuth(): Promise<string | null> {
  const wa = getTelegramWebApp();
  const initData = wa?.initData ?? "";
  try {
    const auth = await apiFetch<{ access_token: string; refresh_token: string }>("/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData }),
    });
    setTokens(auth.access_token, auth.refresh_token);
    return null;
  } catch (err) {
    if (err instanceof ApiError) {
      const b = err.body as { error?: string } | null;
      return b?.error ?? "auth failed";
    }
    return String(err);
  }
}

async function refreshAuth(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;
  try {
    const result = await apiFetch<{ access_token: string; refresh_token: string }>(
      "/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refresh_token: tokens.refresh }),
      },
    );
    setTokens(result.access_token, result.refresh_token);
    return true;
  } catch {
    return false;
  }
}

function applyUserState(user: MeUser, setState: (s: MeState) => void): void {
  if (user.is_banned) {
    setState({ status: "banned", reason: user.ban_reason, banned_at: user.banned_at });
  } else {
    setState({ status: "ok", user });
  }
}

export function useMe(): MeState {
  const [state, setState] = useState<MeState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!getTokens()) {
        const authErr = await telegramAuth();
        if (cancelled) return;
        if (authErr !== null) {
          setState({ status: "error", message: authErr });
          return;
        }
      }

      try {
        const user = await apiFetch<MeUser>("/users/me");
        if (!cancelled) applyUserState(user, setState);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          // Try refresh token first — avoids nonce-replay issue with telegramAuth()
          const refreshed = await refreshAuth();
          if (cancelled) return;
          if (refreshed) {
            try {
              const user = await apiFetch<MeUser>("/users/me");
              if (!cancelled) applyUserState(user, setState);
            } catch (err2) {
              if (!cancelled) setState({ status: "error", message: String(err2) });
            }
            return;
          }
          // Refresh failed — clear tokens and re-auth via Telegram initData
          clearTokens();
          const authErr = await telegramAuth();
          if (cancelled) return;
          if (authErr !== null) {
            setState({ status: "error", message: authErr });
            return;
          }
          try {
            const user = await apiFetch<MeUser>("/users/me");
            if (!cancelled) applyUserState(user, setState);
          } catch (err2) {
            if (!cancelled) setState({ status: "error", message: String(err2) });
          }
        } else if (err instanceof ApiError && err.status === 403) {
          const body = err.body as { reason?: string; banned_at?: string } | null;
          setState({
            status: "banned",
            reason: body?.reason ?? null,
            banned_at: body?.banned_at ?? null,
          });
        } else {
          setState({ status: "error", message: String(err) });
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
