---
name: N+1 via SSE Invalidation
description: useRealtime hook triggers full fetchRides() on every SSE event regardless of relevance, no debounce — 50k users × any event = 50k simultaneous GET /rides
type: concept
tags: [frontend, sse, realtime, performance, n-plus-one, react]
created: 2026-05-20
updated: 2026-05-20
compiled_from: daily/2026-05-20.md (sector-shared-db review, shared-db-C4)
---

# N+1 via SSE Invalidation

## Problem

`useRealtime` hook listens for SSE events and calls `fetchRides()` (full list refetch) on every event, regardless of whether the event is relevant to the current view. No debounce. No differential update. One SSE push → one full HTTP GET from every connected client simultaneously.

At 50k concurrent users, a single ride-status change triggers 50k simultaneous `GET /rides` requests to the API server.

## Why It Matters

This is a self-induced thundering herd. The server broadcasts one notification, which causes every client to immediately hammer the API with a full data request. This is worse than polling because:
1. All requests arrive at the same instant (synchronized)
2. Each request returns the full rides list (no pagination/cursor in the hot path)
3. The trigger is under adversarial control — a single POST that causes an SSE event can DDoS the API

## Root Cause

```typescript
// WRONG — full refetch on every SSE event
useEffect(() => {
  sseClient.on('message', () => {
    fetchRides();  // no debounce, no relevance check
  });
}, []);
```

## Fix

Two complementary approaches:

**1. Debounce the refetch**
```typescript
const debouncedFetch = useMemo(
  () => debounce(fetchRides, 500),
  [fetchRides]
);

sseClient.on('message', debouncedFetch);
```

**2. Differential update from event payload**
Include enough data in the SSE event to update the local cache without a round-trip:
```typescript
sseClient.on('ride:updated', (event) => {
  queryClient.setQueryData(['rides'], (old) =>
    old?.map(r => r.id === event.rideId ? { ...r, ...event.patch } : r)
  );
});
```

Approach 2 is preferred — eliminates the round-trip entirely for most cases.

**3. Relevance filtering**
Only refetch if the event type is relevant to the current view/filters:
```typescript
sseClient.on('message', (event) => {
  if (isRelevantToCurrentView(event)) {
    debouncedFetch();
  }
});
```

## Affected Files

- `web/src/hooks/useRealtime.ts` or equivalent
- SSE event payload schema — may need `patch` fields added

## Related

- [[concepts/sse-broadcast-backpressure]] — server-side SSE delivery bottleneck feeding into this client-side amplification
- [[concepts/pg-listen-reconnect-loop]] — LISTEN/NOTIFY upstream that generates the SSE events
