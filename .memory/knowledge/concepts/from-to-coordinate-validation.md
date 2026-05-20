---
title: "From/To Coordinate Validation — 50m Minimum Distance"
aliases: [from-to-validation, coordinate-distance-validation, same-location-validation, ride-coordinate-check]
tags: [backend, frontend, validation, zod, rides, gotcha]
sources:
  - "daily/2026-05-19.md"
created: 2026-05-19
updated: 2026-05-19
---

# From/To Coordinate Validation — 50m Minimum Distance

Ride creation must reject cases where the pickup and dropoff coordinates are the same or within 50 meters of each other. The validation uses Zod's `refine()` on the schema (single source of truth) with UI mirroring for user feedback. At 55°N latitude (Kazan), equidistant meter-to-degree conversion requires different multipliers for lat and lon.

## Key Points

- `from == to` (identical coordinates) is not the only invalid case — nearby points (<50m) are also invalid
- 50m threshold: meaningful minimum distance for a carpooling trip; below this, the route has no practical value
- Zod `refine()` on the ride creation schema is the single source of truth; UI shows the same error text for UX
- At 55°N: 1 degree latitude ≈ 111 000m, 1 degree longitude ≈ 64 000m — different multipliers needed for equidistant distance
- Equidistant approximation formula: `√((Δlat × 111000)² + (Δlon × 64000)²) < 50`

## Details

A carpooling ride where pickup and dropoff are identical or within 50 meters is semantically invalid — the driver would travel zero distance. Two coordinate pairs that appear different numerically (different `lat`/`lon` values) can still be within 50 meters when the geographic distance is computed.

The Zod schema implementation:

```typescript
// packages/shared/src/schemas/ride.ts
const coordinatePair = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const rideCreateSchema = z.object({
  from: coordinatePair,
  to: coordinatePair,
  // ... other fields
}).refine(
  (data) => {
    const dLat = (data.to.lat - data.from.lat) * 111000;
    const dLon = (data.to.lon - data.from.lon) * 64000; // at 55°N
    return Math.sqrt(dLat * dLat + dLon * dLon) >= 50;
  },
  {
    message: "Место отправления и назначения слишком близко (менее 50 м)",
    path: ["to"],
  }
);
```

The 64 000 m/degree multiplier for longitude is specific to ~55°N (Kazan). The formula is `cos(latitude_radians) × 111 000`. At the equator (0°N), both multipliers are ~111 000. At 60°N, the longitude multiplier drops to ~55 500. Using 64 000 for the Kazan deployment area (55.8°N) provides a reasonable equidistant approximation without requiring full Haversine calculation.

**UI mirroring:** The frontend duplicates the same check before form submission to show an inline error without a round-trip. The Zod schema validation on the backend remains the authoritative gate — the UI check is UX-only. Keeping the threshold constant (50m) in a shared schema ensures the two checks stay in sync.

The `refine()` path `["to"]` places the validation error on the `to` field in the Zod error tree, which the form library maps to the destination input field — correct UX since the user is expected to change the destination, not the origin.

## Related Concepts

- [[concepts/rls-guc-identity]] — Coordinate validation fires before any DB write; RLS is a separate layer that applies after the ride is persisted
- [[concepts/book-seat-on-accept-not-request]] — Related ride creation flow; coordinate validation is a prerequisite check before the ride can be created and seats managed
- [[concepts/zod-uuid-strict-validation]] — Same pattern: Zod validation at the schema level catches invalid input early; coordinate validation uses `refine()` rather than built-in validators

## Sources

- [[daily/2026-05-19.md]] — Session 14:44: `from==to` validation added via Zod `refine()` with 50m threshold; equidistant approximation at 55°N uses 111000×64000 multipliers; UI mirrors same check for inline error without round-trip; single source of truth in shared schema
