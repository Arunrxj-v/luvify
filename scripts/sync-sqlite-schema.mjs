#!/usr/bin/env node
/**
 * Generates `prisma/sqlite/schema.prisma` from the canonical
 * `prisma/schema.prisma` (PostgreSQL) schema.
 *
 * Why: the source of truth is a single schema file, so the two providers can
 * never drift. The only real difference is the datasource provider string —
 * the schema deliberately avoids Postgres-only features (native types, enums,
 * Json columns, arrays) so it is portable. Structured data is stored as
 * Zod-validated JSON strings instead.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const source = resolve(root, "prisma/schema.prisma");
const targetDir = resolve(root, "prisma/sqlite");
const target = resolve(targetDir, "schema.prisma");

const schema = await readFile(source, "utf8");

if (!schema.includes('provider = "postgresql"')) {
  throw new Error(
    `Expected prisma/schema.prisma to declare provider = "postgresql" (source of truth for the SQLite variant).`,
  );
}

const sqliteSchema = schema.replace(
  'provider = "postgresql"',
  'provider = "sqlite"',
);

const banner = `// ---------------------------------------------------------------------------
// AUTO-GENERATED FILE - DO NOT EDIT.
// Produced by \`scripts/sync-sqlite-schema.mjs\` from prisma/schema.prisma.
// Run \`npm run db:sqlite\` to regenerate + push this schema.
// ---------------------------------------------------------------------------

`;

await mkdir(targetDir, { recursive: true });
await writeFile(target, banner + sqliteSchema, "utf8");
console.log(`[db] wrote ${target}`);
