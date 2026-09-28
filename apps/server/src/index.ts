/**
 * Luvify API server - the file `npm run dev` boots (`tsx watch src/index.ts`).
 *
 * Exposes the REST API defined by the DTOs in `@luvify/shared` under `/api`,
 * serves published sites from `STORAGE_DIR`, and answers `/api/health` for
 * liveness checks from the web client and the e2e script.
 */

import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env, envCandidatesHint, envFile } from "./env";
import { errorHandler, notFoundHandler } from "./errors";
import { prisma } from "./prisma";
import { apiRouter } from "./routes";
import { reportAIConfiguration } from "./services/ai";

export function createApp(): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors({ origin: env.corsOrigins.length > 0 ? env.corsOrigins : true, credentials: true }));
  app.use(express.json({ limit: "4mb" }));
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

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[luvify] API server listening on http://localhost:${env.port}`);
  console.log(`[luvify] health check: http://localhost:${env.port}/api/health`);
  console.log(`[luvify] CORS allowed origins: ${env.corsOrigins.join(", ")}`);
  // Which file the settings came from (path only, never contents), so a
  // missing/renamed .env is diagnosable from the startup log.
  console.log(
    envFile
      ? `[luvify] env file: ${envFile}`
      : `[luvify] env file: NOT FOUND - checked ${envCandidatesHint()}, using process environment only`,
  );
  // Reports the provider/model and whether OPENROUTER_API_KEY is set, without
  // ever printing the key itself.
  reportAIConfiguration();
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(`[luvify] failed to start on port ${env.port}: ${error.message}`);
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[luvify] ${signal} received, shutting down...`);
  server.close();
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
