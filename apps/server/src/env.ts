/**
 * Environment loading for the API server.
 *
 * Loads the repo-root `.env` exactly once (before Prisma reads `DATABASE_URL`)
 * and exposes a typed view of the settings the server needs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
/** `apps/server/src` -> repository root */
export const repoRoot = path.resolve(here, "..", "..", "..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const str = (value: string | undefined, fallback: string): string =>
  value && value.trim() ? value.trim() : fallback;

export const env = {
  nodeEnv: str(process.env.NODE_ENV, "development"),
  port: Number(str(process.env.PORT, "4000")) || 4000,
  corsOrigins: str(process.env.CORS_ORIGINS, "http://localhost:5173,http://localhost:4173")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
  publicBaseUrl: str(process.env.PUBLIC_BASE_URL, "http://localhost:4000").replace(/\/$/, ""),
  storageDir: path.resolve(repoRoot, str(process.env.STORAGE_DIR, ".storage")),
  aiProvider: str(process.env.AI_PROVIDER, "mock"),
  aiModel: str(process.env.OPENAI_MODEL, "mock"),
  jwtSecret: str(process.env.JWT_SECRET, "dev-only-change-me"),
  version: "0.1.0",
} as const;
