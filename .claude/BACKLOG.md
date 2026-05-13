# BACKLOG

## Инфраструктура

### PATH-BASED роутинг (один домен вместо поддоменов)
Сейчас: три поддомена `app.`, `api.`, `webhook.` — три DNS-записи, три сертификата.
Цель: всё на `poputchiki.searchingforgamesforever.online`:
- `/` → web (SPA)
- `/api/` → api (strip prefix)
- `/webhook/` → webhook (strip prefix)

Что менять:
1. Traefik labels в `infra/docker-compose.prod.yml` — PathPrefix вместо Host
2. API-клиент фронта — добавить `/api` префикс к запросам
3. URL регистрации Telegram webhook → `https://poputchiki.../webhook/...`
4. CORS origin в бекенде
5. BotFather MiniApp URL → `https://poputchiki.searchingforgamesforever.online`

Плюсы: один домен, один сертификат, проще BotFather.
Минусы: рефакторинг всего API-клиента + webhook URL.
