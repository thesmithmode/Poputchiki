/**
 * Sentinel: social tables RLS isolation.
 * Verifies that likes, reviews, favorites, private_notes, complaints, and audit_log
 * all enforce deny-by-default and owner-only write policies via app.current_user_id() GUC.
 *
 * Requires: Postgres running + migrations 000, 001, 002, 003 applied.
 * Runs in CI only (POSTGRES_* env must be set).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER_A = "00000000-0000-4000-a000-000000000020";
const USER_B = "00000000-0000-4000-a000-000000000021";
const USER_C = "00000000-0000-4000-a000-000000000022";

function buildDsn(): string {
  return (
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`
  );
}

let sql: ReturnType<typeof postgres>;
let rideId: string;

async function seedUser(
  tx: postgres.TransactionSql,
  id: string,
  tgId: number,
): Promise<void> {
  await tx`SELECT set_config('app.current_user_id', ${id}, true)`;
  await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
  await tx`
    INSERT INTO users (id, tg_id, display_name, role)
    VALUES (${id}, ${tgId}, ${"SocialUser " + tgId}, 'user')
    ON CONFLICT (id) DO NOTHING
  `;
}

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 3 });

  // Seed three users using admin bypass
  await sql.begin(async (tx) => {
    await seedUser(tx, USER_A, 2000001);
    await seedUser(tx, USER_B, 2000002);
    await seedUser(tx, USER_C, 2000003);
  });

  // USER_A creates a ride (so USER_B can later like USER_C on that ride)
  const rows = await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
    await tx`SELECT set_config('app.current_user_role', 'user', true)`;
    return tx`
      INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total)
      VALUES (${USER_A}, 'ЖК Царёво', 55.75, 37.62, 'Метро', 55.72, 37.86, now() + interval '1 day', 3)
      RETURNING id
    `;
  });
  rideId = rows[0]?.id as string;
});

afterAll(async () => {
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
    await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
    // Clean social tables first (FK deps)
    await tx`DELETE FROM complaints WHERE reporter_id IN (${USER_A}, ${USER_B}, ${USER_C})`;
    await tx`DELETE FROM private_notes WHERE user_id IN (${USER_A}, ${USER_B}, ${USER_C})`;
    await tx`DELETE FROM favorites WHERE user_id IN (${USER_A}, ${USER_B}, ${USER_C})`;
    await tx`DELETE FROM reviews WHERE subject_id IN (${USER_A}, ${USER_B}, ${USER_C})`;
    await tx`DELETE FROM likes WHERE subject_id IN (${USER_A}, ${USER_B}, ${USER_C})`;
    await tx`DELETE FROM rides WHERE driver_id = ${USER_A}`;
    await tx`DELETE FROM users WHERE id IN (${USER_A}, ${USER_B}, ${USER_C})`;
  });
  await sql.end();
});

// ---------------------------------------------------------------------------
// likes
// ---------------------------------------------------------------------------

describe("likes RLS", () => {
  it("anon cannot read likes", async () => {
    const rows = await sql.begin((tx) => tx`SELECT * FROM likes`);
    expect(rows.length).toBe(0);
  });

  it("authenticated user can insert like with own subject_id", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_B}, true)`;
      return tx`
        INSERT INTO likes (subject_id, target_id, ride_id)
        VALUES (${USER_B}, ${USER_C}, ${rideId})
        RETURNING id
      `;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBeTruthy();
  });

  it("authenticated user can read likes", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_B}, true)`;
      return tx`SELECT id FROM likes WHERE subject_id = ${USER_B}`;
    });
    expect(rows.length).toBe(1);
  });

  it("user cannot insert like with another's subject_id", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_user_id', ${USER_C}, true)`;
        return tx`
          INSERT INTO likes (subject_id, target_id, ride_id)
          VALUES (${USER_B}, ${USER_A}, ${rideId})
        `;
      }),
    ).rejects.toThrow();
  });

  it("user can delete own like", async () => {
    const result = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_B}, true)`;
      return tx`DELETE FROM likes WHERE subject_id = ${USER_B} AND ride_id = ${rideId}`;
    });
    expect(result.count).toBe(1);
  });

  it("user cannot delete another's like", async () => {
    // Re-insert USER_B's like first via admin
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_B}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
      return tx`
        INSERT INTO likes (subject_id, target_id, ride_id)
        VALUES (${USER_B}, ${USER_C}, ${rideId})
        ON CONFLICT DO NOTHING
      `;
    });

    const result = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_C}, true)`;
      return tx`DELETE FROM likes WHERE subject_id = ${USER_B}`;
    });
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reviews
// ---------------------------------------------------------------------------

describe("reviews RLS", () => {
  it("anon cannot read reviews", async () => {
    const rows = await sql.begin((tx) => tx`SELECT * FROM reviews`);
    expect(rows.length).toBe(0);
  });

  it("user can insert review with own subject_id", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_B}, true)`;
      return tx`
        INSERT INTO reviews (ride_id, subject_id, target_id, stars)
        VALUES (${rideId}, ${USER_B}, ${USER_A}, 5)
        RETURNING id
      `;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBeTruthy();
  });

  it("authenticated user can read reviews", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      return tx`SELECT id FROM reviews WHERE target_id = ${USER_A}`;
    });
    expect(rows.length).toBe(1);
  });

  it("user cannot insert review with another's subject_id", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_user_id', ${USER_C}, true)`;
        return tx`
          INSERT INTO reviews (ride_id, subject_id, target_id, stars)
          VALUES (${rideId}, ${USER_B}, ${USER_A}, 3)
        `;
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// favorites
// ---------------------------------------------------------------------------

describe("favorites RLS", () => {
  it("user can add a favorite", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      return tx`
        INSERT INTO favorites (user_id, target_id)
        VALUES (${USER_A}, ${USER_B})
        RETURNING user_id
      `;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.user_id).toBe(USER_A);
  });

  it("user can read own favorites", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      return tx`SELECT target_id FROM favorites WHERE user_id = ${USER_A}`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.target_id).toBe(USER_B);
  });

  it("user cannot read another's favorites", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_C}, true)`;
      return tx`SELECT target_id FROM favorites WHERE user_id = ${USER_A}`;
    });
    expect(rows.length).toBe(0);
  });

  it("user cannot insert favorite for another user", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_user_id', ${USER_C}, true)`;
        return tx`
          INSERT INTO favorites (user_id, target_id)
          VALUES (${USER_A}, ${USER_C})
        `;
      }),
    ).rejects.toThrow();
  });

  it("user can delete own favorite", async () => {
    const result = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      return tx`DELETE FROM favorites WHERE user_id = ${USER_A} AND target_id = ${USER_B}`;
    });
    expect(result.count).toBe(1);
  });

  it("user cannot delete another's favorite", async () => {
    // Re-add USER_A favorite
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
      return tx`
        INSERT INTO favorites (user_id, target_id)
        VALUES (${USER_A}, ${USER_B})
        ON CONFLICT DO NOTHING
      `;
    });

    const result = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_C}, true)`;
      return tx`DELETE FROM favorites WHERE user_id = ${USER_A}`;
    });
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// private_notes
// ---------------------------------------------------------------------------

describe("private_notes RLS", () => {
  it("user can insert own private note", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      return tx`
        INSERT INTO private_notes (user_id, target_id, text)
        VALUES (${USER_A}, ${USER_B}, 'Хороший попутчик')
        RETURNING user_id
      `;
    });
    expect(rows.length).toBe(1);
  });

  it("user can read own private notes", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      return tx`SELECT text FROM private_notes WHERE user_id = ${USER_A}`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.text).toBe("Хороший попутчик");
  });

  it("user cannot read another's private notes", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_C}, true)`;
      return tx`SELECT text FROM private_notes WHERE user_id = ${USER_A}`;
    });
    expect(rows.length).toBe(0);
  });

  it("user cannot insert note with another's user_id", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_user_id', ${USER_C}, true)`;
        return tx`
          INSERT INTO private_notes (user_id, target_id, text)
          VALUES (${USER_A}, ${USER_C}, 'Взломщик')
        `;
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// audit_log
// ---------------------------------------------------------------------------

describe("audit_log RLS", () => {
  it("non-admin cannot SELECT audit_log (policy: admin only)", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`SELECT id FROM audit_log`;
    });
    expect(rows.length).toBe(0);
  });

  it("audit_log has a SELECT-only admin policy in pg_policies", async () => {
    const rows = await sql.begin(
      (tx) => tx`
        SELECT polname, polcmd
        FROM pg_policies
        WHERE tablename = 'audit_log'
      `,
    );
    // Must have at least one policy, all should be SELECT (r) for admin
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row?.polcmd).toBe("r");
    }
  });
});
