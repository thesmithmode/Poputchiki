---
title: "Zod v4 UUID Strict RFC 4122 Validation"
aliases: [zod-uuid, z-uuid, rfc4122-uuid, uuid-validation]
tags: [testing, validation, zod, gotcha]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# Zod v4 UUID Strict RFC 4122 Validation

`z.uuid()` in Zod v4 enforces full RFC 4122 compliance including the version (4) and variant (8-b) bits, not just format structure. Test fixtures using sequential or manually crafted UUIDs that violate the spec will fail validation with a 422 response, causing false test failures unrelated to business logic.

## Key Points

- `z.uuid()` validates both format (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) AND RFC 4122 version/variant bits
- UUID version 4: the 13th hex digit (4th group, 1st char) must be `4`
- UUID variant: the 17th hex digit (4th group, 1st char of 3rd group = bits 8-9 of clock_seq_hi) must be `8`, `9`, `a`, or `b`
- Test fixture `11111111-0000-0000-0000-000000000001` → fails (version = `0`, variant = `0`)
- Correct fixture format: `00000000-0000-4000-b000-000000000001` (version=4, variant=b)
- Failure symptom: test expects 200/404/409 but receives 422 Unprocessable Entity

## Details

During TASK-133 integration test hardening on 2026-05-03, several tests began returning 422 responses. The root cause was that Zod v4 introduced strict RFC 4122 validation in `z.uuid()`. Previous test fixtures followed the UUID shape visually but violated the spec at the bit level: `11111111-0000-0000-0000-000000000001` has version `0` (should be `4`) and variant `0` (should be `8-b`).

The RFC 4122 spec defines UUIDs with these mandatory fields: version encoded in bits 4-7 of the time_hi_and_version field (3rd group, 1st nibble = `4`), and variant encoded in bits 6-7 of clock_seq_hi_and_reserved (4th group, 1st nibble must be `8`, `9`, `a`, or `b` — the high two bits must be `10` in binary).

A safe test fixture generator: take any valid UUID (e.g., from `crypto.randomUUID()`) and replace predictable hex segments for readability while preserving the version and variant nibbles. `00000000-0000-4000-b000-000000000001` through `00000000-0000-4000-b000-000000000099` is a safe sequence of 99 fixtures.

The failure is deceptive because the 422 response comes from the Zod validation layer before any business logic executes — the test appears to fail on a missing resource or conflict but actually fails at input parsing. Checking the response body for a validation error message confirms the cause.

## Related Concepts

- [[concepts/coverage-gate-discipline]] - Test failures from invalid fixtures inflate uncovered lines when the happy path handler is never reached
- [[concepts/scope-creep-sentinel]] - UUID validation failures during TASK-133 were part of the test hardening session that scoped-crept into migrations
- [[concepts/hono-route-prefix-test-mismatch]] - Co-occurring test infrastructure gotcha discovered in the same session

## Sources

- [[daily/2026-05-03.md]] - Session 19:51: Zod v4 UUID strict validation discovered; fixtures `11111111-0000-0000-0000-000000000001` returning 422; replaced with RFC 4122 compliant `00000000-0000-4000-b000-700000000001`
