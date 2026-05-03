import { describe, expect, it, vi } from "vitest";
import { decryptUserPii, encryptPii } from "../../../src/db/crypto";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
type MockSql = any;

describe("encryptPii", () => {
  it("calls set_config then encrypt_pii and returns enc buffer", async () => {
    const fakeEnc = Buffer.from("ciphertext", "utf8");
    const sql: MockSql = vi
      .fn()
      .mockResolvedValueOnce([]) // set_config call
      .mockResolvedValueOnce([{ enc: fakeEnc }]); // encrypt_pii call

    const result = await encryptPii(sql, "secret-phone", "test-key");
    expect(sql).toHaveBeenCalledTimes(2);
    expect(result).toBe(fakeEnc);
  });

  it("returns empty Buffer when sql returns no rows", async () => {
    const sql: MockSql = vi
      .fn()
      .mockResolvedValueOnce([]) // set_config
      .mockResolvedValueOnce([]); // encrypt_pii → empty
    const result = await encryptPii(sql, "phone", "key");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });
});

describe("decryptUserPii", () => {
  it("calls set_config then decrypt_user_pii and returns row", async () => {
    const fakeRow = { phone: "+7 999 000 00 00", apt_number: "42" };
    const sql: MockSql = vi
      .fn()
      .mockResolvedValueOnce([]) // set_config
      .mockResolvedValueOnce([fakeRow]); // decrypt_user_pii

    const result = await decryptUserPii(sql, "some-uuid", "test-key");
    expect(sql).toHaveBeenCalledTimes(2);
    expect(result).toEqual(fakeRow);
  });

  it("returns null fields when sql returns no rows (ownership check failed)", async () => {
    const sql2: MockSql = vi
      .fn()
      .mockResolvedValueOnce([]) // set_config
      .mockResolvedValueOnce([]); // decrypt_user_pii → empty (not owner)
    const result = await decryptUserPii(sql2, "other-uuid", "test-key");
    expect(result).toEqual({ phone: null, apt_number: null });
  });
});
