import { Hono } from "hono";
import type postgres from "postgres";
import { createAuthRouter } from "./auth/authRouter";
import { createComplaintsRouter } from "./complaints/complaintsRouter";
import { createGeocodeRouter } from "./geocode/geocodeRouter";
import { poolMetrics } from "./db/pool";
import { createFavoritesRouter } from "./favorites/favoritesRouter";
import { createLikesRouter } from "./likes/likesRouter";
import { auditLog } from "./middleware/audit-log";
import { authRateLimit } from "./middleware/auth-rate-limit";
import { bannedUser } from "./middleware/banned-user";
import { captureSocketIp } from "./middleware/capture-socket-ip";
import { corsMiddleware } from "./middleware/cors";
import { csrf } from "./middleware/csrf";
import { idempotency } from "./middleware/idempotency";
import { identityGuard } from "./middleware/identity-guard";
import { rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { secureHeadersMiddleware } from "./middleware/secure-headers";
import { createNotificationsRouter } from "./notifications/notificationsRouter";
import { createRealtimeRouter } from "./realtime/realtimeRouter";
import { createReviewsRouter } from "./reviews/reviewsRouter";
import { createRideRequestsRouter } from "./ride-requests/rideRequestsRouter";
import { createRideTemplatesRouter } from "./ride-templates/rideTemplatesRouter";
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
  app.get("/readiness", async (c) => {
    if (!sql) return c.json({ status: "degraded", reason: "no_db" }, 503);
    try {
      await sql`SELECT 1`;
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "degraded", reason: "db_unreachable" }, 503);
    }
  });

  if (sql) {
    app.use("/auth/*", authRateLimit(sql, { ipLimit: 10 }));
    app.route("/auth", createAuthRouter(sql));

    if (jwtSecret) {
      const allowedOrigin = process.env.DOMAIN ? `https://${process.env.DOMAIN}` : undefined;
      app.use("/api/*", identityGuard(jwtSecret, sql));
      app.use("/api/*", bannedUser(sql));
      app.use("/api/*", rateLimit(sql));
      app.use("/api/*", csrf(allowedOrigin));
      app.use("/api/*", idempotency(sql));
      app.use("/api/*", auditLog(sql));
      app.route("/api/rides", createRidesRouter(sql));
      app.route("/api/ride-templates", createRideTemplatesRouter(sql));
      app.route("/api/realtime", createRealtimeRouter(sql));
      app.route("/api/ride-requests", createRideRequestsRouter(sql));
      app.route("/api/users", createUsersRouter(sql));
      app.route("/api/notifications", createNotificationsRouter(sql));
      app.route("/api/favorites", createFavoritesRouter(sql));
      app.route("/api/likes", createLikesRouter(sql));
      app.route("/api/reviews", createReviewsRouter(sql));
      app.route("/api/complaints", createComplaintsRouter(sql));
      app.route("/api/geocode", createGeocodeRouter());
      const { userRouter: supportUser, adminRouter: supportAdmin } = createSupportRouter(sql);
      app.route("/api/support", supportUser);
      app.route("/api/admin/support", supportAdmin);
    }
  }

  return app;
}
