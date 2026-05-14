---
title: "Test Assertion Contract Drift — Exact-Arg Checks Break on Implementation Changes"
aliases: [test-contract-drift, exact-args-fragility, sentinel-test-sync, test-assertion-drift]
tags: [testing, discipline, gotcha, vitest]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# Test Assertion Contract Drift — Exact-Arg Checks Break on Implementation Changes

Tests that assert exact call arguments (`toHaveBeenCalledWith({ method: "POST" })`) break when the implementation adds new fields to the same call (e.g., adding `body` to a fetch). The test was correct at the time it was written, but the implementation contract drifted without the test being updated. CI turns red on a seemingly unrelated change.

## Key Points

- `expect(fetch).toHaveBeenCalledWith(url, { method: "POST" })` fails when implementation adds `{ method: "POST", body: JSON.stringify({...}) }`
- Vitest's `toHaveBeenCalledWith` uses deep strict equality — any extra property in the actual call causes a mismatch
- Fix: use `expect.objectContaining({ method: "POST" })` for resilient partial matching, or update the assertion to include the new fields
- Sentinel tests (tests guarding specific behaviors) must be updated synchronously when the guarded contract changes — a separate commit that changes the implementation without updating the test is a CI time bomb
- The CI failure appears in the test file, not in the implementation file — the developer may misdiagnose the test as broken rather than recognizing a contract change

## Details

During the 2026-05-14 session, `SettingsScreen.test.tsx` contained a test verifying that the logout button calls `apiFetch` with `{ method: "POST" }`. When the logout implementation was updated to include refresh and access tokens in the request body (`{ method: "POST", body: JSON.stringify({ refreshToken, accessToken }) }`), the test failed because the actual call now included a `body` property that the assertion did not expect.

The failure is a specific instance of a general pattern: any test that uses strict equality on call arguments will break when the implementation adds, removes, or changes any field in the argument object. The tighter the assertion, the more brittle it is to implementation changes.

Two resolution strategies exist:

**Strategy 1 — Partial matching (resilient):**
```typescript
expect(apiFetch).toHaveBeenCalledWith(
  "/auth/logout",
  expect.objectContaining({ method: "POST" })
);
```
This passes regardless of additional properties in the argument. Use when the test cares about specific properties, not the complete shape.

**Strategy 2 — Full assertion update (strict):**
```typescript
expect(apiFetch).toHaveBeenCalledWith(
  "/auth/logout",
  { method: "POST", body: JSON.stringify({ refreshToken: "mock-rt", accessToken: "mock-at" }) }
);
```
This documents the exact contract. Use when the test should verify the complete call shape as a specification.

Strategy 1 is more maintainable but less precise. Strategy 2 catches unintended changes but requires synchronous updates when the contract evolves. The choice depends on whether the test's purpose is "verify POST method is used" (partial) or "verify exact logout request shape" (strict).

The meta-lesson: when modifying a function's call signature or adding fields to its arguments, search for all tests that assert on that function's calls. In Vitest, `toHaveBeenCalledWith`, `toHaveBeenLastCalledWith`, and `toHaveBeenNthCalledWith` are the assertion patterns to grep for. Update or relax them before pushing.

## Related Concepts

- [[concepts/coverage-gate-discipline]] - Contract drift tests still count as coverage — the test file covers the calling code, but the assertion is wrong; coverage alone does not catch this
- [[concepts/task-completion-integrity]] - Related discipline: tests that were correct when written become stale; unlike fake-done tests, these were real tests that drifted

## Sources

- [[daily/2026-05-14.md]] - Session 12:58: `SettingsScreen.test.tsx` checked exact `{ method: "POST" }` argument; logout implementation added `body` with tokens → CI red; fix: update test assertion to match new contract
