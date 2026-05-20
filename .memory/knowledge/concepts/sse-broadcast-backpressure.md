---
name: SSE Broadcast Backpressure
description: Synchronous for-await over all SSE clients means one slow client blocks all broadcasts — event loop saturation at 50k users
type: concept
tags: [sse, realtime, performance, scalability, backend, event-loop]
created: 2026-05-20
updated: 2026-05-20
compiled_from: daily/2026-05-20.md (sector-api-backend review, api-C5)
---

# SSE Broadcast Backpressure

## Problem

The SSE broadcast loop iterates all connected clients sequentially with `for await`. Writing to one slow or unresponsive client blocks the loop — subsequent clients don't receive events until the slow write completes or times out. At 50k concurrent users this serializes all broadcasts behind the slowest connection.

## Why It Matters

SSE is the primary realtime channel for ride updates. If a single mobile client on a 2G connection takes 5 seconds to receive a write, all 49 999 other clients wait. During a surge (new ride posted → all clients notified) this collapses event delivery to near-zero throughput.

The event loop in Bun/Node is single-threaded — blocking it with sequential slow I/O is a direct path to service degradation without any CPU saturation signal in metrics.

## Root Cause

```typescript
// WRONG — sequential, backpressure propagates
for await (const client of sseClients) {
  await client.send(event);
}
```

Each `await client.send()` yields to the microtask queue but stays serial within the loop. A TCP write that blocks (full kernel buffer, slow ACK) stalls the entire iteration.

## Fix

Fire all sends concurrently, ignore per-client failures, enforce a per-write timeout:

```typescript
const SEND_TIMEOUT_MS = 1000;

await Promise.allSettled(
  [...sseClients].map(client =>
    Promise.race([
      client.send(event),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('send timeout')), SEND_TIMEOUT_MS)
      ),
    ]).catch(err => {
      sseClients.delete(client);  // evict on timeout/error
      client.close();
    })
  )
);
```

`Promise.allSettled` ensures one failed client never prevents others from receiving events.

## Additional Concerns

- Dead client cleanup: clients that disconnect without FIN are discovered only on next send. Heartbeat ping every 30s + evict on failure.
- Memory: unbounded `sseClients` set grows indefinitely if eviction is missed. Cap at max connections or use WeakRef.

## Affected Files

- `apps/notifier/src/` or `apps/api/src/sse/` — broadcast implementation

## Related

- [[concepts/n-plus-one-sse-invalidation]] — SSE events triggering full data refetch on client side
- [[concepts/pg-listen-reconnect-loop]] — upstream LISTEN/NOTIFY reconnect feeding into this broadcast path
