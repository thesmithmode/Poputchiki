import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER = {
  id: "aa000000-0000-4000-a000-000000000001",
  tg_id: 10001,
  display_name: "Антон Тест",
  role: "user",
  is_verified: true,
  onboarded: true,
  created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  likes_received_count: 0,
  stats: { rides_as_driver_completed: 2, rides_as_passenger: 1 },
};

const RIDE = {
  id: "cc000000-0000-4000-a000-000000000003",
  driver_id: USER.id,
  driver: {
    id: USER.id,
    tg_id: USER.tg_id,
    first_name: "Антон",
    last_name: "Тест",
    likes_received_count: 0,
    created_at: USER.created_at,
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
  comment: "",
  passengers: [],
  created_at: new Date().toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockTelegram(tgId: number, firstName: string) {
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

async function setupPage(
  page: import("@playwright/test").Page,
  overrides?: Record<string, unknown>,
) {
  await page.addInitScript(mockTelegram(USER.tg_id, "Антон"));
  await page.route("**/api/users/me", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...USER, ...overrides }),
    }),
  );
}

async function checkAxe(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .disableRules(["color-contrast"]) // requires rendered pixel colors, unreliable in headless
    .analyze();
  expect(results.violations).toEqual([]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("A11y: WCAG AA на критических flow", () => {
  test("FeedScreen — нет a11y нарушений", async ({ page }) => {
    await setupPage(page);
    await page.route("**/api/rides**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rides: [RIDE], nextCursor: null }),
      }),
    );
    await page.route("**/api/favorites**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );

    await page.goto("/");
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 8_000 });
    // wait for feed to render
    await page.waitForTimeout(500);

    await checkAxe(page);
  });

  test("RideDetailScreen — нет a11y нарушений", async ({ page }) => {
    await setupPage(page);
    await page.route(`**/api/rides/${RIDE.id}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(RIDE),
      }),
    );
    await page.route("**/api/ride-requests**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await page.route("**/api/favorites**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );

    await page.goto(`/#/rides/${RIDE.id}`);
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(500);

    await checkAxe(page);
  });

  test("ProfileScreen — нет a11y нарушений", async ({ page }) => {
    await setupPage(page);
    await page.route(`**/api/users/${USER.id}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(USER),
      }),
    );
    await page.route("**/api/favorites**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );

    await page.goto(`/#/users/${USER.id}`);
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(500);

    await checkAxe(page);
  });

  test("CreateRideScreen — нет a11y нарушений", async ({ page }) => {
    await setupPage(page);
    await page.route("**/api/rides**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rides: [], nextCursor: null }),
      }),
    );
    await page.route("**/api/ride-templates**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );

    await page.goto("/#/rides/new");
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(500);

    await checkAxe(page);
  });

  test("SettingsScreen — нет a11y нарушений", async ({ page }) => {
    await setupPage(page);

    await page.goto("/#/settings");
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(500);

    await checkAxe(page);
  });

  test("NotFoundPage — нет a11y нарушений", async ({ page }) => {
    await setupPage(page);

    await page.goto("/#/nonexistent-route-xyz");
    await expect(page.getByTestId("not-found")).toBeVisible({ timeout: 8_000 });

    await checkAxe(page);
  });
});
