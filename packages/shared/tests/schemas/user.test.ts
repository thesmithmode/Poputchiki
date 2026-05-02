import { describe, expect, it } from "vitest";
import { UserDTO } from "../../src/schemas/user.js";

const validUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  tg_id: 123456789,
  tg_username: "ivan_petrov",
  display_name: "Иван Петров",
  avatar_url: "https://t.me/i/userpic/123.jpg",
  is_verified: false,
  is_banned: false,
  notify_disabled: false,
  role: "user" as const,
  likes_received_count: 5,
  rides_total_count: 10,
  rides_completed_count: 8,
  created_at: "2026-01-01T00:00:00Z",
  last_seen_at: "2026-05-01T12:00:00Z",
};

describe("UserDTO", () => {
  it("accepts valid user", () => {
    expect(UserDTO.safeParse(validUser).success).toBe(true);
  });

  it("accepts user without optional fields", () => {
    const { tg_username, avatar_url, ...minimal } = validUser;
    expect(UserDTO.safeParse(minimal).success).toBe(true);
  });

  it("rejects missing id", () => {
    const { id, ...rest } = validUser;
    expect(UserDTO.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid uuid id", () => {
    expect(UserDTO.safeParse({ ...validUser, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects empty display_name", () => {
    expect(UserDTO.safeParse({ ...validUser, display_name: "" }).success).toBe(false);
  });

  it("rejects invalid role", () => {
    expect(UserDTO.safeParse({ ...validUser, role: "superadmin" }).success).toBe(false);
  });

  it("rejects negative likes_received_count", () => {
    expect(UserDTO.safeParse({ ...validUser, likes_received_count: -1 }).success).toBe(false);
  });

  it("accepts admin role", () => {
    expect(UserDTO.safeParse({ ...validUser, role: "admin" }).success).toBe(true);
  });

  it("infers correct TypeScript type", () => {
    const result = UserDTO.parse(validUser);
    // Type assertion — tg_id is number
    const _tgId: number = result.tg_id;
    expect(typeof _tgId).toBe("number");
  });
});
