import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import type postgres from "postgres";
import { withSystem } from "../db/with-identity";
import { UUID_RE } from "../lib/uuid";
import { type AvatarRow, avatarPath, isAvatarStale, syncTelegramAvatar } from "./avatarCache";

async function readAvatarRow(sql: postgres.Sql, id: string): Promise<AvatarRow | null> {
  const rows = await withSystem(sql, async (tx) => {
    return tx<AvatarRow[]>`
      SELECT id, tg_id, avatar_url, avatar_file_unique_id, avatar_mime, avatar_checked_at
      FROM users
      WHERE id = ${id}::uuid AND deleted_at IS NULL AND is_banned = false
      LIMIT 1
    `;
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ?? null;
}

export function createAvatarRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.get("/:id/avatar", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.text("not found", 404);

    let row = await readAvatarRow(sql, id);
    if (!row) return c.text("not found", 404);

    if (isAvatarStale(row.avatar_checked_at)) {
      await syncTelegramAvatar(sql, row.id, Number(row.tg_id)).catch(() => undefined);
      row = await readAvatarRow(sql, id);
      if (!row) return c.text("not found", 404);
    }

    const path = row.avatar_mime ? avatarPath(row.id, row.avatar_mime) : null;
    if (!path) return c.text("not found", 404);

    let bytes: Uint8Array;
    try {
      bytes = await readFile(path);
    } catch {
      await syncTelegramAvatar(sql, row.id, Number(row.tg_id)).catch(() => undefined);
      const refreshed = await readAvatarRow(sql, id);
      const refreshedPath =
        refreshed?.avatar_mime !== null && refreshed?.avatar_mime !== undefined
          ? avatarPath(refreshed.id, refreshed.avatar_mime)
          : null;
      if (!refreshedPath) return c.text("not found", 404);
      try {
        bytes = await readFile(refreshedPath);
        row = refreshed;
      } catch {
        return c.text("not found", 404);
      }
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": row?.avatar_mime ?? "image/jpeg",
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  return app;
}
