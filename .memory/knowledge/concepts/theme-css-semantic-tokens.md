---
title: "CSS Semantic Token Architecture for Theme-Reactive UI"
aliases: [css-tokens, semantic-tokens, theme-architecture, ThemeProvider, brand-tokens, hardcoded-colors-lint]
tags: [frontend, css, theming, react, architecture, pattern]
sources:
  - "daily/2026-05-16.md"
created: 2026-05-16
updated: 2026-05-16
---

# CSS Semantic Token Architecture for Theme-Reactive UI

Root cause of broken dark/light theme switching: components hardcode hex values (`#fff`, `#2563eb`) or Tailwind static color classes (`bg-gray-50`, `text-black`) that ignore CSS custom properties and the `.dark` class on `documentElement`. The fix is a single `ThemeProvider` React Context, a semantic token contract in `index.css`, and a CI lint gate that enforces zero hardcoded colors.

## Key Points

- Hardcoded hex in JSX (`style={{ color: "#2563eb" }}`) and static Tailwind classes (`bg-white`, `bg-gray-*`) do not react to `.dark` class — manual theme selection has no effect on these components
- `ThemeProvider` as single React Context replaces scattered `useThemePreference` hooks — one write point for `.dark` on `documentElement`
- Semantic CSS tokens in `index.css` — `:root { --brand-surface: #fff; }` + `.dark { --brand-surface: #1a1a2e; }` — components reference `var(--brand-surface)` and automatically respond to theme changes
- Tailwind `extend.colors` via `var(--brand-*)` allows `className="bg-brand-surface"` — semantic intent, no static colors
- Lint gate: `rg "#[0-9a-fA-F]{3,6}" web/src` and `rg "bg-(white|black|gray-)" web/src` must return 0 matches in CI
- SVG inline (data URI) exception: `data:image/svg+xml` cannot access CSS custom properties — identity color palettes remain hardcoded

## Details

The root cause of the Poputchiki theme bug was architectural: the app had a working mechanism to set `.dark` on `document.documentElement` via `useThemePreference.ts`, but ~40 color values across ~11 component files were hardcoded. Setting `.dark` correctly changed the root class, but components rendered with `style={{ backgroundColor: "#fff" }}` or `className="bg-gray-50"` ignored it entirely.

Additionally, the `themeChanged` event listener in `App.tsx` was gated on `pref === "system"` — when a user manually selected "dark" or "light" in the profile settings, the listener was dormant, so Telegram's native theme change would not update the app's manual preference.

**The token contract (index.css):**

```css
:root {
  --brand-surface: #f8f6f0;
  --brand-surface2: #ede8df;
  --brand-text: #1a1a1a;
  --brand-text-muted: #6b7280;
  --brand-primary: #2d5a3d;
  --brand-primary-text: #ffffff;
  --brand-border: #d4c9b8;
  --brand-danger: #dc2626;
  --brand-warn: #d97706;
  --brand-shadow-sm: 0 1px 3px rgba(0,0,0,.08);
}

.dark {
  --brand-surface: #1a1a2e;
  --brand-surface2: #16213e;
  --brand-text: #e8e6e3;
  --brand-text-muted: #9ca3af;
  --brand-primary: #4a9b6f;
  --brand-primary-text: #ffffff;
  --brand-border: #2d2d4e;
  --brand-danger: #ef4444;
  --brand-warn: #fbbf24;
  --brand-shadow-sm: 0 1px 3px rgba(0,0,0,.3);
}
```

**Tailwind extension:**

```js
// tailwind.config.js
extend: {
  colors: {
    'brand-surface': 'var(--brand-surface)',
    'brand-text': 'var(--brand-text)',
    'brand-primary': 'var(--brand-primary)',
    // ...
  }
}
```

**Legitimate hardcoded color exceptions** (from audit):
- Avatar SVG `data:image/svg+xml` — inline SVG in a data URI cannot reference CSS custom properties; identity color palette stays hardcoded (neutral, theme-independent)
- Leaflet marker stroke `#fff` — contrast halo for marker visibility; white stroke on dark map background is intentional
- Toggle thumb `#fff` — white by design in both themes
- `RouteBlock` `dark` prop — contextual variant for colored card backgrounds, not a theme selector

**The Telegram `themeChanged` fix:** The listener should update app theme regardless of `pref` value — the listener re-evaluates the resolved theme (manual override > Telegram theme > system theme) rather than only triggering when `pref === "system"`.

Backend persistence of theme preference (for multi-device sync) was explicitly deferred — current localStorage-only storage is acceptable for MVP.

## Related Concepts

- [[concepts/poputchiki-stack]] — React+Vite frontend where the theme architecture lives
- [[concepts/redesign-test-maintenance-cascade]] — Prior design v2 implementation also produced cascading UI changes requiring broad test updates; same discipline applies here
- [[concepts/css-filter-dark-map-theme]] — Leaflet dark mode via CSS filter on tiles; works in conjunction with the token system for the map screen

## Sources

- [[daily/2026-05-16.md]] — Sessions 14:50, 15:11, 15:12: ~40 hardcoded colors replaced with `--brand-*` tokens; `ThemeProvider` single context replacing `useThemePreference`; Tailwind extend via CSS vars; lint gate `theme:check` added to CI; `themeChanged` listener fixed for non-system pref; SVG inline, Leaflet stroke, toggle thumb, RouteBlock dark prop identified as intentional exceptions
