---
title: "Same-Location Coordinate Validation — from == to Guard in Zod"
aliases: [from-to-validation, same-location-guard, coordinate-validation-zod, pickup-dropoff-same]
tags: [backend, frontend, validation, zod, rides, pattern]
sources:
  - "daily/2026-05-19.md"
created: 2026-05-19
updated: 2026-05-19
---

# Same-Location Coordinate Validation — from == to Guard in Zod

Ride creation must reject requests where pickup and dropoff coordinates are the same location (or closer than a meaningful threshold). The validation lives in the Zod schema as a `refine()` step — single source of truth on the server — with a UI mirror for instant feedback. At 55°N (Kazan), 50 meters corresponds to approximately 0.00045° latitude and 0.00078° longitude.

## Key Points

- `from == to` (identical coordinates) or within 50m threshold → `z.refine()` rejects with descriptive error
- 50m threshold at 55°N: `|Δlat| < 0.00045 AND |Δlng| < 0.00078` using equidistant approximation (1°lat ≈ 111km, 1°lng ≈ 64km at 55°N)
- Zod `refine()` in the server schema is the authoritative validation; UI mirrors it for UX (shows error before form submit)
- The UI check uses the same constants to stay in sync — shared via `packages/shared` or inline duplication with comment
- Error message: "Точка отправления и прибытия совпадают" (displayed both in API 400 response and in UI)

## Details

Rides where the pickup and dropoff are the same location are meaningless — a driver would go nowhere, and the seat-booking system would create an invalid trip. Without validation, a user could accidentally create such a ride (e.g., clicking the same point twice on the map) and it would pass through to the database.

**Zod schema (server-side, authoritative):**

```typescript
const SAME_LOCATION_THRESHOLD_DEG = {
  lat: 0.00045, // ~50m at 55°N
  lng: 0.00078, // ~50m at 55°N (111000 × cos(55°) ≈ 63700 m/deg)
};

const createRideSchema = z.object({
  fromLat: z.number().min(-90).max(90),
  fromLng: z.number().min(-180).max(180),
  toLat: z.number().min(-90).max(90),
  toLng: z.number().min(-180).max(180),
  // ... other fields
}).refine(
  (data) =>
    Math.abs(data.fromLat - data.toLat) > SAME_LOCATION_THRESHOLD_DEG.lat ||
    Math.abs(data.fromLng - data.toLng) > SAME_LOCATION_THRESHOLD_DEG.lng,
  {
    message: "Точка отправления и прибытия совпадают",
    path: ["toLat"], // attach error to destination field
  }
);
```

The `refine()` check uses an OR condition: the locations are considered different if they differ by more than the threshold in EITHER latitude OR longitude. This is the equidistant (Chebyshev distance) approximation — not circular distance — which is computationally cheaper and sufficient for a 50m threshold.

**Why 50m?** Smaller thresholds (e.g., exact equality) would miss cases where the user taps very close to the same point. Larger thresholds (e.g., 500m) would reject valid short trips within ЖК Царёво. 50m is below the typical inter-building distance in the complex (~100–200m) while clearly catching accidental same-point selections.

**Coordinate math at 55°N:**
- 1 degree latitude ≈ 111,000 m (constant globally)
- 1 degree longitude ≈ 111,000 × cos(55°) ≈ 64,000 m at 55°N (Kazan)
- 50m latitude threshold: 50 / 111,000 ≈ 0.00045°
- 50m longitude threshold: 50 / 64,000 ≈ 0.00078°

**UI mirror (frontend, for immediate feedback):**

```typescript
// web/src/components/RideForm.tsx
const THRESHOLD = { lat: 0.00045, lng: 0.00078 };

function isSameLocation(from: LatLng, to: LatLng): boolean {
  return (
    Math.abs(from.lat - to.lat) <= THRESHOLD.lat &&
    Math.abs(from.lng - to.lng) <= THRESHOLD.lng
  );
}

// In form validation:
if (isSameLocation(fromCoords, toCoords)) {
  setError("Точка отправления и прибытия совпадают");
  return;
}
```

The UI check uses identical logic so the error appears immediately as the user moves the destination pin, without a network round-trip.

## Related Concepts

- [[concepts/book-seat-on-accept-not-request]] — Another ride creation invariant: `book_seat()` must fire at accept, not at request; same-location validation is a pre-creation invariant
- [[concepts/rls-guc-identity]] — GUC identity is set before ride INSERT; same-location validation runs before the INSERT reaches the DB layer
- [[concepts/zod-uuid-strict-validation]] — Zod schema gotchas in this project; `refine()` is a different Zod surface area but same schema-first discipline

## Sources

- [[daily/2026-05-19.md]] — Session 14:44: `from == to` валидация: `refine()` в Zod-схеме как single source of truth + UI-зеркало; порог 50м; формула 55°N: 1°lat ≈ 111000м, 1°lng ≈ 64000м → пороги 0.00045° и 0.00078°; ошибка "Точка отправления и прибытия совпадают"
