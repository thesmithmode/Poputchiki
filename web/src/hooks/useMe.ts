import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { clearMeCache, readMeCache, writeMeCache } from "../lib/meCache";
import { getTelegramWebApp } from "../lib/telegram";
import { clearTokens, decodeJwtSub, getTokens, setTokens } from "../lib/tokenStore";

// useMe orchestrates boot:
// 1. Нет токенов → telegramAuth() через initData.
// 2. apiFetch('/users/me') — apiFetch сам делает refresh на 401 (см. lib/api.ts).
// 3. Если apiFetch вернул 401 (refresh не помог) → clearTokens + telegramAuth() повтор.
// 4. 403 → banned screen.
// Кэш: при наличии валидного кэша (pp_me_v1) начальное состояние = ok без loading-flash.

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

type TelegramAuthResult = { user: MeUser } | { error: string };

function getTgId(): number | undefined {
  const wa = getTelegramWebApp();
  return (wa?.initDataUnsafe?.user as { id?: number } | undefined)?.id;
}

function toMeState(user: MeUser): MeState {
  if (user.is_banned) {
    return { status: "banned", reason: user.ban_reason, banned_at: user.banned_at };
  }
  return { status: "ok", user };
}

function applyUserState(user: MeUser, setState: (s: MeState) => void): void {
  setState(toMeState(user));
}

async function telegramAuth(): Promise<TelegramAuthResult> {
  const wa = getTelegramWebApp();
  const initData = wa?.initData ?? "";
  try {
    const auth = await apiFetch<{
      access_token: string;
      refresh_token: string;
      user?: MeUser;
    }>("/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData }),
    });
    setTokens(auth.access_token, auth.refresh_token);
    if (auth.user) return { user: auth.user };
    return { error: "no user in response" };
  } catch (err) {
    if (err instanceof ApiError) {
      const b = err.body as { error?: string } | null;
      return { error: b?.error ?? "auth failed" };
    }
    return { error: String(err) };
  }
}

export function useMe(): MeState {
  const [state, setState] = useState<MeState>(() => {
    const tgId = getTgId();
    if (tgId !== undefined && getTokens()) {
      const cached = readMeCache<MeUser>(tgId);
      if (cached) return toMeState(cached);
    }
    return { status: "loading" };
  });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const tgId = getTgId();

      // Если сохранённый токен принадлежит другому TG-пользователю — сбросить.
      // Иначе User B, открыв app после User A, видит чужой профиль из localStorage.
      if (tgId !== undefined) {
        const tokens = getTokens();
        if (tokens) {
          const storedSub = decodeJwtSub(tokens.access);
          if (storedSub !== String(tgId)) {
            clearTokens();
            clearMeCache();
          }
        }
      }

      if (!getTokens()) {
        const result = await telegramAuth();
        if (cancelled) return;
        if ("error" in result) {
          setState({ status: "error", message: result.error });
          return;
        }
        if (tgId !== undefined) writeMeCache(result.user, tgId);
        applyUserState(result.user, setState);
        return;
      }

      try {
        const user = await apiFetch<MeUser>("/users/me");
        if (cancelled) return;
        if (tgId !== undefined) writeMeCache(user, tgId);
        applyUserState(user, setState);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          // apiFetch уже пробовал refresh внутри — раз вернулся 401, refresh не помог.
          clearTokens();
          clearMeCache();
          const result = await telegramAuth();
          if (cancelled) return;
          if ("error" in result) {
            setState({ status: "error", message: result.error });
            return;
          }
          if (tgId !== undefined) writeMeCache(result.user, tgId);
          applyUserState(result.user, setState);
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
