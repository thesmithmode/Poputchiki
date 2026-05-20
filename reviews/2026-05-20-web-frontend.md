# Code Review: web/ frontend — 2026-05-20

## Summary

29 findings: 2 critical, 7 high, 12 medium, 8 low.

Reviewed: `web/src/**` (App.tsx, main.tsx, lib/, hooks/, components/, screens/, i18n/) + `web/tests/`.

---

## Critical

### [C1] Атомарный 2-step submit: orphan template при ошибке POST /rides

- Files: `web/src/screens/CreateRideScreen.tsx:161-198`
- Problem: Регулярная поездка создаётся в два шага: сначала `POST /ride-templates` → получаем `template_id`, затем `POST /rides`. Если второй запрос упадёт с сетевой ошибкой или 4xx — шаблон в БД остаётся, но поездка не создана. Orphan-запись не имеет ссылающейся поездки и не может быть убрана пользователем.
- Why bad: Утечка данных в БД, несогласованность состояния. При повторной попытке пользователь создаст ещё один шаблон.
- Fix: Завернуть в транзакцию на backend'е (уже должно быть в SPEC), либо передавать данные шаблона в один `POST /rides` запрос и создавать шаблон внутри transaction в API. Или на фронте: при ошибке `POST /rides` — `DELETE /ride-templates/{template_id}` в блоке `catch` до показа ошибки пользователю.
- Evidence: строки 160-198 — `template_id = tmpl.id` → `await apiFetch("/rides", ...)` без rollback при ошибке.

### [C2] ComplaintSheet: onKeyDown на div без role/tabIndex — Escape не работает

- Files: `web/src/components/ComplaintSheet.tsx:58-63`
- Problem: Overlay `div` обрабатывает `onKeyDown` с `e.key === "Escape"`, но div не focusable. Клавиатурный Escape не сработает — фокус никогда не окажется на этом элементе. Focus-trap в модале отсутствует полностью.
- Why bad: Нарушение WCAG 2.1 §2.1.2 (No Keyboard Trap) — пользователь не может закрыть жалобу клавиатурой, а после открытия модала фокус не захватывается и Tab уходит за пределы.
- Fix: Добавить `role="dialog"`, `aria-modal="true"`, `tabIndex={-1}` + `autoFocus` на контейнер, либо использовать полноценный focus-trap (переключение Tab внутри модала). Закрытие по Escape — через `document.addEventListener("keydown")` в `useEffect` с cleanup.
- Evidence: строки 48-63, отсутствие tabIndex/role на overlay.

---

## High

### [H1] useMe вызывается в 5+ компонентах — каждый создаёт отдельный useEffect boot()

- Files: `web/src/App.tsx:277`, `web/src/screens/FeedScreen.tsx:27`, `web/src/screens/AdminScreen.tsx:30`, `web/src/screens/ProfileScreen.tsx:21`, `web/src/screens/RideDetailScreen.tsx:52`, `web/src/screens/SettingsScreen.tsx:21`
- Problem: `useMe()` — это не кешированный хук, а локальный `useState + useEffect`. Каждый вызов запускает собственный `boot()` — потенциально N параллельных `/users/me` и `/auth/telegram` запросов при первом рендере дерева компонентов. На практике `AppRoutes` (единственный вызов до рендера child screens) и факт lazy-loading screens снижает риск, но архитектурно это DI-violation.
- Why bad: В React StrictMode (main.tsx:31) `useEffect` запускается дважды при mount — `cancelled=true` защищает, но любой дочерний компонент, получивший `AppShell` (после auth), ещё раз вызывает `useMe()` и запускает `boot()` с новым `apiFetch("/users/me")`.
- Fix: Конвертировать `useMe` в Context Provider (`MeContext`) + `useMe` как `useContext`. Один `boot()` в провайдере, все потребители читают стабильное состояние. Это согласуется с архитектурой: `me` — глобальное состояние сессии.
- Evidence: N вызовов `useMe()` в листинге выше; `useMe.ts:62-131` — нет кеша/singletone.

### [H2] MapScreen: debounce таймер утекает при destroy + тайл-свап без Abort

- Files: `web/src/screens/MapScreen.tsx:199-207, 234-241`
- Problem: (а) `debounceTimer` — локальная переменная внутри async `init()`. При unmount (`destroyed=true`) таймер не очищается в `return () => { ... }` (строка 233). Если пользователь ушёл с карты за 400ms, `loadRides()` выполнится после unmount. (б) `useEffect` для theme swap (строки 97-118) импортирует Leaflet async и не отменяет промис при unmount — если компонент unmount'нулся пока `import("leaflet")` in-flight, `map.addLayer` вызывается на уже удалённой карте.
- Why bad: (а) setRides/setLoading после unmount — Warning в React 18 strict mode, memory leak при long-lived app. (б) Race condition на быстром переключении темы.
- Fix: (а) Хранить debounceTimer в замыкании `destroyed` (уже есть флаг) — добавить `clearTimeout(debounceTimer)` в cleanup функцию. (б) В tileLayer-свапе — добавить `let destroyed = false; return () => { destroyed = true }` и проверять до `map.addLayer`.
- Evidence: строки 199-207 (`debounceTimer` без cleanup), строка 233 (cleanup только `mapRef.remove()`).

### [H3] AddressAutocomplete: нет aria-role listbox/option — не screen reader accessible

- Files: `web/src/components/AddressAutocomplete.tsx:134-244`
- Problem: Input имеет `aria-expanded` и `aria-autocomplete="list"`, но dropdown (`div` с кнопками) не имеет `role="listbox"`, кнопки не имеют `role="option"` и `aria-selected`. Screen reader не объявит результаты автозаполнения. Keyboard навигация по вариантам (стрелки) отсутствует.
- Why bad: Нарушение ARIA 1.1 combobox pattern (WAI-ARIA). На Telegram Mobile с VoiceOver/TalkBack пользователь не сможет выбрать адрес.
- Fix: Добавить `role="listbox"` на dropdown-container, `role="option"` на каждый button, `aria-selected="false"`, управление активным элементом через `aria-activedescendant` на input + стрелки Up/Down в `onKeyDown`.
- Evidence: строки 147-170 (dropdown div без role), 206-232 (button без role="option").

### [H4] FeedScreen: pp_density hardcoded в localStorage без константы

- Files: `web/src/screens/FeedScreen.tsx:33,38`
- Problem: `localStorage.getItem("pp_density")` / `localStorage.setItem("pp_density", next)` — строковый литерал, не константа. Тесты, которые хотят проверить density, должны знать магическое значение "pp_density". Аналогично pattern, зафиксированный в memory как `localstorage-key-constants-in-tests` — тут применяется тот же антипаттерн.
- Why bad: Drift при rename, тесты ломаются молча. `FeedScreen.test.tsx` не тестирует density persistence.
- Fix: Вынести в константу `const DENSITY_KEY = "pp_density"` (в том же файле или в lib/storageKeys.ts).
- Evidence: строки 33, 38.

### [H5] RideDetailScreen: двойной вызов useMe() + useRide() без loading guard — поле `ride` читается до загрузки

- Files: `web/src/screens/RideDetailScreen.tsx:204`
- Problem: Строка 204 `const isOwnRide = me.status === "ok" && me.user.id === ride.driver.id` — эта строка исполняется ПОСЛЕ early returns на 165-202. Если `isLoading=false` и `!ride` → `return null` на 202. Но если `isLoading=true` (строка 165) компонент возвращает загрузку. Проблема иная: все `useMutation` хуки (строки 82-163) объявлены безусловно ДО `if (isLoading)` — это КОРРЕКТНО по Rules of Hooks. Но переменная `rideKey` (строка 80) и `respondMutation.onMutate` закрываются на `id`, не на `ride` — безопасно. Истинная проблема: при `me.status === "loading"` весь action bar скрыт (строка 1098), но `handleLike` внутри вызывает `ride?.driver.id` — `ride` может быть undefined при stale cache. Optional chaining на строке 219 (`ride?.driver.id`) маскирует баг, передавая `undefined` как `target_user_id` в POST.
- Why bad: POST `/likes` с `target_user_id: undefined` даст 400/422 от backend, но ошибка молча проглатывается в catch с `setLikeStatus("error")`.
- Fix: Добавить `if (!ride) return;` в начало `handleLike` (строка 214) + убрать optional chaining `ride?.driver.id` → `ride.driver.id` чтобы ошибка стала очевидной на уровне типов.
- Evidence: строка 219 `ride?.driver.id`.

### [H6] EventsScreen: respondState не сбрасывается при переходе уведомления из unread→read секции

- Files: `web/src/screens/EventsScreen.tsx:135-136`
- Problem: `unread = notifications.filter((n) => !n.is_read || respondState[n.id])` — уведомление остаётся в unread-секции пока `respondState[n.id]` не null. При успехе (`state === "done"`) маркируется прочитанным и исчезает из списка. Но `respondState` — локальный `useState`, никогда не очищается. При быстрой прокрутке или повторном открытии экрана (без unmount за счёт кеша) призрачные записи остаются в памяти и влияют на фильтрацию.
- Why bad: Memory growth при долгой сессии (тысячи уведомлений), хотя в MVP insignificant. Более серьёзно: `read`-секция (строка 136) покажет кнопки принять/отклонить для read-уведомления если `respondState[n.id]` не "done" (строки 600-644) — потенциальный двойной accept.
- Fix: В `onSuccess` — сразу `setRespondState(p => { const next = {...p}; delete next[n.id]; return next; })` вместо `{ ...p, [n.id]: "done" }`.
- Evidence: строки 135-136, 155-159.

### [H7] useNotifications + useRealtime: полная инвалидация notifications при ride_changed

- Files: `web/src/hooks/useRealtime.ts:25-28`, `web/src/hooks/useNotifications.ts:19-24`
- Problem: `useRealtime` инвалидирует только `queryKeys.rides.all` и `queryKeys.ride.all`. Уведомления (`queryKeys.notifications.all`) не инвалидируются при SSE `ride_changed`. `useNotifications` использует `refetchInterval: 30_000` как fallback, то есть новые уведомления (ride_request, ride_cancelled) появляются с задержкой до 30 секунд при активном SSE соединении.
- Why bad: Для реальтайм-приложения 30s задержка для критичных событий (заявка на поездку) — плохой UX. SSE endpoint на backend скорее всего шлёт `ride_changed` при accept/reject — но badge уведомлений не обновляется.
- Fix: Добавить в `ride_changed` handler `queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })`, или добавить отдельный SSE event `notification_changed`.
- Evidence: `useRealtime.ts:25-28` (invalidate только rides/ride), `useNotifications.ts:22-23` (`refetchInterval: 30_000`).

---

## Medium

### [M1] App.tsx: themeChanged listener — утечка ref на Telegram WebApp

- Files: `web/src/App.tsx:409-432`
- Problem: `wa.onEvent("themeChanged", callback)` — нет соответствующего `wa.offEvent("themeChanged", callback)` в cleanup useEffect. Telegram WebApp API не гарантирует автоматическое снятие listener при unmount компонента.
- Why bad: При hot-reload в dev или повторном mount `App` накапливаются listener'ы, вызывая multiple invocations одного callback.
- Fix: Вернуть cleanup в useEffect: `return () => { wa.offEvent?.("themeChanged", themeHandler); }`. Вынести callback в именованную переменную перед `.onEvent(...)`.
- Evidence: строки 422-427, отсутствие return cleanup.

### [M2] AutoOnboard: window.location.reload() без задержки при PATCH успехе

- Files: `web/src/App.tsx:151-154`
- Problem: `apiFetch(... onboarded: true).then(() => window.location.reload())` — полный reload страницы без уведомления пользователя. Если PATCH упал (500, таймаут), пользователь видит сырую ошибку и кнопку "Повторить". Если PATCH успешен, приложение перезагружается без transition — неожиданно для Telegram MiniApp.
- Why bad: `window.location.reload()` прерывает Telegram WebApp lifecycle (may trigger close on some platforms). Корректнее — инвалидировать `queryKeys.me.all` и пересоздать `useMe` state.
- Fix: После успешного PATCH — `queryClient.invalidateQueries({ queryKey: queryKeys.me.all })` + navigate("/"). `queryClient` доступен через хук, либо через `window.__queryClient` pattern.
- Evidence: строки 151-154.

### [M3] FeedScreen: useMe() вызов внутри уже запущенного AppRoutes — лишний boot()

- Files: `web/src/screens/FeedScreen.tsx:27`
- Problem: `FeedScreen` вызывает `useMe()` только чтобы получить `myUserId` для фильтра "скрыть свои поездки". Это порождает ещё один `boot()` в useMe (хотя в реальности он завершается мгновенно через сохранённый state т.к. `useMe` — не синглтон, но state не разделяется). Фактически `useMe()` здесь вызывает новый `setState({ status: "loading" })` + `apiFetch("/users/me")` ещё раз.
- Why bad: Дополнительный запрос к API при каждом mount FeedScreen (стр. [H1]).
- Fix: Передавать `myUserId` как prop от AppRoutes, или решить [H1] через Context.
- Evidence: `FeedScreen.tsx:27`.

### [M4] parseMarkdown: key=index для заголовков/параграфов

- Files: `web/src/lib/parseMarkdown.tsx:51,57,63,75,88,94`
- Problem: Все React-элементы в `parseMarkdown` используют `key={i}` (индекс в массиве строк). При динамическом изменении markdown (например, в AdminScreen при пагинации) React не сможет корректно diff-ить элементы.
- Why bad: Неправильный reconciliation при изменении контента. В текущем use case (статичные legal/about страницы) не проявляется, но архитектурно некорректно.
- Fix: Использовать stable key — например, `key={`${type}-${i}`}` или `key={line.slice(0,20)}`. В таблицах ячейки уже используют `key={c}` (content) — применить аналогично.
- Evidence: строки 51, 57, 63, 75, 88, 94.

### [M5] ComplaintSheet: ошибка API молча игнорируется

- Files: `web/src/components/ComplaintSheet.tsx:27-45`
- Problem: `handleSubmit()` — try/catch отсутствует вокруг `apiFetch`. Точнее: `finally { setLoading(false) }` есть, но нет `catch`. Если POST /complaints вернёт 400/500 — `onClose()` не вызовется, `loading` вернётся в false, но пользователь не увидит ошибки — кнопка просто "оживёт" снова.
- Why bad: Silent failure. Пользователь не знает, отправлена ли жалоба.
- Fix: Добавить `catch(err) { setError(String(err)); }` + рендер `error` в JSX.
- Evidence: строки 27-45, нет try/catch/error state.

### [M6] MapScreen: XSS через escapeHtml в makeRideMarkerHtml — неполная защита

- Files: `web/src/screens/MapScreen.tsx:35-61`
- Problem: `escapeHtml()` корректно экранирует `&`, `<`, `>`, `"`, `'`. Но маркер собирается как string-конкатенация с `avatarColor` (результат `getAvatarColor`) — hex-цвет из фиксированного массива `AVATAR_COLORS`, безопасен. Однако `ratingStr` включает `Number(ride.driver_avg_stars).toFixed(1)` — безопасно. Реальная проблема: `price` (строка 52) = `ride.price_rub !== null ? \`${ride.price_rub}₽\` : "Догов."` — `ride.price_rub` приходит с сервера как number, toString безопасен. Однако весь HTML строится через template literal и вставляется через Leaflet `DivIcon.html` — фактически `innerHTML`. Если в будущем добавится поле с user-контентом без `escapeHtml` — XSS.
- Why bad: Архитектурно опасный паттерн: String-HTML + innerHTML. Сейчас все значения safe, но это хрупко.
- Fix: Вынести маркер в отдельный React-компонент и использовать `ReactDOMServer.renderToStaticMarkup()`, или документировать что все поля ОБЯЗАНЫ проходить через `escapeHtml`.
- Evidence: строки 48-61 (`makeRideMarkerHtml`).

### [M7] EventsScreen: "Прочитать все" кнопка — нет aria-label, нет feedback

- Files: `web/src/screens/EventsScreen.tsx:342-358`
- Problem: Кнопка "Прочитать все" не имеет `data-testid` для тестов, нет aria-label (text content есть, но assistive технологии могут не связать с контекстом непрочитанных). При ошибке `markAllRead.mutate()` нет UI feedback.
- Why bad: Если `useMarkAllNotificationsRead` onError — пользователь не знает об ошибке.
- Fix: Добавить `data-testid="mark-all-read"`, `disabled={markAllRead.isPending}`, `onClick={handleReadAll}` + check `markAllRead.isError` с toast/inline error.
- Evidence: строки 342-358.

### [M8] Skeleton loading в AppRoutes — key=index для статичных элементов

- Files: `web/src/App.tsx:308-319, 337-347`
- Problem: `[88, 96, 80, 92].map((h, i) => <div key={i} ...>)` и `[1, 2, 3, 4, 5].map((i) => <div key={i} ...>)` — index key для статичного массива в skeleton. При hot-reload или Suspense fallback/unfallback — reconciliation некорректен.
- Why bad: Технически безвредно для статичного skeleton, но biome-ignore `noArrayIndexKey` явно задокументирован только для первого (строка 310-311), второй (строка 338) — без биome-ignore и без стабильного key.
- Fix: Для массива BottomTabBar skeleton: `[1,2,3,4,5].map((i) => <div key={`tab-${i}`}>)`.
- Evidence: строки 337-348, нет biome-ignore комментария.

### [M9] AdminScreen: useQuery для tickets/complaints — нет error handling в UI

- Files: `web/src/screens/AdminScreen.tsx:39-49`
- Problem: `useQuery` для tickets и complaints — `isLoading` используется, но `isError` не проверяется. При 500 от admin API — экран остаётся пустым без объяснения.
- Why bad: Администратор не видит ошибку и не знает почему тикеты не загружаются.
- Fix: Добавить `if (ticketsLoading || complaintsLoading) ...` → уже есть. Добавить `const { isError: ticketsError } = useQuery(...)` + рендер error state в JSX.
- Evidence: строки 39-49, отсутствие обработки isError.

### [M10] useFilters: applyFilters игнорирует verifiedOnly и trustMin* фильтры

- Files: `web/src/hooks/useFilters.ts:73-108`
- Problem: `applyFilters` проверяет `favoritesOnly`, `direction`, `priceMin/Max`, `seatsMin`, `hideMyRides` — но `verifiedOnly`, `trustMinAccountAgeDays`, `trustMinLikes` в теле функции не используются (строки 73-108). Интерфейс `Filters` их имеет, FeedScreen показывает `trustOn` badge — но фильтр не применяется.
- Why bad: Пользователь включает "фильтр доверия" и видит зелёный badge, но поездки не фильтруются — silently broken feature.
- Fix: Добавить в `applyFilters` условия для этих полей. Для `trustMinAccountAgeDays` — нужно поле `driver_created_at` в типе `Ride` (возможно отсутствует), для `trustMinLikes` — `driver_likes_received_count`.
- Evidence: `useFilters.ts:73-108` — нет branches для `verifiedOnly`/`trustMin*`.

### [M11] useRealtime: нет visibilitychange handling — SSE не переподключается после сна экрана

- Files: `web/src/hooks/useRealtime.ts:93-111`
- Problem: `useRealtime` слушает `window.addEventListener("online", onOnline)` для восстановления при потере сети. Но нет обработки `visibilitychange` — на мобильных Telegram сессиях приложение уходит в background, SSE соединение рвётся (или замораживается), при возврате фокуса не переподключается. `online` event не всегда файрится при выходе из background.
- Why bad: После 30+ секунд в background пользователь видит устаревшие данные (SSE мёртв, polling каждые 30s не стартует без fallback). Для поездок в реальном времени это критично.
- Fix: Добавить в cleanup:
  ```typescript
  function onVisible() {
    if (document.visibilityState === "visible") {
      clearRetryTimer(); retryAttempt = 0; startSSE();
    }
  }
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
  ```
- Evidence: `useRealtime.ts:93-111` — только `online` listener, нет visibilitychange.

### [M12] EditProfileScreen: useEffect fetchs /users/me — дублирует AppRoutes boot()

- Files: `web/src/screens/EditProfileScreen.tsx:26-43`
- Problem: `EditProfileScreen` имеет собственный `useEffect` с `apiFetch("/users/me")` для получения `display_name`. Это третий независимый запрос к `/users/me` (после `AppRoutes.useMe()` и потенциального `FeedScreen.useMe()`). Не использует react-query cache.
- Why bad: Дополнительный network round-trip при каждом открытии экрана. `display_name` уже есть в `useMe()` state (`me.user.display_name`).
- Fix: Получать `display_name` через `useMe()` (или передавать как prop), не делать отдельный fetch. Если нужна гарантия свежих данных — использовать `useQuery({ queryKey: queryKeys.me.all })`.
- Evidence: строки 26-43 — standalone `apiFetch("/users/me")` в useEffect.

---

## Low

### [L1] tokenStore: KEY как module-level const, не экспортируется — тесты hardcode "pp_tokens"

- Files: `web/src/lib/tokenStore.ts:1`, `web/tests/useMe.test.ts:55`
- Problem: `const KEY = "pp_tokens"` — константа не экспортируется. `useMe.test.ts:55` использует строку `"pp_tokens"` напрямую. Совпадает с паттерном `localstorage-key-constants-in-tests` из memory.
- Fix: `export const TOKENS_KEY = "pp_tokens"` в tokenStore.ts, импортировать в тесте.
- Evidence: `tokenStore.ts:1`, `useMe.test.ts:55`.

### [L2] BottomTabBar: "Избранное" отсутствует в TABS — нет пути /favorites в навигации

- Files: `web/src/components/BottomTabBar.tsx:42-50`
- Problem: TAB_PATHS включает `/favorites` (строка App.tsx:208), но `TABS` массив в BottomTabBar не имеет tab с path="/favorites". Пользователь может попасть туда только через внешний navigate, без таба.
- Why bad: UX inconsistency — FavoritesScreen доступна, но из tab bar не попасть.
- Fix: Добавить tab `{ id: "fav", label: "Избранные", icon: "star", path: "/favorites" }`, обновить `getActiveId`.
- Evidence: `BottomTabBar.tsx:42-50`, путь /favorites в TAB_PATHS но не в TABS.

### [L3] parseMarkdown: повторяющийся паттерн key=index при inline parse — при дублирующихся словах key не уникален

- Files: `web/src/lib/parseMarkdown.tsx:8-13`
- Problem: `parseInline` использует `key={p}` где p — часть строки `**bold**`. При тексте вида `**слово** и снова **слово**` — два `<strong>` с одинаковым key.
- Fix: `key={`${idx}-${p}`}` с индексом.
- Evidence: строки 8-13.

### [L4] ErrorBoundary: console.error с полным stack trace — PII риск в production

- Files: `web/src/components/ErrorBoundary.tsx:23`
- Problem: `console.error("ErrorBoundary caught:", error, info)` — в production Telegram WebApp console может быть прочитан через debug tools. `info.componentStack` может содержать имена компонентов, раскрывающие внутреннюю структуру.
- Fix: Заменить на `error-reporter.ts` вызов (уже есть `setupErrorReporting()`), либо добавить `if (import.meta.env.DEV) console.error(...)`.
- Evidence: `ErrorBoundary.tsx:23`.

### [L5] FeedScreen: прайс "0 ₽" для бесплатных поездок вместо "Бесплатно"

- Files: `web/src/components/RideCard.tsx:39`
- Problem: `const priceLabel = ride.price_rub !== null ? \`${ride.price_rub} ₽\` : "0 ₽"` — при `price_rub = null` label = "0 ₽". Но в RideDetailScreen правильно показывается "Бесплатно" (строка 511).
- Why bad: UX inconsistency между FeedScreen card и detail screen.
- Fix: `ride.price_rub !== null ? \`${ride.price_rub} ₽\` : "Бесплатно"`.
- Evidence: `RideCard.tsx:39` vs `RideDetailScreen.tsx:511`.

### [L6] i18n: actionText возвращает n.category как fallback — raw key показывается пользователю

- Files: `web/src/screens/EventsScreen.tsx:56`
- Problem: `default: return n.category` — если backend добавит новую категорию уведомления (например `"support_reply_closed"`), пользователь увидит сырой ключ.
- Fix: Возвращать нейтральный текст: `default: return "Уведомление"`.
- Evidence: строка 56.

### [L7] MapScreen: sessionStorage/localStorage key "lastMapCenter" — отсутствует, но UI не сохраняет zoom/center

- Files: `web/src/screens/MapScreen.tsx:75-88`
- Problem: Карта всегда открывается на `DEFAULT_CENTER` и `DEFAULT_ZOOM`. Пользователь каждый раз заново панирует к нужному месту. Не является багом, но для app с целью 50k пользователей и преимущественно ЖК Царёво — было бы уместно.
- Fix: Сохранять `map.getCenter()` + `map.getZoom()` в sessionStorage при moveend.
- Evidence: строки 75-88 (DEFAULT_CENTER без restore).

### [L8] CreateRideScreen: Telegram MainButton.offClick не срабатывает на re-render

- Files: `web/src/screens/CreateRideScreen.tsx:211-238`
- Problem: `submitRef.current = step === 3 ? handleSubmit : handleNext` (строка 211) — обновляется на каждом рендере. `cb = () => submitRef.current()` (строка 232) — замыкание на `submitRef` (ref стабилен). Это корректный паттерн для избежания stale closure. Но `twa.MainButton.onClick(cb)` вызывается в useEffect[step] — новый `cb` создаётся на каждое изменение step. `offClick(cb)` в cleanup корректно убирает старый cb. Риск: если Telegram WebApp хранит listeners по reference equality — каждый step добавляет новый listener (потенциально N listeners после N step transitions). Зависит от Telegram API impl.
- Fix: Вынести `cb` за пределы useEffect как `useCallback(() => submitRef.current(), [])` и передавать стабильный ref. Тогда `onClick(cb)` и `offClick(cb)` всегда одна и та же функция.
- Evidence: строки 211, 232-234.

---

## Notes

**Что сделано хорошо:**
- Centralized 401 refresh в `apiFetch` (memory concept apifetch-centralized-401-refresh полностью реализован корректно, с singleton `refreshInFlight` против параллельных 401).
- Optimistic UI в `useFavorites`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`, `NotificationPreferencesScreen`, `RideDetailScreen` — правильный 4-callback паттерн (onMutate→snapshot→optimistic setQueryData, onError→rollback, onSettled→invalidate).
- `useRealtime` — exponential backoff (1s→2s→5s→15s→30s→60s cap) + online event reconnect + cleanup корректный.
- `useMe` — stale token detection через JWT sub decode vs TG initDataUnsafe user.id (строки 69-81) — правильная защита от cross-user token reuse.
- `tokenStore` — JWT decode без верификации через atob() безопасен для client-side identity check (не для auth decisions).
- `CreateRideScreen` — `submittingRef.current` guard против double-submit + `validateAll()` перед POST — корректно.
- `queryKeys.ts` — централизованный реестр ключей, строгая типизация `as const`.
- `error-reporter.ts` — sampling (0.1 в prod), sendBeacon для non-blocking delivery, singleton guard против дублирования.
- Тесты `apiFetch.test.ts` — sentinel тесты для 401→refresh→retry и infinite loop prevention — хорошо.
- `useRealtime.test.ts` — 9 тестов включая cap backoff, online reconnect, cleanup — полное покрытие.
- `MapScreen.escapeHtml()` — явная sanitization перед innerHTML — правильное направление.
- Skip link `<a href="#main-content">` в AppShell — хорошая a11y практика.

**Приоритет фиксов:**
1. [C1] Orphan template — риск данных
2. [C2] Focus trap — WCAG blocker
3. [H3] AddressAutocomplete aria — core UX flow недоступен
4. [M10] applyFilters не реализован — silent broken feature
5. [M11] visibilitychange — realtime на мобиле
6. [H7] notifications не инвалидируются по SSE
