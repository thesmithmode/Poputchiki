import { Hono } from "hono";
import type postgres from "postgres";
import { createAuthRouter } from "./auth/authRouter";
import { createComplaintsRouter } from "./complaints/complaintsRouter";
import { poolMetrics } from "./db/pool";
import { createFavoritesRouter } from "./favorites/favoritesRouter";
import { createLikesRouter } from "./likes/likesRouter";
import { auditLog } from "./middleware/audit-log";
import { authRateLimit } from "./middleware/auth-rate-limit";
import { captureSocketIp } from "./middleware/capture-socket-ip";
import { corsMiddleware } from "./middleware/cors";
import { csrf } from "./middleware/csrf";
import { idempotency } from "./middleware/idempotency";
import { identityGuard } from "./middleware/identity-guard";
import { rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { secureHeadersMiddleware } from "./middleware/secure-headers";
import { createNotificationsRouter } from "./notifications/notificationsRouter";
import { createRidesRouter } from "./rides/ridesRouter";
import { createSupportRouter } from "./support/supportRouter";
import { createUsersRouter } from "./users/usersRouter";

export function createApp(sql?: postgres.Sql, jwtSecret?: string): Hono {
  const app = new Hono();

  app.use("*", requestId());
  app.use("*", captureSocketIp());
  app.use("*", corsMiddleware);
  app.use("*", secureHeadersMiddleware);
  app.get("/health", (c) => c.json({ status: "ok", ts: new Date().toISOString() }));
  app.get("/metrics", (c) => c.json(poolMetrics.snapshot()));

  if (sql) {
    app.use("/auth/*", authRateLimit(sql, { ipLimit: 10 }));
    app.route("/auth", createAuthRouter(sql));

    if (jwtSecret) {
      const allowedOrigin = process.env.DOMAIN ? `https://${process.env.DOMAIN}` : undefined;
      app.use("/api/*", identityGuard(jwtSecret, sql));
      app.use("/api/*", rateLimit(sql));
      app.use("/api/*", csrf(allowedOrigin));
      app.use("/api/*", idempotency(sql));
      app.use("/api/*", auditLog(sql));
      app.route("/api/rides", createRidesRouter(sql));
      app.route("/api/users", createUsersRouter(sql));
      app.route("/api/notifications", createNotificationsRouter(sql));
      app.route("/api/favorites", createFavoritesRouter(sql));
      app.route("/api/likes", createLikesRouter(sql));
      app.route("/api/complaints", createComplaintsRouter(sql));
      const { userRouter: supportUser, adminRouter: supportAdmin } = createSupportRouter(sql);
      app.route("/api/support", supportUser);
      app.route("/api/admin/support", supportAdmin);
    }
  }

  return app;
}
