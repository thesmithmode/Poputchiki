/**
 * Integration: enqueueNotification → data приземляется как jsonb-object,
 * а не как jsonb-string (двойная сериализация постгрес.js при ${str}::jsonb).
 *
 * Регрессия: data->>'passenger_name' возвращал NULL на проде, потому что
 * top-level data сохранялся как строка "{...}", а не объект.
 */
import { enqueueNotification, enqueueNotificationBatch } from "@poputchiki/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { buildDsn } from "../setup";

const USER = { id: "00000000-0000-4000-f000-200000000001", tgId: 9500001 };

let sql: ReturnType<typeof createPool>;

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES (${USER.id}, ${USER.tgId}, 'JsonbRoundtrip User')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    await tx`DELETE FROM user_notifications WHERE user_id = ${USER.id}`;
  });
});

afterAll(async () => {
  await sql`DELETE FROM user_notifications WHERE user_id = ${USER.id}`;
  await sql`DELETE FROM users WHERE id = ${USER.id}`;
  await sql.end();
});

describe("enqueueNotification — jsonb roundtrip", () => {
  it("data сохраняется как jsonb-object с доступными ключами, не как jsonb-string", async () => {
    await enqueueNotification(sql, {
      userId: USER.id,
      category: "ride_request",
      data: { passenger_name: "Тест", request_id: "req-1", destination: "Куда-то" },
    });

    const rows = await sql<
      {
        dtype: string;
        passenger_name: string | null;
        request_id: string | null;
      }[]
    >`
      SELECT jsonb_typeof(data) AS dtype,
             data->>'passenger_name' AS passenger_name,
             data->>'request_id' AS request_id
      FROM user_notifications
      WHERE user_id = ${USER.id}::uuid AND category = 'ride_request'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new Error("notification not inserted");

    expect(row.dtype).toBe("object");
    expect(row.passenger_name).toBe("Тест");
    expect(row.request_id).toBe("req-1");
  });

  it("batch: data сохраняется как jsonb-object, не как jsonb-string", async () => {
    await enqueueNotificationBatch(sql, [
      {
        userId: USER.id,
        category: "like_received",
        data: { liker_name: "Лайкер", liker_id: "u-1" },
      },
    ]);

    const rows = await sql<{ dtype: string; liker_name: string | null }[]>`
      SELECT jsonb_typeof(data) AS dtype,
             data->>'liker_name' AS liker_name
      FROM user_notifications
      WHERE user_id = ${USER.id}::uuid AND category = 'like_received'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new Error("notification not inserted");

    expect(row.dtype).toBe("object");
    expect(row.liker_name).toBe("Лайкер");
  });
});
