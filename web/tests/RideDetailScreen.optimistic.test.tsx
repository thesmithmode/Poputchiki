import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RideDetail } from "../src/hooks/useRide";
import { queryKeys } from "../src/lib/queryKeys";
import { RideDetailScreen } from "../src/screens/RideDetailScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const DRIVER_ID = "550e8400-e29b-41d4-a716-446655440001";
const PASSENGER_ID = "550e8400-e29b-41d4-a716-446655440010";

vi.mock("../src/hooks/useMe", () => ({
  useMe: vi.fn(),
}));

import { useMe } from "../src/hooks/useMe";
import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseMe = vi.mocked(useMe);

const RIDE_ID = "550e8400-e29b-41d4-a716-446655440000";
const REQ_ID = "req-aaaabbbb-0000-0000-0000-000000000001";

const baseRide: RideDetail = {
  id: RIDE_ID,
  driver_id: DRIVER_ID,
  from_label: "ЖК Царёво",
  from_lat: 55.7558,
  from_lng: 37.6173,
  to_label: "ул. Баумана",
  to_lat: 55.7963,
  to_lng: 49.1093,
  departure_at: new Date(Date.now() + 3600000).toISOString(),
  price_rub: 150,
  seats_total: 3,
  seats_taken: 1,
  status: "active",
  comment: null,
  created_at: new Date().toISOString(),
  driver: {
    id: DRIVER_ID,
    first_name: "Иван",
    last_name: "Иванов",
    tg_id: 9999,
    likes_received_count: 5,
    created_at: new Date().toISOString(),
  },
  passengers: [],
  pending_requests: [],
  my_request_id: null,
  my_request_status: null,
  my_subscription_id: null,
  my_subscription_status: null,
};

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        staleTime: Number.POSITIVE_INFINITY,
      },
      mutations: { retry: false },
    },
  });
}

function renderWith(client: QueryClient) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <RideDetailScreen id={RIDE_ID} />
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

describe("RideDetailScreen — optimistic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleRespond (пассажир откликается)", () => {
    beforeEach(() => {
      mockedUseMe.mockReturnValue({
        status: "ok",
        user: {
          id: PASSENGER_ID,
          display_name: "Pass",
          onboarded: true,
          is_banned: false,
          ban_reason: null,
          banned_at: null,
          role: "user",
        },
      });
    });

    it("мгновенно ставит my_request_status='pending' в кэше до резолва POST", async () => {
      const client = makeClient();
      client.setQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID), baseRide);

      const post = deferred<unknown>();
      mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

      renderWith(client);

      const btn = await screen.findByTestId("respond-btn");
      fireEvent.click(btn);

      await waitFor(() => {
        const cached = client.getQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID));
        expect(cached?.my_request_status).toBe("pending");
      });

      post.resolve(undefined);
    });

    it("на ошибку POST откатывает my_request_status к исходному null", async () => {
      const client = makeClient();
      client.setQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID), baseRide);

      const post = deferred<unknown>();
      mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

      renderWith(client);
      const btn = await screen.findByTestId("respond-btn");
      fireEvent.click(btn);

      await waitFor(() => {
        expect(
          client.getQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID))?.my_request_status,
        ).toBe("pending");
      });

      post.reject(new Error("network"));

      await waitFor(() => {
        expect(
          client.getQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID))?.my_request_status,
        ).toBe(null);
      });
    });
  });

  describe("handleRequestAction (driver accept/reject)", () => {
    beforeEach(() => {
      mockedUseMe.mockReturnValue({
        status: "ok",
        user: {
          id: DRIVER_ID,
          display_name: "Driver",
          onboarded: true,
          is_banned: false,
          ban_reason: null,
          banned_at: null,
          role: "user",
        },
      });
    });

    const rideWithRequest: RideDetail = {
      ...baseRide,
      pending_requests: [
        {
          id: REQ_ID,
          passenger_id: PASSENGER_ID,
          first_name: "Пётр",
          tg_id: 1234,
        },
      ],
    };

    it("accept мгновенно убирает request из pending и добавляет в passengers", async () => {
      const client = makeClient();
      client.setQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID), rideWithRequest);

      const post = deferred<unknown>();
      mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

      renderWith(client);
      const acceptBtn = await screen.findByTestId(`accept-${REQ_ID}`);
      fireEvent.click(acceptBtn);

      await waitFor(() => {
        const cached = client.getQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID));
        expect(cached?.pending_requests).toHaveLength(0);
        expect(cached?.passengers).toHaveLength(1);
        expect(cached?.passengers[0]?.id).toBe(PASSENGER_ID);
        expect(cached?.passengers[0]?.first_name).toBe("Пётр");
      });

      post.resolve(undefined);
    });

    it("reject мгновенно убирает request, passengers не трогает", async () => {
      const client = makeClient();
      client.setQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID), rideWithRequest);

      const post = deferred<unknown>();
      mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

      renderWith(client);
      const rejectBtn = await screen.findByTestId(`reject-${REQ_ID}`);
      fireEvent.click(rejectBtn);

      await waitFor(() => {
        const cached = client.getQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID));
        expect(cached?.pending_requests).toHaveLength(0);
        expect(cached?.passengers).toHaveLength(0);
      });

      post.resolve(undefined);
    });

    it("на ошибку accept откатывает оба массива", async () => {
      const client = makeClient();
      client.setQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID), rideWithRequest);

      const post = deferred<unknown>();
      mockedApiFetch.mockReturnValueOnce(post.promise as Promise<unknown>);

      renderWith(client);
      const acceptBtn = await screen.findByTestId(`accept-${REQ_ID}`);
      fireEvent.click(acceptBtn);

      await waitFor(() => {
        expect(
          client.getQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID))?.passengers,
        ).toHaveLength(1);
      });

      post.reject(new Error("network"));

      await waitFor(() => {
        const cached = client.getQueryData<RideDetail>(queryKeys.ride.detail(RIDE_ID));
        expect(cached?.pending_requests).toHaveLength(1);
        expect(cached?.passengers).toHaveLength(0);
      });
    });
  });
});
