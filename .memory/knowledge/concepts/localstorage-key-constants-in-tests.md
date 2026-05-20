---
title: "localStorage Key Constants — Tests Must Use Same Source as App"
aliases: [localstorage-key-sync, storage-key-constant, pp-theme-key, test-storage-key-drift]
tags: [testing, frontend, gotcha, localStorage, pattern]
sources:
  - "daily/2026-05-17.md"
created: 2026-05-17
updated: 2026-05-17
---

# localStorage Key Constants — Tests Must Use Same Source as App

Tests that reference localStorage keys by hardcoded string literals drift when the application's key constant is renamed or changed. The fix is to import and use the same exported constant in both app code and tests — never duplicate the key string.

## Key Points

- App uses `localStorage.getItem("pp_theme")` (key exported as `THEME_KEY = "pp_theme"`) — test used `localStorage.getItem("themePreference")` → test always read `null`
- Hardcoded string keys in tests are silent drift: no compile error, no lint warning, just wrong behavior
- Fix: export the key constant from the app module and import it in the test
- Same principle applies to any storage key: session storage, cookie names, IndexedDB store names
- `applyTelegramTheme` must be mocked in `beforeEach` to prevent it from setting side effects on `document.documentElement` that corrupt other tests

## Details

In the 2026-05-17 session, `App.test.tsx` failed because it expected the default theme to be `"light"` when no key was set in localStorage. The test set up the scenario by calling `localStorage.clear()`, then rendered `<App />` and asserted `document.documentElement.classList.contains("dark")` was false.

The actual behavior: `ThemeProvider` reads `localStorage.getItem("pp_theme")` on mount. The test was calling `localStorage.setItem("themePreference", "dark")` to test dark mode toggling — the wrong key. The correct key `"pp_theme"` was exported as a constant `THEME_KEY` from `src/hooks/useTheme.ts` but the test had never been updated to use it.

The failure mode is deceptive because the test can appear to "pass" for wrong reasons: a `localStorage.clear()` in `beforeEach` combined with the wrong key means the theme provider always reads `null` and falls back to its default — which may match the test's expectation by coincidence, not by correctness.

The correct pattern:

```typescript
// src/hooks/useTheme.ts
export const THEME_KEY = "pp_theme";

export function useTheme() {
  const storedTheme = localStorage.getItem(THEME_KEY);
  // ...
}
```

```typescript
// App.test.tsx
import { THEME_KEY } from "../hooks/useTheme";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window.Telegram?.WebApp || {}, "onEvent").mockImplementation(() => {});
  // Mock applyTelegramTheme to prevent side effects on documentElement
  vi.mock("../hooks/useTelegramTheme", () => ({ applyTelegramTheme: vi.fn() }));
});

it("defaults to system theme", () => {
  render(<App />);
  expect(localStorage.getItem(THEME_KEY)).toBeNull(); // no stored preference
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

it("respects stored dark preference", () => {
  localStorage.setItem(THEME_KEY, "dark");  // ← uses constant, not "themePreference"
  render(<App />);
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});
```

The secondary finding from the same session: `applyTelegramTheme()` (called in `useEffect` during mount) applies classes directly to `document.documentElement`. Without mocking it in `beforeEach`, the side effect persists across tests in the same file, causing later tests to see a different DOM state than they set up. The mock prevents this contamination.

## Related Concepts

- [[concepts/test-assertion-contract-drift]] — Same class of test drift: implementation changes without test update; storage key rename is a specific instance
- [[concepts/theme-css-semantic-tokens]] — The theme system that `pp_theme` key supports; `ThemeProvider` reads this key to apply `--brand-*` token overrides
- [[concepts/redesign-test-maintenance-cascade]] — Broader pattern: UI redesign (including theme system rewrite) triggers test updates; this key mismatch was a residual from the theme architecture change in 2026-05-16

## Sources

- [[daily/2026-05-17.md]] — Session 14:04: `App.test.tsx` used hardcoded `"themePreference"` key instead of the app's actual `"pp_theme"` (`THEME_KEY` constant); default theme assertion was `"light"` but app used `"system"` as default; `applyTelegramTheme` needed mocking to prevent `documentElement` side effects across tests
