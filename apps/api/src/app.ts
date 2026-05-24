import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type postgres from "postgres";
import { createAuthRouter } from "./auth/authRouter";
import { createClientErrorsRouter } from "./client-errors/clientErrorsRouter";
import { createComplaintsRouter } from "./complaints/complaintsRouter";
import { poolMetrics } from "./db/pool";
import { createFavoritesRouter } from "./favorites/favoritesRouter";
import { createGeocodeRouter } from "./geocode/geocodeRouter";
import { createLikesRouter } from "./likes/likesRouter";
import { auditLog } from "./middleware/audit-log";
import { authRateLimit } from "./middleware/auth-rate-limit";
import { bannedUser } from "./middleware/banned-user";
import { captureSocketIp } from "./middleware/capture-socket-ip";
import { clientErrorsRateLimit } from "./middleware/client-errors-rate-limit";
import { corsMiddleware } from "./middleware/cors";
import { setupErrorCapture } from "./middleware/error-capture";
import { idempotency } from "./middleware/idempotency";
import { identityGuard } from "./middleware/identity-guard";
import { rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { secureHeadersMiddleware } from "./middleware/secure-headers";
import { createAdminNotificationsRouter } from "./notifications/adminNotificationsRouter";
import { createNotificationsRouter } from "./notifications/notificationsRouter";
import type { Dispatcher } from "./realtime/dispatcher";
import { createRealtimeRouter } from "./realtime/realtimeRouter";
import { createReviewsRouter } from "./reviews/reviewsRouter";
import { createInternalRideRequestsRouter } from "./ride-requests/internalRideRequestsRouter";
import { createRideRequestsRouter } from "./ride-requests/rideRequestsRouter";
import { createRideTemplatesRouter } from "./ride-templates/rideTemplatesRouter";
import { ridesCache } from "./rides/ridesCache";
import { createRidesRouter } from "./rides/ridesRouter";
import { createSupportRouter } from "./support/supportRouter";
import { createInternalTemplateSubscriptionsRouter } from "./template-subscriptions/internalTemplateSubscriptionsRouter";
import { createTemplateSubscriptionsRouter } from "./template-subscriptions/templateSubscriptionsRouter";
import { createUsersRouter } from "./users/usersRouter";

export function createApp(sql?: postgres.Sql, jwtSecret?: string, dispatcher?: Dispatcher): Hono {
  const app = new Hono();

  app.use("*", requestId());
  app.use("*", captureSocketIp());
  app.use("*", corsMiddleware);
  app.use("*", secureHeadersMiddleware);
  app.get("/health", (c) => c.json({ status: "ok", ts: new Date().toISOString() }));
  app.get("/metrics", (c) => {
    const token = process.env.METRICS_TOKEN;
    if (!token && process.env.NODE_ENV === "production") {
      return c.text("unauthorized", 401);
    }
    if (token) {
      const auth = c.req.header("authorization") ?? "";
      if (auth !== `Bearer ${token}`) return c.text("unauthorized", 401);
    }
    return c.json(poolMetrics.snapshot());
  });
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
    setupErrorCapture(app, sql);
    // A1: bodyLimit 4KB first (rejects oversized before spending rate-limit slot), then rate-limit 5/min per-IP
    app.use("/api/client-errors/*", bodyLimit({ maxSize: 4096 }));
    app.use("/api/client-errors/*", clientErrorsRateLimit(sql));
    app.route("/api/client-errors", createClientErrorsRouter(sql));
    app.use("/auth/*", authRateLimit(sql, { ipLimit: 10 }));
    app.route("/auth", createAuthRouter(sql));

    // Internal endpoint для webhook callback_query — НЕ под /api/* (минует JWT
    // identityGuard). Защита: X-Internal-Secret. Выставляется только внутри
    // docker network, см. внешний reverse proxy конфиг.
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (internalSecret) {
      app.route("/internal/ride-requests", createInternalRideRequestsRouter(sql, internalSecret));
      app.route(
        "/internal/template-subscriptions",
        createInternalTemplateSubscriptionsRouter(sql, internalSecret),
      );
    }

    if (jwtSecret) {
      // A2: глобальный bodyLimit 64KB для всех /api/* и /auth/*
      app.use("/api/*", bodyLimit({ maxSize: 65536 }));
      app.use("/auth/*", bodyLimit({ maxSize: 65536 }));
      // CSRF не нужен на /api/*: identityGuard требует Authorization: Bearer,
      // который нельзя отправить через CSRF-атаку (формы/iframe не могут ставить кастомные заголовки).
      // Дополнительно: csrf_token cookie ставится на api. домен, JS на app. не может его читать.
      app.use("/api/*", identityGuard(jwtSecret, sql));
      app.use("/api/*", bannedUser(sql));
      app.use("/api/*", rateLimit(sql));
      app.use("/api/*", idempotency(sql));
      app.use("/api/*", auditLog(sql));
      app.route("/api/rides", createRidesRouter(sql, ridesCache));
      app.route("/api/ride-templates", createRideTemplatesRouter(sql));
      if (dispatcher) {
        app.route("/api/realtime", createRealtimeRouter(dispatcher));
      }
      app.route("/api/ride-requests", createRideRequestsRouter(sql));
      app.route("/api/template-subscriptions", createTemplateSubscriptionsRouter(sql));
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
      app.route("/api/admin/notifications", createAdminNotificationsRouter(sql));
    }
  }

  return app;
}
