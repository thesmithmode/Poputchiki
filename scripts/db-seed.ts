/**
 * Dev seed: 5 mock users + 10 rides + likes/reviews.
 * Refuses to run in production (NODE_ENV check).
 */
import type postgres from "postgres";

export const SEED_USERS = [
  { tg_id: 100001, display_name: "Анна Водитель", tg_username: "anna_d" },
  { tg_id: 100002, display_name: "Борис Водитель", tg_username: "boris_d" },
  { tg_id: 100003, display_name: "Вера Пассажир", tg_username: "vera_p" },
  { tg_id: 100004, display_name: "Григорий Пассажир", tg_username: "grigoriy_p" },
  { tg_id: 100005, display_name: "Дарья Универсал", tg_username: "darya_u" },
];

export class ProductionSeedError extends Error {
  constructor() {
    super("db:seed запрещён в production (NODE_ENV=production)");
    this.name = "ProductionSeedError";
  }
}

export function assertNotProduction(env: string | undefined): void {
  if (env === "production") throw new ProductionSeedError();
}

export async function seed(sql: postgres.Sql): Promise<{
  users: number;
  rides: number;
  likes: number;
  reviews: number;
}> {
  const userIds: string[] = [];
  for (const u of SEED_USERS) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO users (tg_id, display_name, tg_username, onboarded)
      VALUES (${u.tg_id}, ${u.display_name}, ${u.tg_username}, true)
      ON CONFLICT (tg_id) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `;
    userIds.push(row.id);
  }

  const rideIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const driverId = userIds[i % 2];
    const departure = new Date(Date.now() + (i + 1) * 86400000).toISOString();
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO rides
        (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
         departure_at, price_rub, seats_total, comment)
      VALUES
        (${driverId}, 'ЖК Царёво', 55.751244, 49.198674,
         'Казань Центр', 55.78874, 49.12214,
         ${departure}::timestamptz, 200, 3, ${`Seed ride #${i + 1}`})
      RETURNING id
    `;
    rideIds.push(row.id);
  }

  // ride_participation для likes/reviews preconditions: пара marked + confirmed
  let likes = 0;
  let reviews = 0;
  for (let i = 0; i < 4; i++) {
    const driverId = userIds[i % 2];
    const passengerId = userIds[2 + (i % 3)];
    const rideId = rideIds[i];
    await sql`
      INSERT INTO ride_participation
        (ride_id, passenger_id, driver_marked, marked_at, passenger_confirmed, confirmed_at)
      VALUES (${rideId}, ${passengerId}, true, now(), true, now())
      ON CONFLICT (ride_id, passenger_id) DO NOTHING
    `;
    const liked = await sql`
      INSERT INTO likes (ride_id, liker_id, target_id)
      VALUES (${rideId}, ${passengerId}, ${driverId})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (liked.length > 0) likes++;
    const reviewed = await sql`
      INSERT INTO reviews (ride_id, subject_id, target_id, stars, body)
      VALUES (${rideId}, ${passengerId}, ${driverId}, ${4 + (i % 2)}, ${`Seed review #${i + 1}`})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (reviewed.length > 0) reviews++;
  }

  return { users: userIds.length, rides: rideIds.length, likes, reviews };
}

export async function seedAdmin(
  sql: postgres.Sql,
  adminTgId: string | undefined,
): Promise<{ admin_granted: boolean }> {
  if (!adminTgId) return { admin_granted: false };

  const rows = await sql<{ id: string }[]>`
    UPDATE users SET role = 'admin', updated_at = now()
    WHERE tg_id = ${Number(adminTgId)} AND role != 'admin'
    RETURNING id
  `;
  if (rows.length === 0) return { admin_granted: false };

  await sql`
    INSERT INTO audit_log (user_id, action, entity, entity_id, meta)
    VALUES (${rows[0].id}, 'admin_role_granted', 'users', ${rows[0].id}::uuid, '{}'::jsonb)
    ON CONFLICT DO NOTHING
  `;
  return { admin_granted: true };
}

/* c8 ignore start -- entrypoint глотается во время unit test */
async function main(): Promise<void> {
  assertNotProduction(process.env.NODE_ENV);
  const dsn = process.env.DATABASE_URL;
  if (!dsn) throw new Error("DATABASE_URL required");
  const { default: postgres } = await import("postgres");
  const sql = postgres(dsn);
  try {
    const result = await seed(sql);
    const adminResult = await seedAdmin(sql, process.env.ADMIN_TG_ID);
    console.log(JSON.stringify({ msg: "db_seed_done", ...result, ...adminResult }));
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(JSON.stringify({ msg: "db_seed_error", error: String(err) }));
    process.exit(1);
  });
}
/* c8 ignore stop */
