import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../src/lib/queryKeys";
import { NotificationPreferencesScreen } from "../src/screens/NotificationPreferencesScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

type Prefs = {
  ride_request: boolean;
  ride_cancelled: boolean;
  confirm_participation: boolean;
  like_received: boolean;
  review_received: boolean;
  favorite_new_ride: boolean;
  support_reply: boolean;
  system: boolean;
};

const DEFAULT_PREFS: Prefs = {
  ride_request: true,
  ride_cancelled: true,
  confirm_participation: true,
  like_received: true,
  review_received: true,
  favorite_new_ride: true,
  support_reply: true,
  system: true,
};

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        // Infinity — иначе invalidateQueries на onSettled триггерит refetch с
        // незамоканным apiFetch, и возврат undefined затирает rollback,
        // делая тест rollback недетерминированным.
        staleTime: Number.POSITIVE_INFINITY,
      },
      mutations: { retry: false },
    },
  });
}

function renderScreen(client: QueryClient) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <NotificationPreferencesScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
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

describe("NotificationPreferencesScreen — optimistic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("toggle одной категории мгновенно меняет значение в кэше до резолва PUT", async () => {
    const client = makeClient();
    client.setQueryData<Prefs>(queryKeys.notifPrefs.all, DEFAULT_PREFS);

    const put = deferred<Prefs>();
    mockedApiFetch.mockReturnValueOnce(put.promise as Promise<unknown>);

    renderScreen(client);

    await waitFor(() => {
      expect(screen.getByTestId("toggle-like_received")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("toggle-like_received"));

    // Cache мгновенно обновлён ДО резолва PUT
    await waitFor(() => {
      const data = client.getQueryData<Prefs>(queryKeys.notifPrefs.all);
      expect(data?.like_received).toBe(false);
      expect(data?.ride_request).toBe(true);
    });

    put.resolve({ ...DEFAULT_PREFS, like_received: false });
  });

  it("на ошибку PUT откатывает значение в кэше", async () => {
    const client = makeClient();
    client.setQueryData<Prefs>(queryKeys.notifPrefs.all, DEFAULT_PREFS);

    const put = deferred<Prefs>();
    mockedApiFetch.mockReturnValueOnce(put.promise as Promise<unknown>);

    renderScreen(client);
    await waitFor(() => {
      expect(screen.getByTestId("toggle-like_received")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("toggle-like_received"));
    await waitFor(() => {
      expect(client.getQueryData<Prefs>(queryKeys.notifPrefs.all)?.like_received).toBe(false);
    });

    put.reject(new Error("network"));

    await waitFor(() => {
      expect(client.getQueryData<Prefs>(queryKeys.notifPrefs.all)?.like_received).toBe(true);
    });
  });

  it("muteAll мгновенно отключает все мутабельные категории до резолва PUT", async () => {
    const client = makeClient();
    client.setQueryData<Prefs>(queryKeys.notifPrefs.all, DEFAULT_PREFS);

    const put = deferred<Prefs>();
    mockedApiFetch.mockReturnValueOnce(put.promise as Promise<unknown>);

    renderScreen(client);
    await waitFor(() => {
      expect(screen.getByTestId("toggle-global-mute")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("toggle-global-mute"));

    await waitFor(() => {
      const data = client.getQueryData<Prefs>(queryKeys.notifPrefs.all);
      expect(data?.ride_request).toBe(false);
      expect(data?.like_received).toBe(false);
      expect(data?.system).toBe(true);
    });

    put.resolve({
      ...DEFAULT_PREFS,
      ride_request: false,
      ride_cancelled: false,
      confirm_participation: false,
      like_received: false,
      review_received: false,
      favorite_new_ride: false,
      support_reply: false,
    });
  });

  it("на ошибку muteAll откатывает все категории", async () => {
    const client = makeClient();
    client.setQueryData<Prefs>(queryKeys.notifPrefs.all, DEFAULT_PREFS);

    const put = deferred<Prefs>();
    mockedApiFetch.mockReturnValueOnce(put.promise as Promise<unknown>);

    renderScreen(client);
    await waitFor(() => {
      expect(screen.getByTestId("toggle-global-mute")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("toggle-global-mute"));
    await waitFor(() => {
      expect(client.getQueryData<Prefs>(queryKeys.notifPrefs.all)?.ride_request).toBe(false);
    });

    put.reject(new Error("network"));

    await waitFor(() => {
      const data = client.getQueryData<Prefs>(queryKeys.notifPrefs.all);
      expect(data?.ride_request).toBe(true);
      expect(data?.like_received).toBe(true);
    });
  });
});
