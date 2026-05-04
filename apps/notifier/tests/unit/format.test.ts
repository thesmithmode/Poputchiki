import { describe, expect, it } from "vitest";
import { formatMessage } from "../../src/format.js";
import type { NotifyPayload } from "../../src/types.js";

function payload(category: string, extra: Partial<NotifyPayload> = {}): NotifyPayload {
  return { user_id: "u1", category: category as never, ...extra };
}

describe("formatMessage", () => {
  it("ride_request", () => {
    expect(formatMessage("ride_request", payload("ride_request"))).toContain("заявк");
  });

  it("ride_cancelled", () => {
    expect(formatMessage("ride_cancelled", payload("ride_cancelled"))).toContain("отменена");
  });

  it("confirm_participation", () => {
    expect(formatMessage("confirm_participation", payload("confirm_participation"))).toContain(
      "подтвердил",
    );
  });

  it("participation_request", () => {
    expect(formatMessage("participation_request", payload("participation_request"))).toContain(
      "принят",
    );
  });

  it("like_received", () => {
    expect(formatMessage("like_received", payload("like_received"))).toContain("лайк");
  });

  it("review_received", () => {
    expect(formatMessage("review_received", payload("review_received"))).toContain("отзыв");
  });

  it("favorite_new_ride", () => {
    expect(formatMessage("favorite_new_ride", payload("favorite_new_ride"))).toContain("Избранный");
  });

  it("support_reply with message_id", () => {
    const msg = formatMessage("support_reply", payload("support_reply", { message_id: "42" }));
    expect(msg).toContain("#42");
  });

  it("support_reply without message_id", () => {
    const msg = formatMessage("support_reply", payload("support_reply"));
    expect(msg).toContain("поддержки");
  });

  it("system", () => {
    expect(formatMessage("system", payload("system"))).toContain("Системное");
  });
});
