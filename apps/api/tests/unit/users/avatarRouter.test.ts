import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAvatarRouter } from "../../../src/users/avatarRouter";

const USER_ID = "aaaaaaaa-0000-4000-a000-000000000001";

let dir: string;
let oldAvatarDir: string | undefined;

function makeSql(row: Record<string, unknown> | null) {
  const tx = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(row ? [row] : []);
  return {
    begin: vi.fn((fn: (arg: unknown) => unknown) => fn(tx)),
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pp-avatar-route-"));
  oldAvatarDir = process.env.AVATAR_DIR;
  process.env.AVATAR_DIR = dir;
});

afterEach(async () => {
  if (oldAvatarDir === undefined) process.env.AVATAR_DIR = undefined;
  else process.env.AVATAR_DIR = oldAvatarDir;
  await rm(dir, { recursive: true, force: true });
});

describe("GET /:id/avatar", () => {
  it("returns cached avatar file with image cache headers", async () => {
    await writeFile(join(dir, `${USER_ID}.jpg`), new Uint8Array([1, 2, 3]));
    const row = {
      id: USER_ID,
      tg_id: 123,
      avatar_url: `/api/users/${USER_ID}/avatar?v=u1`,
      avatar_file_unique_id: "u1",
      avatar_mime: "image/jpeg",
      avatar_checked_at: new Date(),
    };

    const res = await createAvatarRouter(makeSql(row) as never).request(`/${USER_ID}/avatar`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns 404 when user has no cached avatar", async () => {
    const res = await createAvatarRouter(makeSql(null) as never).request(`/${USER_ID}/avatar`);

    expect(res.status).toBe(404);
  });
});
