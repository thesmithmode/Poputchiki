---
title: "Frontend ApiError Graceful Fallback — null Instead of Throw"
aliases: [apierror-fallback, geocode-fallback, frontend-error-fallback, null-on-apierror]
tags: [frontend, error-handling, ux, pattern]
sources:
  - "daily/2026-05-15.md"
created: 2026-05-15
updated: 2026-05-15
---

# Frontend ApiError Graceful Fallback — null Instead of Throw

When a non-critical API call fails (e.g., geocode address lookup), the frontend should catch `ApiError`, return `null`, and display a user-friendly fallback string ("адрес не найден") rather than propagating the error to an error boundary or showing a raw error message. This keeps the UI functional when auxiliary features fail.

## Key Points

- Geocode lookup failure must not block ride creation or map display — it is auxiliary, not critical
- Pattern: `catch (e) { if (e instanceof ApiError) return null; throw e; }` — only swallow known API errors, re-throw unexpected errors
- Component receives `null` address → renders "адрес не найден" placeholder → user can still proceed
- Re-throwing non-ApiError preserves crash reporting for genuine bugs (network stack errors, parse failures)
- The same pattern applies to any optional enrichment: profile photo fetch, ETA calculation, weather overlay

## Details

In Poputchiki's ride creation flow, the user selects a pickup point on the map. The frontend calls the Nominatim geocode API to resolve the coordinate to a human-readable address string. If Nominatim is unavailable (still importing OSM data on first deploy, network issue, or self-hosted service not yet started), the geocode call throws `ApiError`.

Without a fallback, the error propagates to the nearest React error boundary, showing a generic error screen and blocking the user from creating a ride. This is a poor UX trade-off — the address string is display-only metadata; the ride can be created with coordinates alone.

With the graceful fallback:

```typescript
async function resolveAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const result = await apiFetch(`/geocode/reverse?lat=${lat}&lng=${lng}`);
    return result.displayName ?? null;
  } catch (e) {
    if (e instanceof ApiError) {
      return null; // geocode unavailable — caller shows "адрес не найден"
    }
    throw e; // unexpected error (parse failure, network stack bug) — escalate
  }
}

// In component:
const address = await resolveAddress(lat, lng);
<span>{address ?? "адрес не найден"}</span>
```

The discriminated catch — `if (e instanceof ApiError) return null; throw e;` — is the critical pattern. It limits the swallowed errors to exactly the class of errors the API contract can produce (HTTP 4xx/5xx, timeout, server unavailable). Unexpected errors (e.g., `TypeError` from a null access inside `apiFetch`, or a JSON parse failure in a response that should be JSON) are re-thrown and reach crash reporting / error boundaries where they belong.

This pattern applies to any feature that is additive but not required for the core workflow:
- User avatar/photo fetch (shows initials placeholder on failure)
- ETA calculation via external maps API (shows "время неизвестно")
- Push notification registration (silently skipped if denied or API unavailable)

The key question: "If this call fails, can the user still complete their primary goal?" If yes → graceful null fallback. If no → let the error propagate.

## Related Concepts

- [[concepts/nominatim-pbf-region-sizing]] — Nominatim geocode service that triggers this fallback during initial OSM import; `service_started` dependency condition means the API starts before Nominatim is ready
- [[concepts/docker-compose-profiles-silent-skip]] — Nominatim silently absent due to profiles trap is the original scenario that made geocode fallback critical
- [[concepts/hono-onerror-required]] — Server-side complement: `app.onError` handles unexpected errors on the API; this pattern handles expected API errors gracefully on the client

## Sources

- [[daily/2026-05-15.md]] — Session 12:08: code review finding MED-7 — geocode error handling: frontend catches `ApiError` → returns `null` → renders "адрес не найден"; non-ApiError re-thrown for crash reporting; pattern generalized to all optional enrichment calls
