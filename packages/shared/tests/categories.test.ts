import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_CATEGORIES,
  USER_TOGGLEABLE_CATEGORIES,
  isNotificationCategory,
  isUserToggleableCategory,
} from "../src/notifications/categories";

describe("notification categories catalog", () => {
  it("includes all 12 notifier whitelist categories", () => {
    const notifierWhitelist = [
      "ride_request",
      "ride_request_accepted",
      "ride_request_rejected",
      "ride_request_cancelled",
      "ride_cancelled",
      "confirm_participation",
      "participation_request",
      "like_received",
      "review_received",
      "favorite_new_ride",
      "support_reply",
      "system",
    ];
    for (const cat of notifierWhitelist) {
      expect(NOTIFICATION_CATEGORIES).toContain(cat);
    }
  });

  it("includes ride_changed (UI flow) + admin_review_cancellation_abuse (admin flow)", () => {
    expect(NOTIFICATION_CATEGORIES).toContain("ride_changed");
    expect(NOTIFICATION_CATEGORIES).toContain("admin_review_cancellation_abuse");
  });

  it("user-toggleable subset excludes system + admin_* + ride_changed", () => {
    expect(USER_TOGGLEABLE_CATEGORIES).not.toContain("system");
    expect(USER_TOGGLEABLE_CATEGORIES).not.toContain("ride_changed");
    expect(USER_TOGGLEABLE_CATEGORIES).not.toContain("admin_review_cancellation_abuse");
  });

  it("isNotificationCategory accepts canonical values", () => {
    expect(isNotificationCategory("ride_request")).toBe(true);
    expect(isNotificationCategory("system")).toBe(true);
  });

  it("isNotificationCategory rejects unknown / pg_notify channel names", () => {
    expect(isNotificationCategory("notify_user")).toBe(false);
    expect(isNotificationCategory("rides_changed")).toBe(false);
    expect(isNotificationCategory(null)).toBe(false);
    expect(isNotificationCategory(123)).toBe(false);
  });

  it("isUserToggleableCategory rejects system + admin + ride_changed", () => {
    expect(isUserToggleableCategory("system")).toBe(false);
    expect(isUserToggleableCategory("admin_review_cancellation_abuse")).toBe(false);
    expect(isUserToggleableCategory("ride_changed")).toBe(false);
    expect(isUserToggleableCategory("ride_request")).toBe(true);
  });

  it("no duplicates in catalog", () => {
    expect(new Set(NOTIFICATION_CATEGORIES).size).toBe(NOTIFICATION_CATEGORIES.length);
  });
});
