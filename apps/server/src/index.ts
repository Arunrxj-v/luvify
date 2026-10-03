/**
 * Luvify API server - the file `npm run dev` boots (`tsx watch src/index.ts`).
 *
 * Exposes the REST API defined by the DTOs in `@luvify/shared` under `/api`,
 * serves published sites from `STORAGE_DIR`, and answers `/api/health` for
 * liveness checks from the web client and the e2e script.
 *
 * The app itself lives in `./app` so tests can mount it without opening a port.
 */

import { createApp } from "./app";
import { env, envCandidatesHint, envFile } from "./env";
import { prisma } from "./prisma";
import { reportAIConfiguration } from "./services/ai";

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
  // Reports the provider/model and whether the active provider's API key is
  // set, without ever printing the key itself.
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
