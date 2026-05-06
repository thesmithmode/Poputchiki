import { expect, test } from "@playwright/test";

const MOCK_USER = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  tg_id: 123456789,
  display_name: "Тест Пользователь",
  role: "user",
  is_verified: false,
  onboarded: true,
  created_at: new Date().toISOString(),
};

const MOCK_RIDE = {
  id: "660e8400-e29b-41d4-a716-446655440001",
  driver_id: MOCK_USER.id,
  from_label: "ЖК Царёво",
  from_lat: 55.75,
  from_lng: 37.61,
  to_label: "Москва Центр",
  to_lat: 55.8,
  to_lng: 37.65,
  departure_at: new Date(Date.now() + 86_400_000).toISOString(),
  price_rub: null,
  seats_total: 3,
  seats_taken: 0,
  status: "active",
  comment: null,
  created_at: new Date().toISOString(),
};

test.beforeEach(async ({ page }) => {
  // Telegram WebApp mock — inject before page scripts run
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).Telegram = {
      WebApp: {
        colorScheme: "light",
        initData: "mock_init_data",
        initDataUnsafe: { user: { id: 123456789, first_name: "Тест" } },
        ready: () => {},
        onEvent: () => {},
        expand: () => {},
      },
    };
  });

  // Mock /api/users/me
  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_USER),
    }),
  );

  // Mock GET /api/rides — empty feed initially
  await page.route("**/api/rides**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rides: [], nextCursor: null }),
      });
    } else {
      await route.continue();
    }
  });
});

test("пользователь видит ленту и создаёт поездку", async ({ page }) => {
  // 1. Открываем приложение
  await page.goto("/");

  // 2. Ждём загрузки ленты
  await expect(page.getByText("Загрузка...")).not.toBeVisible({ timeout: 5_000 });

  // 3. Переходим к форме создания поездки
  await page.goto("/#/rides/new");
  await page.waitForURL("**/#/rides/new");

  // 4. Ждём появления формы
  const inputFrom = page.getByTestId("input-from");
  const inputTo = page.getByTestId("input-to");
  await expect(inputFrom).toBeVisible({ timeout: 5_000 });
  await expect(inputTo).toBeVisible();

  // 5. Заполняем обязательные поля
  await inputFrom.fill("ЖК Царёво");
  await inputTo.fill("Москва Центр");

  // Дата — завтра
  const tomorrow = new Date(Date.now() + 86_400_000);
  const dateStr = tomorrow.toISOString().split("T")[0] ?? "";
  const timeStr = "10:00";

  const dateInput = page.locator('input[type="date"]').first();
  const timeInput = page.locator('input[type="time"]').first();
  await dateInput.fill(dateStr);
  await timeInput.fill(timeStr);

  // 6. Перехватываем POST /api/rides
  let postCalled = false;
  await page.route("**/api/rides", async (route) => {
    if (route.request().method() === "POST") {
      postCalled = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RIDE),
      });
    } else {
      await route.continue();
    }
  });

  // После создания лента вернёт новую поездку
  await page.unroute("**/api/rides**");
  await page.route("**/api/rides**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rides: [MOCK_RIDE], nextCursor: null }),
      });
    } else if (route.request().method() === "POST") {
      postCalled = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RIDE),
      });
    } else {
      await route.continue();
    }
  });

  // 7. Отправляем форму
  const submitBtn = page.getByTestId("submit-btn");
  await expect(submitBtn).toBeVisible();
  await submitBtn.click();

  // 8. После submit — редирект на ленту
  await page.waitForURL("**/#/", { timeout: 5_000 });

  // 9. Проверяем что POST был вызван
  expect(postCalled).toBe(true);

  // 10. Поездка видна в ленте
  await expect(page.getByText("ЖК Царёво")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Москва Центр")).toBeVisible();
});
