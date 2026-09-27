/**
 * Prisma client singleton.
 *
 * The generated client comes from `prisma/sqlite/schema.prisma`, whose
 * `DATABASE_URL="file:./dev.db"` is written relative to that schema file.
 * Node never applies that rule itself, so relative SQLite URLs are resolved
 * here against `prisma/sqlite/` before the client is constructed.
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { repoRoot } from "./env";

function resolveDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;
  if (!raw.startsWith("file:")) return raw;

  const file = raw.slice("file:".length);
  if (!file) return undefined;
  const absolute = path.isAbsolute(file) ? file : path.resolve(repoRoot, "prisma/sqlite", file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  if (!fs.existsSync(absolute)) fs.writeFileSync(absolute, "");
  process.env.DATABASE_URL = `file:${absolute}`;
  return process.env.DATABASE_URL;
}

const datasourceUrl = resolveDatasourceUrl();

export const prisma = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

/** Used by `/api/health` - never throws. */
export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
