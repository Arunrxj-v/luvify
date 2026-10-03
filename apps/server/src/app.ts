/**
 * Express application factory - everything the API serves, minus the listener.
 *
 * Split out of `index.ts` so the test suite can mount the *real* app (real
 * routers, real middleware, real error handling) on an ephemeral port without
 * also booting the production listener that `index.ts` starts at import time.
 */

import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { sameOriginGuard } from "./auth/origin";
import { env } from "./env";
import { errorHandler, notFoundHandler } from "./errors";
import { apiRouter } from "./routes";

export function createApp(): express.Express {
  // Refuse to run a production process that signs Google OAuth state with the
  // publicly known placeholder secret. `JWT_SECRET` is documented in
  // .env.example; generating one is `openssl rand -hex 32`.
  if (env.nodeEnv === "production" && env.authInsecureSecret) {
    throw new Error(
      "[auth] Refusing to start with the placeholder JWT_SECRET " +
        '("dev-only-change-me"). Set JWT_SECRET to a long random value and restart.',
    );
  }

  const app = express();
  app.set("trust proxy", env.trustProxy);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginEmbedderPolicy: false,
    }),
  );
  // `credentials: true` is what lets the browser attach the httpOnly session
  // cookie when the API is reached on a different origin (VITE_API_BASE_URL).
  app.use(cors({ origin: env.corsOrigins.length > 0 ? env.corsOrigins : true, credentials: true }));
  app.use(express.json({ limit: "4mb" }));

  // Reject cross-site state-changing requests before they reach a handler.
  // Reads (`GET`/`HEAD`) are untouched, so links and previews keep working.
  app.use("/api", sameOriginGuard);

  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      max: 2_000,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use("/api", apiRouter);

  // Published sites written by the publish pipeline (`STORAGE_DIR/<slug>`).
  app.use("/sites", express.static(env.storageDir, { extensions: ["html"] }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
