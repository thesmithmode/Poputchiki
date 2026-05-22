import { afterAll, beforeAll, describe, expect, it } from "vitest";
/**
 * Integration: cleanupUserNotifications удаляет строки старше 90 дней,
 * пачками по 5000, не трогает свежие. RLS обходится через SET LOCAL ROLE
 * poputchiki_service (BYPASSRLS) внутри withLock(useServiceRole: true).
 */
import { cleanupUserNotifications } from "../../../../cron/src/cleanup";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { buildDsn } from "../setup";

const USER = { id: "00000000-0000-4000-f000-300000000001", tgId: 9600001 };

let sql: ReturnType<typeof createPool>;

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES (${USER.id}, ${USER.tgId}, 'Retention Test')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    await tx`DELETE FROM user_notifications WHERE user_id = ${USER.id}`;
  });
});

afterAll(async () => {
  await withSystem(sql, async (tx) => {
    await tx`DELETE FROM user_notifications WHERE user_id = ${USER.id}`;
    await tx`DELETE FROM users WHERE id = ${USER.id}`;
  });
  await sql.end();
});

describe("cleanupUserNotifications — retention 90 days", () => {
  it("удаляет строки старше 90 дней, оставляет свежие", async () => {
    await withSystem(sql, async (tx) => {
      // 5 свежих (created_at = now)
      for (let i = 0; i < 5; i++) {
        await tx`
          INSERT INTO user_notifications (user_id, category, data, created_at)
          VALUES (${USER.id}::uuid, 'system', '{}'::jsonb, NOW())
        `;
      }
      // 7 старых (created_at = now - 100 days)
      for (let i = 0; i < 7; i++) {
        await tx`
          INSERT INTO user_notifications (user_id, category, data, created_at)
          VALUES (${USER.id}::uuid, 'system', '{}'::jsonb, NOW() - INTERVAL '100 days')
        `;
      }
    });

    const result = await cleanupUserNotifications(sql);
    expect(result?.deleted).toBeGreaterThanOrEqual(7);

    const rows = await withSystem(sql, async (tx) => {
      return tx<{ c: string }[]>`
        SELECT COUNT(*) AS c FROM user_notifications WHERE user_id = ${USER.id}::uuid
      `;
    });
    expect(Number(rows[0]?.c ?? -1)).toBe(5);
  });
});
