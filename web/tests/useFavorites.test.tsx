import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoriteEntry } from "../src/hooks/useFavorites";
import { useFavorites } from "../src/hooks/useFavorites";
import { queryKeys } from "../src/lib/queryKeys";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

const TARGET_ID = "550e8400-e29b-41d4-a716-446655440020";
const OTHER_ID = "550e8400-e29b-41d4-a716-446655440099";

const MOCK_FAV: FavoriteEntry = {
  target_id: TARGET_ID,
  notify: true,
  created_at: new Date().toISOString(),
  display_name: "Иван Иванов",
  tg_username: "ivan",
  avatar_url: null,
};

const OTHER_FAV: FavoriteEntry = {
  target_id: OTHER_ID,
  notify: false,
  created_at: new Date().toISOString(),
  display_name: "Пётр",
  tg_username: null,
  avatar_url: null,
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

/**
 * Deferred-промис: возвращает {promise, resolve, reject}.
 * Позволяет проверять optimistic-состояние ДО разрешения мутации.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useFavorites — optimistic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("toggle: remove (уже в избранном)", () => {
    it("оптимистично убирает запись из cache до резолва DELETE", async () => {
      const { client, Wrapper } = makeWrapper();
      client.setQueryData<FavoriteEntry[]>(queryKeys.favorites.all, [MOCK_FAV, OTHER_FAV]);

      const del = deferred<void>();
      // initial GET /favorites/me не делаем — staleTime=0 и data есть
      mockedApiFetch.mockReturnValueOnce(del.promise as Promise<unknown>);

      const { result } = renderHook(() => useFavorites(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.favorites).toHaveLength(2));

      act(() => {
        result.current.toggle(TARGET_ID);
      });

      // Optimistic: cache уже без MOCK_FAV до резолва DELETE
      await waitFor(() => {
        const data = client.getQueryData<FavoriteEntry[]>(queryKeys.favorites.all);
        expect(data?.find((f) => f.target_id === TARGET_ID)).toBeUndefined();
        expect(data?.find((f) => f.target_id === OTHER_ID)).toBeDefined();
      });

      del.resolve();
    });

    it("на ошибку DELETE откатывает кэш из snapshot", async () => {
      const { client, Wrapper } = makeWrapper();
      client.setQueryData<FavoriteEntry[]>(queryKeys.favorites.all, [MOCK_FAV]);

      const del = deferred<void>();
      mockedApiFetch.mockReturnValueOnce(del.promise as Promise<unknown>);

      const { result } = renderHook(() => useFavorites(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.favorites).toHaveLength(1));

      act(() => {
        result.current.toggle(TARGET_ID);
      });

      // Сразу — оптимистично удалено
      await waitFor(() => {
        expect(client.getQueryData<FavoriteEntry[]>(queryKeys.favorites.all)).toEqual([]);
      });

      del.reject(new Error("network"));

      // Rollback — запись возвращена
      await waitFor(() => {
        const data = client.getQueryData<FavoriteEntry[]>(queryKeys.favorites.all);
        expect(data?.[0]?.target_id).toBe(TARGET_ID);
      });
    });
  });

  describe("toggle: add (ещё не в избранном)", () => {
    it("оптимистично добавляет placeholder с hint до резолва POST", async () => {
      const { client, Wrapper } = makeWrapper();
      client.setQueryData<FavoriteEntry[]>(queryKeys.favorites.all, []);

      const post = deferred<void>();
      mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

      const { result } = renderHook(() => useFavorites(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.favorites).toEqual([]));

      act(() => {
        result.current.toggle(TARGET_ID, {
          display_name: "Иван",
          tg_username: "ivan",
          avatar_url: null,
        });
      });

      await waitFor(() => {
        const data = client.getQueryData<FavoriteEntry[]>(queryKeys.favorites.all);
        const added = data?.find((f) => f.target_id === TARGET_ID);
        expect(added).toBeDefined();
        expect(added?.display_name).toBe("Иван");
        expect(added?.tg_username).toBe("ivan");
        expect(added?.notify).toBe(true);
      });

      // isFavorite учитывает оптимистично добавленный id
      expect(result.current.isFavorite(TARGET_ID)).toBe(true);

      post.resolve();
    });

    it("на ошибку POST откатывает добавленную запись", async () => {
      const { client, Wrapper } = makeWrapper();
      client.setQueryData<FavoriteEntry[]>(queryKeys.favorites.all, []);

      const post = deferred<void>();
      mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

      const { result } = renderHook(() => useFavorites(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.favorites).toEqual([]));

      act(() => {
        result.current.toggle(TARGET_ID);
      });
      await waitFor(() => {
        expect(client.getQueryData<FavoriteEntry[]>(queryKeys.favorites.all)).toHaveLength(1);
      });

      post.reject(new Error("network"));

      await waitFor(() => {
        expect(client.getQueryData<FavoriteEntry[]>(queryKeys.favorites.all)).toEqual([]);
      });
    });

    it("без hint placeholder создаётся с пустыми полями профиля", async () => {
      const { client, Wrapper } = makeWrapper();
      client.setQueryData<FavoriteEntry[]>(queryKeys.favorites.all, []);

      const post = deferred<void>();
      mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

      const { result } = renderHook(() => useFavorites(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.favorites).toEqual([]));

      act(() => {
        result.current.toggle(TARGET_ID);
      });

      await waitFor(() => {
        const added = client
          .getQueryData<FavoriteEntry[]>(queryKeys.favorites.all)
          ?.find((f) => f.target_id === TARGET_ID);
        expect(added).toBeDefined();
        expect(added?.display_name).toBe("");
        expect(added?.tg_username).toBeNull();
        expect(added?.avatar_url).toBeNull();
        expect(added?.notify).toBe(true);
      });

      post.resolve();
    });
  });

  describe("setNotify", () => {
    it("оптимистично меняет notify до резолва PATCH", async () => {
      const { client, Wrapper } = makeWrapper();
      client.setQueryData<FavoriteEntry[]>(queryKeys.favorites.all, [MOCK_FAV]);

      const patch = deferred<void>();
      mockedApiFetch.mockReturnValueOnce(patch.promise as Promise<unknown>);

      const { result } = renderHook(() => useFavorites(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.favorites[0]?.notify).toBe(true));

      act(() => {
        result.current.setNotify(TARGET_ID, false);
      });

      await waitFor(() => {
        const data = client.getQueryData<FavoriteEntry[]>(queryKeys.favorites.all);
        expect(data?.[0]?.notify).toBe(false);
      });

      patch.resolve();
    });

    it("на ошибку PATCH откатывает notify", async () => {
      const { client, Wrapper } = makeWrapper();
      client.setQueryData<FavoriteEntry[]>(queryKeys.favorites.all, [MOCK_FAV]);

      const patch = deferred<void>();
      mockedApiFetch.mockReturnValueOnce(patch.promise as Promise<unknown>);

      const { result } = renderHook(() => useFavorites(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.favorites[0]?.notify).toBe(true));

      act(() => {
        result.current.setNotify(TARGET_ID, false);
      });
      await waitFor(() => {
        expect(client.getQueryData<FavoriteEntry[]>(queryKeys.favorites.all)?.[0]?.notify).toBe(
          false,
        );
      });

      patch.reject(new Error("network"));

      await waitFor(() => {
        expect(client.getQueryData<FavoriteEntry[]>(queryKeys.favorites.all)?.[0]?.notify).toBe(
          true,
        );
      });
    });
  });
});
