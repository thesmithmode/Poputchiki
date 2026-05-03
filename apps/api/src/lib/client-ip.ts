import type { Context } from "hono";

function ipToUint32(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return 0;
  const [a, b, cc, d] = parts;
  return (((a ?? 0) << 24) | ((b ?? 0) << 16) | ((cc ?? 0) << 8) | (d ?? 0)) >>> 0;
}

function isInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf("/");
  if (slash === -1) return ip === cidr;
  const network = cidr.slice(0, slash);
  const bits = Number(cidr.slice(slash + 1));
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipToUint32(ip) & mask) === (ipToUint32(network) & mask);
}

function isTrustedProxy(ip: string): boolean {
  const raw = process.env.TRUSTED_PROXIES ?? "172.16.0.0/12";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((cidr) => isInCidr(ip, cidr));
}

/**
 * Resolve real client IP. Anti-spoof: trust X-Forwarded-For / X-Real-IP ONLY when
 * the actual TCP socket peer is in TRUSTED_PROXIES. Otherwise the connecting client
 * could forge those headers and bypass rate-limit / audit attribution.
 *
 * Socket IP is captured by `captureSocketIp` middleware from Bun's `server.requestIP`.
 */
export function getClientIp(c: Context): string {
  const socketIp = (c.get("socketIp" as never) as string | undefined) ?? "";

  if (!socketIp) {
    // No reliable peer info (test harness, misconfigured server). Refuse to trust headers.
    return "unknown";
  }

  if (!isTrustedProxy(socketIp)) {
    // Direct (untrusted) client — ignore any XFF, return real socket peer.
    return socketIp;
  }

  // Behind trusted proxy — first XFF entry is real client.
  const forwarded = c.req.header("X-Forwarded-For") ?? "";
  const firstXff = forwarded.split(",")[0]?.trim() ?? "";
  if (firstXff) return firstXff;

  const realIp = c.req.header("X-Real-IP") ?? "";
  if (realIp) return realIp;

  return socketIp;
}
