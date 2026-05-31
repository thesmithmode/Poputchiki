import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avatarPath, buildAvatarUrl, syncTelegramAvatar } from "../../../src/users/avatarCache";

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
  if (oldAvatarDir === undefined) process.env.AVATAR_DIR = undefined;
  else process.env.AVATAR_DIR = oldAvatarDir;
  if (oldBotToken === undefined) process.env.BOT_TOKEN = undefined;
  else process.env.BOT_TOKEN = oldBotToken;
  if (oldDomain === undefined) process.env.DOMAIN = undefined;
  else process.env.DOMAIN = oldDomain;
  await rm(dir, { recursive: true, force: true });
});

describe("syncTelegramAvatar", () => {
  it("downloads the smallest useful Telegram profile photo and updates metadata", async () => {
    const { sql, tx } = makeSql([
      [],
      [
        {
          id: USER_ID,
          tg_id: TG_ID,
          avatar_url: null,
          avatar_file_unique_id: null,
          avatar_mime: null,
          avatar_checked_at: null,
        },
      ],
      [],
      [],
    ]);
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
        {
          id: USER_ID,
          tg_id: TG_ID,
          avatar_url: buildAvatarUrl(USER_ID, "same"),
          avatar_file_unique_id: "same",
          avatar_mime: "image/jpeg",
          avatar_checked_at: new Date(0),
        },
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
        {
          id: USER_ID,
          tg_id: TG_ID,
          avatar_url: buildAvatarUrl(USER_ID, "old"),
          avatar_file_unique_id: "old",
          avatar_mime: "image/jpeg",
          avatar_checked_at: new Date(0),
        },
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
});
