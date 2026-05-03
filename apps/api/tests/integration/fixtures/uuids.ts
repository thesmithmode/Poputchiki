/**
 * Reserved UUID fixtures for integration tests.
 * Pattern: 00000000-0000-4000-{group}-{seq} (valid v4 hex; deterministic).
 *
 * Groups (3rd segment last byte):
 *   a → users (test users, admins)
 *   c → drivers
 *   r → rides
 *   e → events / triggers
 *
 * Use these constants instead of inline UUID strings to avoid drift,
 * collisions, and "invalid input syntax for type uuid" errors from
 * non-hex characters that crept into ad-hoc fixtures historically.
 */

export const TEST_UUIDS = {
  USER_A: "00000000-0000-4000-a000-a10000000001",
  USER_B: "00000000-0000-4000-a000-a10000000002",
  USER_C: "00000000-0000-4000-a000-a10000000003",
  ADMIN_A: "00000000-0000-4000-a000-ad0000000001",
  IDENTITY_GUARD_PRIMARY: "00000000-0000-4000-a000-012000000001",
  IDENTITY_GUARD_OTHER: "00000000-0000-4000-a000-012000000002",
  DRIVER_A: "00000000-0000-4000-c000-c00000000001",
  DRIVER_B: "00000000-0000-4000-c000-c00000000002",
  RIDE_A: "00000000-0000-4000-c000-100000000001",
  RIDE_B: "00000000-0000-4000-c000-100000000002",
  RIDE_C: "00000000-0000-4000-c000-100000000003",
  USER_ME_A: "00000000-0000-4000-a000-200000000001",
  USER_ME_B: "00000000-0000-4000-a000-200000000002",
  USER_ME_C: "00000000-0000-4000-a000-200000000003",
} as const;

export const TEST_TG_IDS = {
  USER_A: 7001,
  USER_B: 7002,
  USER_C: 7003,
  DRIVER_A: 9001,
  DRIVER_B: 9002,
} as const;
