import { expect, test } from "@playwright/test";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_A = {
  id: "aa000000-0000-4000-a000-000000000001",
  tg_id: 10001,
  display_name: "Антон Водитель",
  role: "user",
  is_verified: true,
  onboarded: true,
  created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
  likes_received_count: 0,
  stats: { rides_as_driver_completed: 5, rides_as_passenger: 2 },
};

const USER_B = {
  id: "bb000000-0000-4000-a000-000000000002",
  tg_id: 10002,
  display_name: "Борис Пассажир",
  role: "user",
  is_verified: true,
  onboarded: true,
  created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  likes_received_count: 0,
  stats: { rides_as_driver_completed: 0, rides_as_passenger: 3 },
};

const RIDE = {
  id: "cc000000-0000-4000-a000-000000000003",
  driver_id: USER_A.id,
  driver: {
    id: USER_A.id,
    tg_id: USER_A.tg_id,
    first_name: "Антон",
    last_name: "Водитель",
    likes_received_count: 0,
    created_at: USER_A.created_at,
  },
  from_label: "ЖК Царёво",
  from_lat: 55.75,
  from_lng: 37.61,
  to_label: "Казань Центр",
  to_lat: 55.8,
  to_lng: 49.1,
  departure_at: new Date(Date.now() + 86_400_000).toISOString(),
  price_rub: 150,
  seats_total: 3,
  seats_taken: 0,
  status: "active",
  comment: "Жду у шлагбаума",
  passengers: [],
  created_at: new Date().toISOString(),
};

const RIDE_REQUEST = {
  id: "dd000000-0000-4000-a000-000000000004",
  ride_id: RIDE.id,
  passenger_id: USER_B.id,
  status: "pending",
  created_at: new Date().toISOString(),
};

const LIKE = {
  id: "ee000000-0000-4000-a000-000000000005",
  from_user_id: USER_B.id,
  to_user_id: USER_A.id,
  ride_id: RIDE.id,
  created_at: new Date().toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockTelegramAs(tgId: number, firstName: string) {
  return () => {
    (window as unknown as Record<string, unknown>).Telegram = {
      WebApp: {
        colorScheme: "light",
        initData: `user=${encodeURIComponent(JSON.stringify({ id: tgId, first_name: firstName }))}&auth_date=${Math.floor(Date.now() / 1000)}&hash=mockhash`,
        initDataUnsafe: { user: { id: tgId, first_name: firstName } },
        themeParams: {},
        ready: () => {},
        onEvent: () => {},
        expand: () => {},
        BackButton: { show: () => {}, hide: () => {}, onClick: () => {}, offClick: () => {} },
        HapticFeedback: {
          impactOccurred: () => {},
          notificationOccurred: () => {},
          selectionChanged: () => {},
        },
      },
    };
  };
}

// ── Test ──────────────────────────────────────────────────────────────────────

test("полный цикл: создание поездки → отклик → подтверждение → лайк", async ({ browser }) => {
  // Two separate browser contexts simulate two distinct users
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    // ── Step 1: User A creates a ride ─────────────────────────────────────────

    await pageA.addInitScript(mockTelegramAs(USER_A.tg_id, "Антон"));

    await pageA.route("**/api/users/me", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(USER_A) }),
    );
    await pageA.route("**/api/rides**", async (r) => {
      if (r.request().method() === "GET") {
        await r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ rides: [], nextCursor: null }),
        });
      } else if (r.request().method() === "POST") {
        await r.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(RIDE),
        });
      } else {
        await r.continue();
      }
    });

    await pageA.goto("/#/rides/new");
    await expect(pageA.getByTestId("input-from")).toBeVisible({ timeout: 5_000 });

    await pageA.getByTestId("input-from").fill("ЖК Царёво");
    await pageA.getByTestId("input-to").fill("Казань Центр");

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0] ?? "";
    await pageA.locator('input[type="date"]').first().fill(tomorrow);
    await pageA.locator('input[type="time"]').first().fill("08:00");

    let postRideCalled = false;
    await pageA.route("**/api/rides", async (r) => {
      if (r.request().method() === "POST") {
        postRideCalled = true;
        await r.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(RIDE),
        });
      } else {
        await r.continue();
      }
    });

    await pageA.getByTestId("submit-btn").click();
    await pageA.waitForURL("**/#/", { timeout: 5_000 });
    expect(postRideCalled).toBe(true);

    // ── Step 2: User B sees feed and responds to ride ─────────────────────────

    await pageB.addInitScript(mockTelegramAs(USER_B.tg_id, "Борис"));

    await pageB.route("**/api/users/me", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(USER_B) }),
    );
    await pageB.route("**/api/rides**", async (r) => {
      const url = r.request().url();
      const method = r.request().method();
      if (method === "GET" && !url.includes("/request") && !url.includes("/confirm")) {
        if (url.match(/rides\/[^/]+$/)) {
          // GET /api/rides/:id
          await r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(RIDE),
          });
        } else {
          // GET /api/rides (feed)
          await r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ rides: [RIDE], nextCursor: null }),
          });
        }
      } else {
        await r.continue();
      }
    });

    await pageB.goto(`/#/rides/${RIDE.id}`);
    await expect(pageB.getByTestId("driver-card")).toBeVisible({ timeout: 5_000 });
    await expect(pageB.getByText("ЖК Царёво")).toBeVisible();
    await expect(pageB.getByText("Казань Центр")).toBeVisible();

    // User B clicks "Откликнуться"
    let requestPosted = false;
    await pageB.route(`**/api/rides/${RIDE.id}/request`, async (r) => {
      if (r.request().method() === "POST") {
        requestPosted = true;
        await r.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(RIDE_REQUEST),
        });
      } else {
        await r.continue();
      }
    });

    const respondBtn = pageB.getByTestId("respond-btn");
    await expect(respondBtn).toBeVisible({ timeout: 5_000 });
    await respondBtn.click();

    // Button changes to "Заявка отправлена"
    await expect(pageB.getByTestId("respond-btn")).toHaveText("Заявка отправлена", {
      timeout: 3_000,
    });
    expect(requestPosted).toBe(true);

    // ── Step 3: User B confirms participation ─────────────────────────────────

    let confirmPosted = false;
    await pageB.route(`**/api/rides/${RIDE.id}/confirm-participation`, async (r) => {
      if (r.request().method() === "POST") {
        confirmPosted = true;
        await r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await r.continue();
      }
    });

    await pageB.goto(`/#/rides/${RIDE.id}/confirm`);
    await expect(pageB.getByTestId("confirm-btn")).toBeVisible({ timeout: 5_000 });
    await pageB.getByTestId("confirm-btn").click();

    // Thank-you modal appears
    await expect(pageB.getByTestId("thank-you-modal")).toBeVisible({ timeout: 3_000 });
    expect(confirmPosted).toBe(true);

    // User B clicks "Оставить отзыв" → navigates to ride detail
    await pageB.getByTestId("leave-review-btn").click();
    await pageB.waitForURL(`**/#/rides/${RIDE.id}`, { timeout: 3_000 });

    // ── Step 4: User B likes User A ───────────────────────────────────────────

    let likePosted = false;
    await pageB.route("**/api/likes", async (r) => {
      if (r.request().method() === "POST") {
        likePosted = true;
        await r.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(LIKE),
        });
      } else {
        await r.continue();
      }
    });

    const likeBtn = pageB.getByTestId("like-driver-btn");
    await expect(likeBtn).toBeVisible({ timeout: 5_000 });
    await likeBtn.click();

    await expect(likeBtn).toHaveText("👍 Лайк поставлен!", { timeout: 3_000 });
    expect(likePosted).toBe(true);

    // ── Step 5: User A sees the like in their profile ─────────────────────────

    const USER_A_WITH_LIKE = {
      ...USER_A,
      likes_received_count: 1,
      stats: { ...USER_A.stats },
    };

    await pageA.route(`**/api/users/${USER_A.id}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(USER_A_WITH_LIKE),
      }),
    );
    // /api/users/me also returns updated like count
    await pageA.unroute("**/api/users/me");
    await pageA.route("**/api/users/me", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(USER_A_WITH_LIKE),
      }),
    );

    await pageA.goto(`/#/users/${USER_A.id}`);
    await expect(pageA.getByTestId("profile-loading")).not.toBeVisible({ timeout: 5_000 });
    // Profile shows the like count
    await expect(pageA.getByText("1")).toBeVisible({ timeout: 5_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
