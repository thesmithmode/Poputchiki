import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";
import { withSystem } from "../db/with-identity";
import { logger } from "../lib/logger";

const MIN_AVATAR_SIZE = 96;
const MAX_AVATAR_BYTES = 128 * 1024;
const AVATAR_TTL_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_API_BASE = "https://api.telegram.org";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramUserProfilePhotos {
  total_count: number;
  photos: TelegramPhotoSize[][];
}

interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_path?: string;
  file_size?: number;
}

export interface AvatarRow {
  id: string;
  tg_id: string | number;
  avatar_url: string | null;
  avatar_file_unique_id: string | null;
  avatar_mime: string | null;
  avatar_checked_at: Date | null;
}

export function isAvatarStale(checkedAt: Date | null | undefined): boolean {
  if (!checkedAt) return true;
  return Date.now() - checkedAt.getTime() > AVATAR_TTL_MS;
}

export function avatarDir(): string {
  return process.env.AVATAR_DIR || "/app/avatars";
}

export function avatarExt(mime: string | null | undefined): string | null {
  return mime ? (MIME_EXT[mime] ?? null) : null;
}

export function avatarPath(userId: string, mime: string): string | null {
  const ext = avatarExt(mime);
  return ext ? join(avatarDir(), `${userId}.${ext}`) : null;
}

export function buildAvatarUrl(userId: string, fileUniqueId: string): string {
  const path = `/api/users/${userId}/avatar?v=${encodeURIComponent(fileUniqueId)}`;
  const domain = process.env.DOMAIN;
  return domain ? `https://api.${domain}${path}` : path;
}

function choosePhoto(sizes: TelegramPhotoSize[]): TelegramPhotoSize | null {
  const usable = sizes.filter((p) => {
    if (!p.file_id || !p.file_unique_id) return false;
    return p.file_size === undefined || p.file_size <= MAX_AVATAR_BYTES;
  });
  const enough = usable
    .filter((p) => p.width >= MIN_AVATAR_SIZE && p.height >= MIN_AVATAR_SIZE)
    .sort((a, b) => a.width * a.height - b.width * b.height);
  if (enough[0]) return enough[0];
  return usable.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

async function telegramJson<T>(
  botToken: string,
  method: string,
  params: Record<string, string | number>,
): Promise<T | null> {
  const url = new URL(`${TELEGRAM_API_BASE}/bot${botToken}/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as TelegramResponse<T> | null;
  return body?.ok && body.result ? body.result : null;
}

export async function deleteAvatarFiles(userId: string): Promise<void> {
  await Promise.all(
    Object.values(MIME_EXT).map((ext) =>
      unlink(join(avatarDir(), `${userId}.${ext}`)).catch(() => undefined),
    ),
  );
}

async function markAvatarMissing(sql: postgres.Sql, userId: string): Promise<void> {
  await deleteAvatarFiles(userId);
  await withSystem(sql, async (tx) => {
    await tx`
      UPDATE users
      SET avatar_url = NULL,
          avatar_file_unique_id = NULL,
          avatar_mime = NULL,
          avatar_checked_at = NOW()
      WHERE id = ${userId}::uuid
    `;
  });
}

export async function syncTelegramAvatar(
  sql: postgres.Sql,
  userId: string,
  tgId: number,
): Promise<void> {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken || !Number.isFinite(tgId)) return;

  const existingRows = await withSystem(sql, async (tx) => {
    return tx<AvatarRow[]>`
      SELECT id, tg_id, avatar_url, avatar_file_unique_id, avatar_mime, avatar_checked_at
      FROM users
      WHERE id = ${userId}::uuid AND deleted_at IS NULL AND is_banned = false
      LIMIT 1
    `;
  });
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (!existing) return;

  const profile = await telegramJson<TelegramUserProfilePhotos>(botToken, "getUserProfilePhotos", {
    user_id: tgId,
    limit: 1,
  });
  const latest = choosePhoto(profile?.photos?.[0] ?? []);
  if (!latest) {
    await markAvatarMissing(sql, userId);
    return;
  }

  const oldPath =
    existing.avatar_file_unique_id === latest.file_unique_id && existing.avatar_mime
      ? avatarPath(userId, existing.avatar_mime)
      : null;
  if (oldPath) {
    try {
      await readFile(oldPath);
      await withSystem(sql, async (tx) => {
        await tx`UPDATE users SET avatar_checked_at = NOW() WHERE id = ${userId}::uuid`;
      });
      return;
    } catch {
      // Metadata exists but local file disappeared: redownload below.
    }
  }

  const file = await telegramJson<TelegramFile>(botToken, "getFile", { file_id: latest.file_id });
  if (!file?.file_path) {
    await withSystem(sql, async (tx) => {
      await tx`UPDATE users SET avatar_checked_at = NOW() WHERE id = ${userId}::uuid`;
    });
    return;
  }
  if (file.file_size !== undefined && file.file_size > MAX_AVATAR_BYTES) {
    await markAvatarMissing(sql, userId);
    return;
  }

  const download = await fetch(`${TELEGRAM_API_BASE}/file/bot${botToken}/${file.file_path}`);
  if (!download.ok) {
    await withSystem(sql, async (tx) => {
      await tx`UPDATE users SET avatar_checked_at = NOW() WHERE id = ${userId}::uuid`;
    });
    return;
  }

  const mime = download.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
  if (!MIME_EXT[mime]) {
    await markAvatarMissing(sql, userId);
    return;
  }

  const bytes = new Uint8Array(await download.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
    await markAvatarMissing(sql, userId);
    return;
  }

  const target = avatarPath(userId, mime);
  if (!target) return;
  await mkdir(avatarDir(), { recursive: true });
  const tmp = join(avatarDir(), `${userId}.${Date.now()}.tmp`);
  await writeFile(tmp, bytes);
  await deleteAvatarFiles(userId);
  await rename(tmp, target);

  const avatarUrl = buildAvatarUrl(userId, latest.file_unique_id);
  await withSystem(sql, async (tx) => {
    await tx`
      UPDATE users
      SET avatar_url = ${avatarUrl},
          avatar_file_unique_id = ${latest.file_unique_id},
          avatar_mime = ${mime},
          avatar_checked_at = NOW()
      WHERE id = ${userId}::uuid
    `;
  });

  logger.info({ event: "avatar.synced", uid: userId }, "telegram avatar synced");
}
