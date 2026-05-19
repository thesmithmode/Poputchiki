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

  it("ride_request с passenger_name → включает имя", () => {
    const msg = formatMessage(
      "ride_request",
      payload("ride_request", { passenger_name: "Иван Иванов" }),
    );
    expect(msg).toContain("Иван Иванов");
  });

  it("ride_request_accepted", () => {
    expect(formatMessage("ride_request_accepted", payload("ride_request_accepted"))).toContain(
      "принял",
    );
  });

  it("ride_request_accepted с driver_name → включает имя и принял", () => {
    const msg = formatMessage(
      "ride_request_accepted",
      payload("ride_request_accepted", { driver_name: "Алексей Петров" }),
    );
    expect(msg).toContain("Алексей Петров");
    expect(msg).toContain("принял");
  });

  it("ride_request_rejected", () => {
    expect(formatMessage("ride_request_rejected", payload("ride_request_rejected"))).toContain(
      "отклонил",
    );
  });

  it("ride_request_rejected с driver_name → включает имя и отклонил", () => {
    const msg = formatMessage(
      "ride_request_rejected",
      payload("ride_request_rejected", { driver_name: "Алексей Петров" }),
    );
    expect(msg).toContain("Алексей Петров");
    expect(msg).toContain("отклонил");
  });

  it("ride_request_cancelled", () => {
    expect(formatMessage("ride_request_cancelled", payload("ride_request_cancelled"))).toContain(
      "отменил",
    );
  });

  it("ride_request_cancelled с passenger_name → включает имя", () => {
    const msg = formatMessage(
      "ride_request_cancelled",
      payload("ride_request_cancelled", { passenger_name: "Мария Сидорова" }),
    );
    expect(msg).toContain("Мария Сидорова");
  });

  it("ride_changed", () => {
    expect(formatMessage("ride_changed", payload("ride_changed"))).toContain("изменены");
  });

  it("admin_review_cancellation_abuse", () => {
    expect(
      formatMessage("admin_review_cancellation_abuse", payload("admin_review_cancellation_abuse")),
    ).toContain("проверка");
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
