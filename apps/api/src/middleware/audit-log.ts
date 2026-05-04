import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type postgres from "postgres";
import { getClientIp } from "../lib/client-ip";
import type { AppUser } from "./identity-guard";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function parsePathParts(path: string): { entity: string; entityId: string | null } {
  const parts = path
    .replace(/^\/api\//, "")
    .split("/")
    .filter(Boolean);
  const entity = parts[0] ?? "api";
  const candidate = parts[1];
  const entityId = candidate && UUID_RE.test(candidate) ? candidate : null;
  return { entity, entityId };
}

export function auditLog(sql: postgres.Sql): MiddlewareHandler {
  return async (c, next) => {
    if (!STATE_CHANGING_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    let bodyText = "";
    try {
      bodyText = await c.req.raw.clone().text();
    } catch {
      // body unreadable — hash empty string
    }
    const payloadHash = sha256hex(bodyText);

    await next();

    const status = c.res.status;
    if (status < 200 || status >= 300) return;

    const user = c.get("user" as never) as AppUser | undefined;
    const ip = getClientIp(c);
    const ua = c.req.header("User-Agent") ?? "";
    const action = `${c.req.method} ${c.req.path}`;
    const { entity, entityId } = parsePathParts(c.req.path);

    try {
      await sql`
        INSERT INTO audit_log (user_id, action, entity, entity_id, meta)
        VALUES (
          ${user?.id ?? null},
          ${action},
          ${entity},
          ${entityId},
          ${JSON.stringify({ ip, ua, payload_hash: payloadHash })}::jsonb
        )
      `;
    } catch (err: unknown) {
      console.error("audit_log insert failed:", err);
    }
  };
}
