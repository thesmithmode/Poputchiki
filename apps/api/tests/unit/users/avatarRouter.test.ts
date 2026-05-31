import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAvatarRouter } from "../../../src/users/avatarRouter";

const USER_ID = "aaaaaaaa-0000-4000-a000-000000000001";
const syncTelegramAvatarMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/users/avatarCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/users/avatarCache")>();
  return {
    ...actual,
    syncTelegramAvatar: syncTelegramAvatarMock,
  };
});

let dir: string;
let oldAvatarDir: string | undefined;

function makeSqlRows(rows: Array<Record<string, unknown> | null>) {
  const tx = vi.fn();
  for (const row of rows) {
    tx.mockResolvedValueOnce([]).mockResolvedValueOnce(row ? [row] : []);
  }
  return {
    begin: vi.fn((fn: (arg: unknown) => unknown) => fn(tx)),
  };
}

function makeSql(row: Record<string, unknown> | null) {
  return makeSqlRows([row]);
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    tg_id: 123,
    avatar_url: `/api/users/${USER_ID}/avatar?v=u1`,
    avatar_file_unique_id: "u1",
    avatar_mime: "image/jpeg",
    avatar_checked_at: new Date(),
    ...overrides,
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pp-avatar-route-"));
  oldAvatarDir = process.env.AVATAR_DIR;
  process.env.AVATAR_DIR = dir;
  syncTelegramAvatarMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  syncTelegramAvatarMock.mockReset();
  if (oldAvatarDir === undefined) process.env.AVATAR_DIR = undefined;
  else process.env.AVATAR_DIR = oldAvatarDir;
  await rm(dir, { recursive: true, force: true });
});

describe("GET /:id/avatar", () => {
  it("returns cached avatar file with image cache headers", async () => {
    await writeFile(join(dir, `${USER_ID}.jpg`), new Uint8Array([1, 2, 3]));

    const res = await createAvatarRouter(makeSql(row()) as never).request(`/${USER_ID}/avatar`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns 404 when user has no cached avatar", async () => {
    const res = await createAvatarRouter(makeSql(null) as never).request(`/${USER_ID}/avatar`);

    expect(res.status).toBe(404);
  });

  it("returns 404 for invalid ids and rows without a supported avatar mime", async () => {
    expect(await createAvatarRouter(makeSql(row()) as never).request("/bad/avatar")).toHaveProperty(
      "status",
      404,
    );

    const res = await createAvatarRouter(makeSql(row({ avatar_mime: null })) as never).request(
      `/${USER_ID}/avatar`,
    );

    expect(res.status).toBe(404);
  });

  it("refreshes stale metadata before returning the cached file", async () => {
    await writeFile(join(dir, `${USER_ID}.jpg`), new Uint8Array([4, 5]));
    const res = await createAvatarRouter(
      makeSqlRows([row({ avatar_checked_at: new Date(0) }), row()]) as never,
    ).request(`/${USER_ID}/avatar`);

    expect(res.status).toBe(200);
    expect(syncTelegramAvatarMock).toHaveBeenCalledWith(expect.anything(), USER_ID, 123);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([4, 5]));
  });

  it("returns 404 when a stale refresh removes the user row", async () => {
    const res = await createAvatarRouter(
      makeSqlRows([row({ avatar_checked_at: new Date(0) }), null]) as never,
    ).request(`/${USER_ID}/avatar`);

    expect(res.status).toBe(404);
  });

  it("retries refresh when metadata points to a missing file", async () => {
    syncTelegramAvatarMock.mockImplementationOnce(async () => {
      await writeFile(join(dir, `${USER_ID}.jpg`), new Uint8Array([7, 8]));
    });
    const res = await createAvatarRouter(makeSqlRows([row(), row()]) as never).request(
      `/${USER_ID}/avatar`,
    );

    expect(res.status).toBe(200);
    expect(syncTelegramAvatarMock).toHaveBeenCalledWith(expect.anything(), USER_ID, 123);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([7, 8]));
  });

  it("returns 404 when refresh cannot restore a missing local file", async () => {
    const res = await createAvatarRouter(makeSqlRows([row(), row()]) as never).request(
      `/${USER_ID}/avatar`,
    );

    expect(res.status).toBe(404);
  });
});
