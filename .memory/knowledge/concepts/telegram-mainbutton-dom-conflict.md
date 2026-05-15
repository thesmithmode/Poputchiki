---
title: "Telegram MainButton DOM Conflict — FAB Duplication in Mini App"
aliases: [telegram-mainbutton, mainbutton-conflict, mainbutton-fab-duplicate, telegram-fab]
tags: [telegram, frontend, react, gotcha, ui]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# Telegram MainButton DOM Conflict — FAB Duplication in Mini App

Telegram's Mini App SDK provides a native `MainButton` — a prominent button rendered at the bottom of the WebView by the Telegram client itself, outside the React DOM. When the React app also renders a floating action button (FAB) for the same action, users see two buttons simultaneously. The fix is a `hasMainButton` state guard that renders the DOM FAB only when the native MainButton is not active.

## Key Points

- `window.Telegram.WebApp.MainButton` is drawn OUTSIDE the React DOM, by the Telegram client — it overlaps any fixed-bottom DOM elements
- When the app also renders a DOM FAB (`<button className="fab">+</button>`), both appear: native button at bottom + DOM circle button above it
- Symptom: two identically-purposed create buttons visible simultaneously in Telegram; only one in browser (SDK absent)
- Fix: `hasMainButton` state flag — show DOM FAB only when `MainButton.isVisible` is false
- The conflict is invisible during browser development because `window.Telegram.WebApp` is absent outside Telegram

## Details

The Telegram Mini App SDK exposes a `MainButton` object that controls a native bottom button rendered by the Telegram client. Calling `MainButton.show()` makes a prominent button appear at the bottom of the WebApp viewport — below the Mini App's own React-rendered content. This button is drawn by the Telegram native application, not by the React app, making it invisible to React and to browser devtools.

The conflict arises when the React component tree also renders a FAB for the same action (e.g., creating a new ride). In browsers (where `window.Telegram.WebApp` is undefined), only the DOM FAB is visible. In Telegram, both the native MainButton and the DOM FAB are visible simultaneously — one full-width at the very bottom, one as a floating circle above the BottomTabBar.

The correct pattern uses state to track whether the native MainButton is active:

```typescript
const [hasMainButton, setHasMainButton] = useState(false);

useEffect(() => {
  const tg = window.Telegram?.WebApp;
  if (tg?.MainButton) {
    tg.MainButton.setText("Создать поездку");
    tg.MainButton.onClick(() => navigate("/rides/new"));
    tg.MainButton.show();
    setHasMainButton(true);
    return () => {
      tg.MainButton.hide();
      setHasMainButton(false);
    };
  }
}, [navigate]);

return (
  <>
    {/* ... ride list ... */}
    {!hasMainButton && (
      <button className="fab" onClick={() => navigate("/rides/new")}>+</button>
    )}
  </>
);
```

When `hasMainButton` is `true` (inside Telegram, native button shown), the DOM FAB is hidden. When `hasMainButton` is `false` (browser dev, no Telegram SDK), the DOM FAB is shown. Exactly one create button is visible in all contexts.

An alternative: skip the native `MainButton` entirely and always use the DOM FAB. This avoids the state management complexity. The trade-off: the native MainButton has stronger affordance (full-width, Telegram's own styling) and integrates better with Telegram's UX language. For a committed Telegram Mini App like Poputchiki, the native button is preferred.

## Related Concepts

- [[connections/telegram-webapp-invisible-constraints]] - Part of the 5 invisible Telegram WebApp constraints; duplicate button is only visible inside Telegram, not in browser dev
- [[concepts/telegram-hashrouter-tgwebappdata]] - Co-discovered class of Telegram-specific behavior requiring in-Telegram testing to find
- [[concepts/x-frame-options-telegram-embedding]] - Related Telegram WebView constraint affecting how the app renders
- [[concepts/poputchiki-stack]] - Telegram Mini App architecture where native SDK elements interact with React components

## Sources

- [[daily/2026-05-14.md]] - Session 17:45: Антон прислал скриншоты с дублирующейся кнопкой создания; DOM FAB + native MainButton оба видны одновременно; fix: `hasMainButton` state guard — рендерить DOM FAB только если native MainButton неактивен
