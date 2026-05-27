# Тестирование TG WebApp локально

## Вариант A — Telegram Test Server (рекомендуется)

Telegram предоставляет тестовый сервер где Mini App открывается по `https://` с самоподписанным сертом.

1. В Telegram → Настройки → Дважды нажать «Telegram» → переключиться на Test DC.
2. Создать бота через `@BotFather` на тестовом DC, получить `BOT_TOKEN`.
3. Запустить dev-сервер (HTTP достаточно для теста):
   ```bash
   bun run dev
   ```
4. В BotFather: `/newapp` → указать URL `http://localhost:5173` (тестовый сервер принимает localhost).
5. Открыть Mini App через бота.

**Минус**: нужен отдельный бот и отдельный `.env.test` с тестовым токеном.

---

## Вариант B — HTTPS через mkcert + ngrok/cloudflared

### 1. Настройка локального TLS

```bash
bash scripts/setup-dev-tls.sh
```

Создаёт `.tls/cert.pem` и `.tls/cert-key.pem`. Vite подхватывает автоматически при следующем запуске.

```bash
bun run dev
# → https://localhost:5173
```

### 2. Публичный туннель

**cloudflared (бесплатно, без аккаунта для одноразового туннеля):**
```bash
cloudflared tunnel --url https://localhost:5173
# → выводит https://random-name.trycloudflare.com
```

**ngrok (нужен аккаунт free tier):**
```bash
ngrok http https://localhost:5173
# → выводит https://xxxx.ngrok-free.app
```

### 3. Настройка в BotFather

```
/setmenubutton → выбрать бота → вставить https://random-name.trycloudflare.com
```

Или временно: `/newapp` → URL из туннеля.

### 4. Тест на реальном устройстве

Открыть бота на телефоне → нажать кнопку меню → Mini App открывается с реальным `initData`.

---

## Переменные окружения для dev

```env
# .env (локальный)
BOT_TOKEN=your_bot_token
VITE_API_URL=https://localhost:3000
```

Hono API также поддерживает TLS: при наличии `.tls/cert.pem` и `.tls/cert-key.pem` запускается на HTTPS (см. `apps/api/src/index.ts`).

---

## Проверка без туннеля (только unit/integration)

Для разработки без TG-клиента достаточно браузера с mock Telegram:

```javascript
// В DevTools Console:
window.Telegram = {
  WebApp: {
    initData: "user=%7B%22id%22%3A12345%7D&auth_date=0&hash=mockhash",
    initDataUnsafe: { user: { id: 12345, first_name: "Dev" } },
    ready: () => {},
    expand: () => {},
    // ...
  }
}
```

E2E тесты используют этот же паттерн через `page.addInitScript()`.
