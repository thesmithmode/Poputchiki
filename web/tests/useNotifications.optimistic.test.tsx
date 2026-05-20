import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserNotification } from "../src/hooks/useNotifications";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "../src/hooks/useNotifications";
import { queryKeys } from "../src/lib/queryKeys";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

const NOTIF_A: UserNotification = {
  id: "11111111-1111-1111-1111-111111111111",
  category: "ride_request",
  ride_id: null,
  data: null,
  is_read: false,
  created_at: new Date().toISOString(),
};
const NOTIF_B: UserNotification = {
  id: "22222222-2222-2222-2222-222222222222",
  category: "system",
  ride_id: null,
  data: null,
  is_read: false,
  created_at: new Date().toISOString(),
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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useMarkNotificationRead — optimistic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("оптимистично ставит is_read=true для одного id до резолва POST", async () => {
    const { client, Wrapper } = makeWrapper();
    client.setQueryData(queryKeys.notifications.all, { notifications: [NOTIF_A, NOTIF_B] });

    const post = deferred<{ ok: true }>();
    mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate(NOTIF_A.id);
    });

    await waitFor(() => {
      const data = client.getQueryData<{ notifications: UserNotification[] }>(
        queryKeys.notifications.all,
      );
      const a = data?.notifications.find((n) => n.id === NOTIF_A.id);
      const b = data?.notifications.find((n) => n.id === NOTIF_B.id);
      expect(a?.is_read).toBe(true);
      expect(b?.is_read).toBe(false);
    });

    post.resolve({ ok: true });
  });

  it("на ошибку POST откатывает is_read", async () => {
    const { client, Wrapper } = makeWrapper();
    client.setQueryData(queryKeys.notifications.all, { notifications: [NOTIF_A] });

    const post = deferred<{ ok: true }>();
    mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate(NOTIF_A.id);
    });

    await waitFor(() => {
      const data = client.getQueryData<{ notifications: UserNotification[] }>(
        queryKeys.notifications.all,
      );
      expect(data?.notifications[0]?.is_read).toBe(true);
    });

    post.reject(new Error("network"));

    await waitFor(() => {
      const data = client.getQueryData<{ notifications: UserNotification[] }>(
        queryKeys.notifications.all,
      );
      expect(data?.notifications[0]?.is_read).toBe(false);
    });
  });
});

describe("useMarkAllNotificationsRead — optimistic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("оптимистично ставит is_read=true всем до резолва POST", async () => {
    const { client, Wrapper } = makeWrapper();
    client.setQueryData(queryKeys.notifications.all, { notifications: [NOTIF_A, NOTIF_B] });

    const post = deferred<{ ok: true }>();
    mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => {
      const data = client.getQueryData<{ notifications: UserNotification[] }>(
        queryKeys.notifications.all,
      );
      expect(data?.notifications.every((n) => n.is_read)).toBe(true);
    });

    post.resolve({ ok: true });
  });

  it("на ошибку откатывает все is_read к исходным", async () => {
    const { client, Wrapper } = makeWrapper();
    client.setQueryData(queryKeys.notifications.all, {
      notifications: [NOTIF_A, { ...NOTIF_B, is_read: true }],
    });

    const post = deferred<{ ok: true }>();
    mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate();
    });
    await waitFor(() => {
      const data = client.getQueryData<{ notifications: UserNotification[] }>(
        queryKeys.notifications.all,
      );
      expect(data?.notifications.every((n) => n.is_read)).toBe(true);
    });

    post.reject(new Error("network"));

    await waitFor(() => {
      const data = client.getQueryData<{ notifications: UserNotification[] }>(
        queryKeys.notifications.all,
      );
      const a = data?.notifications.find((n) => n.id === NOTIF_A.id);
      const b = data?.notifications.find((n) => n.id === NOTIF_B.id);
      expect(a?.is_read).toBe(false);
      expect(b?.is_read).toBe(true);
    });
  });
});
