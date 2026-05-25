---
name: loading-screen-singleton-mecontext
description: useBootMe singleton в AppRoutes + MeContext в отдельном файле — экран загрузки запускается один раз при старте, не при каждой навигации
type: concept
---

# Loading Screen Singleton: useBootMe + MeContext

## Key Points

- Вызов `useMe()` в 7+ компонентах → каждый mount триггерил boot-последовательность → экран загрузки при каждом переходе между вкладками
- Фикс: `useBootMe()` запускается один раз в `AppRoutes`; все компоненты читают контекст через `useMe()` без side effects
- `MeContext` ОБЯЗАТЕЛЬНО в отдельном файле от `useMe()` — иначе `vi.mock("../hooks/useMe")` заменяет весь модуль и `MeContext` становится `undefined` в тестах
- `RidesScreen` должен быть eager-loaded (не lazy) как первый/entry screen — lazy вызывает лишний Suspense при первом переходе
- `usePrefetchScreens` нужен guard `if (import.meta.env.MODE === 'test') return` чтобы избежать `EnvironmentTeardownError`

## Details

### Проблема

```
useMe() вызывался в 7 компонентах
→ каждый компонент при mount вызывал telegramAuth()
→ экран загрузки появлялся при каждой навигации по вкладкам
→ BottomTabBar недоступен до завершения auth-roundtrip
```

### Решение: разделение ответственности

```typescript
// contexts/MeContext.ts — ОТДЕЛЬНЫЙ файл, ОБЯЗАТЕЛЬНО
export const MeContext = createContext<MeContextValue | null>(null);

// hooks/useBootMe.ts — singleton boot, запускается ОДИН РАЗ
export function useBootMe() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    telegramAuth()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []); // пустой deps — только при mount AppRoutes
  return { user, loading };
}

// hooks/useMe.ts — только читает контекст, без side effects
export function useMe() {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe must be used within MeProvider");
  return ctx;
}

// AppRoutes.tsx — singleton boot
function AppRoutes() {
  const { user, loading } = useBootMe();
  if (loading) return <LoadingScreen />;
  return (
    <MeContext.Provider value={{ user }}>
      <Routes>
        <Route path="/" element={<RidesScreen />} />  {/* eager, не lazy */}
        ...
      </Routes>
    </MeContext.Provider>
  );
}
```

### vi.mock gotcha

```typescript
// ПЛОХО: MeContext и useMe в одном файле
// hooks/useMe.ts exports: { useMe, MeContext }

// В тесте:
vi.mock("../hooks/useMe"); // заменяет ВЕСЬ модуль
// → MeContext = undefined в App → Provider падает

// ХОРОШО: разделить
// contexts/MeContext.ts exports: { MeContext }
// hooks/useMe.ts exports: { useMe }

// В тесте:
vi.mock("../hooks/useMe"); // заменяет только хук
// → MeContext из contexts/MeContext.ts не затронут → Provider работает
```

### usePrefetchScreens guard

```typescript
export function usePrefetchScreens() {
  // Без этого guard — EnvironmentTeardownError в тестах
  // потому что lazy import продолжает работать после teardown
  if (import.meta.env.MODE === 'test') return;
  
  useEffect(() => {
    // prefetch lazy screens...
  }, []);
}
```

### Regular merge при дивергенции веток

Когда `main` и `dev` имеют уникальные коммиты (дивергировали):
- `git merge main` (не squash) → сохраняет историю обеих веток
- Squash merge при дивергенции → потеря уникальных коммитов из `main`

## Related Concepts

- [[concepts/react-errorboundary-diagnosis]] — обработка ошибок рендера
- [[concepts/auth-reauth-nonce-trap]] — useMe на 401 должен делать /auth/refresh
- [[concepts/sse-named-events-onmessage-gap]] — аналогичная singleton-проблема в SSE

## Sources

- daily/2026-05-24.md (Session 23:21)
