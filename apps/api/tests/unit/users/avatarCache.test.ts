import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  avatarExt,
  avatarPath,
  buildAvatarUrl,
  isAvatarStale,
  syncTelegramAvatar,
} from "../../../src/users/avatarCache";

const USER_ID = "aaaaaaaa-0000-4000-a000-000000000001";
const TG_ID = 123456789;

let dir: string;
let oldAvatarDir: string | undefined;
let oldBotToken: string | undefined;
let oldDomain: string | undefined;

function makeSql(rows: unknown[]) {
  const tx = vi.fn();
  for (const row of rows) tx.mockResolvedValueOnce(row);
  return {
    tx,
    sql: {
      begin: vi.fn((fn: (arg: unknown) => unknown) => fn(tx)),
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function clearEnv(name: string): void {
  Reflect.deleteProperty(process.env, name);
}

function restoreEnv(name: string, value: string | undefined): void {
  clearEnv(name);
  if (value !== undefined) process.env[name] = value;
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    tg_id: TG_ID,
    avatar_url: null,
    avatar_file_unique_id: null,
    avatar_mime: null,
    avatar_checked_at: null,
    ...overrides,
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pp-avatars-"));
  oldAvatarDir = process.env.AVATAR_DIR;
  oldBotToken = process.env.BOT_TOKEN;
  oldDomain = process.env.DOMAIN;
  process.env.AVATAR_DIR = dir;
  process.env.BOT_TOKEN = "123456789:token";
  process.env.DOMAIN = "example.test";
});

afterEach(async () => {
  vi.unstubAllGlobals();
  restoreEnv("AVATAR_DIR", oldAvatarDir);
  restoreEnv("BOT_TOKEN", oldBotToken);
  restoreEnv("DOMAIN", oldDomain);
  await rm(dir, { recursive: true, force: true });
});

describe("syncTelegramAvatar", () => {
  it("formats helper values without exposing Telegram token to the client", () => {
    expect(isAvatarStale(null)).toBe(true);
    expect(isAvatarStale(new Date(Date.now() - 25 * 60 * 60 * 1000))).toBe(true);
    expect(isAvatarStale(new Date())).toBe(false);
    expect(avatarExt("image/jpeg")).toBe("jpg");
    expect(avatarExt("application/octet-stream")).toBeNull();
    expect(avatarExt(null)).toBeNull();
    expect(avatarPath(USER_ID, "application/octet-stream")).toBeNull();
    expect(buildAvatarUrl(USER_ID, "file unique/id")).toBe(
      `https://api.example.test/api/users/${USER_ID}/avatar?v=file%20unique%2Fid`,
    );
    clearEnv("DOMAIN");
    expect(buildAvatarUrl(USER_ID, "u1")).toBe(`/api/users/${USER_ID}/avatar?v=u1`);
  });

  it("returns early without Telegram token, finite tg id, or user row", async () => {
    const { sql: withoutTokenSql, tx: withoutTokenTx } = makeSql([]);
    clearEnv("BOT_TOKEN");
    await syncTelegramAvatar(withoutTokenSql as never, USER_ID, TG_ID);
    expect(withoutTokenTx).not.toHaveBeenCalled();

    process.env.BOT_TOKEN = "123456789:token";
    const { sql: badTgSql, tx: badTgTx } = makeSql([]);
    await syncTelegramAvatar(badTgSql as never, USER_ID, Number.NaN);
    expect(badTgTx).not.toHaveBeenCalled();

    const { sql: noUserSql } = makeSql([[], []]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await syncTelegramAvatar(noUserSql as never, USER_ID, TG_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("downloads the smallest useful Telegram profile photo and updates metadata", async () => {
    const { sql, tx } = makeSql([[], [userRow()], [], []]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          result: {
            total_count: 1,
            photos: [
              [
                { file_id: "small", file_unique_id: "u-small", width: 40, height: 40 },
                { file_id: "good", file_unique_id: "u-good", width: 120, height: 120 },
                { file_id: "large", file_unique_id: "u-large", width: 640, height: 640 },
              ],
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          result: { file_id: "good", file_unique_id: "u-good", file_path: "photos/good.jpg" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await syncTelegramAvatar(sql as never, USER_ID, TG_ID);

    expect(Array.from(await readFile(avatarPath(USER_ID, "image/jpeg") as string))).toEqual([
      1, 2, 3,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("file_id=good");
    expect(tx).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.stringContaining("avatar_file_unique_id")]),
      buildAvatarUrl(USER_ID, "u-good"),
      "u-good",
      "image/jpeg",
      USER_ID,
    );
  });

  it("does not redownload when file_unique_id is unchanged and local file exists", async () => {
    await writeFile(join(dir, `${USER_ID}.jpg`), new Uint8Array([9]));
    const { sql } = makeSql([
      [],
      [
        userRow({
          avatar_url: buildAvatarUrl(USER_ID, "same"),
          avatar_file_unique_id: "same",
          avatar_mime: "image/jpeg",
          avatar_checked_at: new Date(0),
        }),
      ],
      [],
      [],
    ]);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        result: {
          total_count: 1,
          photos: [[{ file_id: "same-file", file_unique_id: "same", width: 120, height: 120 }]],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await syncTelegramAvatar(sql as never, USER_ID, TG_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Array.from(await readFile(join(dir, `${USER_ID}.jpg`)))).toEqual([9]);
  });

  it("clears cached metadata and file when Telegram has no profile photo", async () => {
    await writeFile(join(dir, `${USER_ID}.jpg`), new Uint8Array([9]));
    const { sql } = makeSql([
      [],
      [
        userRow({
          avatar_url: buildAvatarUrl(USER_ID, "old"),
          avatar_file_unique_id: "old",
          avatar_mime: "image/jpeg",
          avatar_checked_at: new Date(0),
        }),
      ],
      [],
      [],
    ]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ ok: true, result: { total_count: 0, photos: [] } })),
    );

    await syncTelegramAvatar(sql as never, USER_ID, TG_ID);

    await expect(readFile(join(dir, `${USER_ID}.jpg`))).rejects.toThrow();
  });

  it("clears avatar when Telegram profile response is unavailable or malformed", async () => {
    for (const response of [
      new Response("telegram down", { status: 500 }),
      new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
      jsonResponse({ ok: false, description: "not found" }),
    ]) {
      await writeFile(join(dir, `${USER_ID}.jpg`), new Uint8Array([9]));
      const { sql } = makeSql([
        [],
        [userRow({ avatar_file_unique_id: "old", avatar_mime: "image/jpeg" })],
        [],
        [],
      ]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response));

      await syncTelegramAvatar(sql as never, USER_ID, TG_ID);

      await expect(readFile(join(dir, `${USER_ID}.jpg`))).rejects.toThrow();
    }
  });

  it("updates checked_at without storing a file when Telegram cannot resolve a file path", async () => {
    const { sql, tx } = makeSql([[], [userRow()], []]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            ok: true,
            result: {
              total_count: 1,
              photos: [[{ file_id: "photo", file_unique_id: "u1", width: 120, height: 120 }]],
            },
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ ok: true, result: { file_id: "photo" } })),
    );

    await syncTelegramAvatar(sql as never, USER_ID, TG_ID);

    expect(tx).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.stringContaining("avatar_checked_at")]),
      USER_ID,
    );
    await expect(readFile(join(dir, `${USER_ID}.jpg`))).rejects.toThrow();
  });

  it("updates checked_at when Telegram getFile response is unavailable", async () => {
    const { sql, tx } = makeSql([[], [userRow()], []]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            ok: true,
            result: {
              total_count: 1,
              photos: [[{ file_id: "photo", file_unique_id: "u1", width: 120, height: 120 }]],
            },
          }),
        )
        .mockResolvedValueOnce(new Response("telegram down", { status: 500 })),
    );

    await syncTelegramAvatar(sql as never, USER_ID, TG_ID);

    expect(tx).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.stringContaining("avatar_checked_at")]),
      USER_ID,
    );
  });

  it("clears avatar when Telegram reports an oversized file", async () => {
    await writeFile(join(dir, `${USER_ID}.jpg`), new Uint8Array([9]));
    const { sql } = makeSql([
      [],
      [userRow({ avatar_file_unique_id: "old", avatar_mime: "image/jpeg" })],
      [],
      [],
    ]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            ok: true,
            result: {
              total_count: 1,
              photos: [[{ file_id: "photo", file_unique_id: "u1", width: 120, height: 120 }]],
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            ok: true,
            result: { file_id: "photo", file_path: "photos/a.jpg", file_size: 128 * 1024 + 1 },
          }),
        ),
    );

    await syncTelegramAvatar(sql as never, USER_ID, TG_ID);

    await expect(readFile(join(dir, `${USER_ID}.jpg`))).rejects.toThrow();
  });

  it("keeps old metadata checked when Telegram file download is unavailable", async () => {
    const { sql, tx } = makeSql([[], [userRow()], []]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            ok: true,
            result: {
              total_count: 1,
              photos: [[{ file_id: "photo", file_unique_id: "u1", width: 120, height: 120 }]],
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            ok: true,
            result: { file_id: "photo", file_path: "photos/a.jpg" },
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 503 })),
    );

    await syncTelegramAvatar(sql as never, USER_ID, TG_ID);

    expect(tx).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.stringContaining("avatar_checked_at")]),
      USER_ID,
    );
  });

  it("clears avatar on unsupported or empty image content", async () => {
    for (const response of [
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
      new Response(new Uint8Array([]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    ]) {
      await writeFile(join(dir, `${USER_ID}.jpg`), new Uint8Array([9]));
      const { sql } = makeSql([
        [],
        [userRow({ avatar_file_unique_id: "old", avatar_mime: "image/jpeg" })],
        [],
        [],
      ]);
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(
            jsonResponse({
              ok: true,
              result: {
                total_count: 1,
                photos: [[{ file_id: "photo", file_unique_id: "u1", width: 120, height: 120 }]],
              },
            }),
          )
          .mockResolvedValueOnce(
            jsonResponse({
              ok: true,
              result: { file_id: "photo", file_path: "photos/a.jpg" },
            }),
          )
          .mockResolvedValueOnce(response),
      );

      await syncTelegramAvatar(sql as never, USER_ID, TG_ID);

      await expect(readFile(join(dir, `${USER_ID}.jpg`))).rejects.toThrow();
    }
  });
});
