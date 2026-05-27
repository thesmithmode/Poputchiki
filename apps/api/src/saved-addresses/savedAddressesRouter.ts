import { CreateSavedAddressInput, UpdateSavedAddressInput } from "@poputchiki/shared";
import { Hono } from "hono";
import type postgres from "postgres";
import { withIdentity } from "../db/with-identity";
import { isUniqueViolation } from "../lib/db-errors";
import { UUID_RE } from "../lib/uuid";
import type { AppUser } from "../middleware/identity-guard";

const MAX_CUSTOM_ADDRESSES = 20;

export function createSavedAddressesRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx`
        SELECT id, type, name, address_label, lat, lng,
               created_at, updated_at
        FROM saved_addresses
        WHERE user_id = ${user.id}
        ORDER BY
          CASE type WHEN 'home' THEN 0 WHEN 'work' THEN 1 ELSE 2 END,
          name ASC
      `;
    });
    return c.json(rows);
  });

  app.post("/", async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = CreateSavedAddressInput.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "invalid input", details: parsed.error.issues }, 422);

    const { type, name, address_label, lat, lng } = parsed.data;

    if (type === "custom") {
      const countResult = await withIdentity(sql, user, async (tx) => {
        return tx<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM saved_addresses
          WHERE user_id = ${user.id} AND type = 'custom'
        `;
      });
      const count = Number(countResult[0]?.count ?? 0);
      if (count >= MAX_CUSTOM_ADDRESSES) {
        return c.json({ error: "max_custom_addresses", limit: MAX_CUSTOM_ADDRESSES }, 422);
      }
    }

    try {
      if (type === "home" || type === "work") {
        const rows = await withIdentity(sql, user, async (tx) => {
          return tx`
            INSERT INTO saved_addresses (user_id, type, name, address_label, lat, lng)
            VALUES (${user.id}, ${type}, ${name}, ${address_label}, ${lat}, ${lng})
            ON CONFLICT (user_id) WHERE type = ${type}
            DO UPDATE SET
              name = EXCLUDED.name,
              address_label = EXCLUDED.address_label,
              lat = EXCLUDED.lat,
              lng = EXCLUDED.lng,
              updated_at = now()
            RETURNING id, type, name, address_label, lat, lng, created_at, updated_at
          `;
        });
        return c.json(rows[0], 201);
      }

      const rows = await withIdentity(sql, user, async (tx) => {
        return tx`
          INSERT INTO saved_addresses (user_id, type, name, address_label, lat, lng)
          VALUES (${user.id}, ${type}, ${name}, ${address_label}, ${lat}, ${lng})
          RETURNING id, type, name, address_label, lat, lng, created_at, updated_at
        `;
      });
      return c.json(rows[0], 201);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json({ error: "duplicate_address" }, 409);
      }
      throw err;
    }
  });

  app.patch("/:id", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = UpdateSavedAddressInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const updates = parsed.data;
    if (!updates.name && !updates.address_label && updates.lat == null && updates.lng == null) {
      return c.json({ error: "no fields to update" }, 422);
    }

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx`
        UPDATE saved_addresses SET
          name = COALESCE(${updates.name ?? null}, name),
          address_label = COALESCE(${updates.address_label ?? null}, address_label),
          lat = COALESCE(${updates.lat ?? null}, lat),
          lng = COALESCE(${updates.lng ?? null}, lng),
          updated_at = now()
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, type, name, address_label, lat, lng, created_at, updated_at
      `;
    });
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json(rows[0]);
  });

  app.delete("/:id", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx`
        DELETE FROM saved_addresses
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id
      `;
    });
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    return new Response(null, { status: 204 });
  });

  return app;
}
