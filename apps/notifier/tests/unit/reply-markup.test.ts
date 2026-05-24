import { describe, expect, it } from "vitest";
import { buildReplyMarkup } from "../../src/reply-markup.js";
import type { NotifyPayload } from "../../src/types.js";

function payload(extra: Partial<NotifyPayload> = {}): NotifyPayload {
  return { user_id: "u1", category: "ride_request", ...extra };
}

describe("buildReplyMarkup", () => {
  it("ride_request с request_id → inline_keyboard с accept/reject", () => {
    const m = buildReplyMarkup("ride_request", payload({ request_id: "req-1" }));
    expect(m).not.toBeNull();
    if (!m) throw new Error("unreachable");
    expect(m.inline_keyboard).toHaveLength(1);
    const row = m.inline_keyboard[0];
    if (!row) throw new Error("unreachable");
    expect(row).toHaveLength(2);
    const [accept, reject] = row;
    if (!accept || !reject) throw new Error("unreachable");
    expect(accept.callback_data).toBe("req:accept:req-1");
    expect(reject.callback_data).toBe("req:reject:req-1");
    expect(accept.text).toContain("Принять");
    expect(reject.text).toContain("Отклонить");
  });

  it("ride_request без request_id → null", () => {
    expect(buildReplyMarkup("ride_request", payload())).toBeNull();
  });

  it("ride_request с пустым request_id → null", () => {
    expect(buildReplyMarkup("ride_request", payload({ request_id: "" }))).toBeNull();
  });

  it("ride_request с нестроковым request_id → null", () => {
    const p = { ...payload(), request_id: 42 as unknown as string };
    expect(buildReplyMarkup("ride_request", p)).toBeNull();
  });

  it("like_received → null (нет inline-действий)", () => {
    expect(
      buildReplyMarkup("like_received", { ...payload(), category: "like_received" }),
    ).toBeNull();
  });

  it("system → null", () => {
    expect(buildReplyMarkup("system", { ...payload(), category: "system" })).toBeNull();
  });

  it("template_subscription_request с subscription_id → sub:accept/reject кнопки", () => {
    const p: ReturnType<typeof payload> = {
      ...payload(),
      category: "template_subscription_request",
      subscription_id: "sub-uuid-1",
    };
    const m = buildReplyMarkup("template_subscription_request", p);
    expect(m).not.toBeNull();
    if (!m) throw new Error("unreachable");
    const row = m.inline_keyboard[0];
    if (!row) throw new Error("unreachable");
    expect(row[0]?.callback_data).toBe("sub:accept:sub-uuid-1");
    expect(row[1]?.callback_data).toBe("sub:reject:sub-uuid-1");
  });

  it("template_subscription_request без subscription_id → null", () => {
    const p = { ...payload(), category: "template_subscription_request" as const };
    expect(buildReplyMarkup("template_subscription_request", p)).toBeNull();
  });
});
