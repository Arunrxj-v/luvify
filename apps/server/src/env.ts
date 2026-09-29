/**
 * Environment loading for the API server.
 *
 * Loads the repo-root `.env` exactly once (before Prisma reads `DATABASE_URL`)
 * and exposes a typed view of the settings the server needs.
 *
 * The file is located relative to THIS MODULE, never relative to the process
 * working directory, so `npm run dev` behaves identically from the repository
 * root, from `apps/server`, or from an editor task runner.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
/** `apps/server/src` -> repository root */
export const repoRoot = path.resolve(here, "..", "..", "..");

/** `.env` candidates, most authoritative first: repo root, then cwd upwards. */
function envCandidates(): string[] {
  const candidates = [path.join(repoRoot, ".env")];
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const file = path.join(dir, ".env");
    if (!candidates.includes(file)) candidates.push(file);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return candidates;
}

/**
 * Applies one `.env` file to `process.env`.
 *
 * Non-empty process values win (standard dotenv behaviour - shell/CI overrides
 * still work), but EMPTY ones never shadow the file: exporting
 * `OPENROUTER_API_KEY=` (blank) in a shell must not hide a real key that sits
 * in `.env`, which is precisely the "I added the key but it is still missing"
 * failure mode. Returns false when the file does not exist.
 */
function applyEnvFile(file: string): boolean {
  let source: string;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  for (const [key, value] of Object.entries(dotenv.parse(source))) {
    const current = process.env[key];
    if (current === undefined || !current.trim()) process.env[key] = value;
  }
  return true;
}

/** Path of the `.env` file that was loaded, or `null` when none was found. Contents are never logged. */
export const envFile: string | null = envCandidates().find(applyEnvFile) ?? null;

/** Locations that were searched for `.env` - paths only, safe to log. */
export function envCandidatesHint(): string {
  return envCandidates().join(", ");
}

const str = (value: string | undefined, fallback: string): string =>
  value && value.trim() ? value.trim() : fallback;

/**
 * Parses a non-negative number, falling back when unset or malformed.
 *
 * An EMPTY value must fall back too: `Number("")` is `0`, so without this
 * check an optional variable like OLLAMA_MAX_RETRIES would silently disable
 * retries instead of inheriting AI_MAX_RETRIES.
 */
const num = (value: string | undefined, fallback: number): number => {
  const raw = str(value, "");
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/**
 * The AI provider actually used for generation.
 *
 * `openrouter` is the hosted provider, `ollama` runs a local model through
 * Ollama's OpenAI-compatible endpoint, and `mock` is an explicitly-selected
 * offline fixture used by the test suite. `mock` is never chosen automatically,
 * so a provider outage can never silently produce a fabricated website.
 */
const aiProvider = str(process.env.AI_PROVIDER, "openrouter").toLowerCase();

const openrouterModel = str(process.env.OPENROUTER_MODEL, "openai/gpt-4o-mini");

/**
 * Ollama's OpenAI-compatible base URL.
 *
 * The version segment is normalised here so `http://localhost:11434` and
 * `http://localhost:11434/v1` both resolve to the same endpoint - every
 * consumer can then simply append `/chat/completions` or `/models`.
 */
function normalizeOllamaBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

const ollamaBaseUrl = normalizeOllamaBaseUrl(
  str(process.env.OLLAMA_BASE_URL, "http://localhost:11434/v1"),
);
const ollamaModel = str(process.env.OLLAMA_MODEL, "qwen3.5:4b");

export const env = {
  nodeEnv: str(process.env.NODE_ENV, "development"),
  port: Number(str(process.env.PORT, "4000")) || 4000,
  corsOrigins: str(process.env.CORS_ORIGINS, "http://localhost:5173,http://localhost:4173")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
  publicBaseUrl: str(process.env.PUBLIC_BASE_URL, "http://localhost:4000").replace(/\/$/, ""),
  storageDir: path.resolve(repoRoot, str(process.env.STORAGE_DIR, ".storage")),
  aiProvider,
  /** Model label reported to the UI; the mock provider has no real model. */
  aiModel:
    aiProvider === "ollama"
      ? ollamaModel
      : aiProvider === "openrouter"
        ? openrouterModel
        : "mock",
  /** Shared generation tuning. */
  aiTemperature: num(process.env.AI_TEMPERATURE, 0.6),
  aiMaxTokens: num(process.env.AI_MAX_TOKENS, 4096),
  /** OpenRouter - the key is read here and nowhere else, and never logged. */
  openrouterApiKey: str(process.env.OPENROUTER_API_KEY, ""),
  openrouterModel,
  openrouterBaseUrl: str(process.env.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1").replace(/\/$/, ""),
  openrouterTimeoutMs: num(process.env.OPENROUTER_TIMEOUT_MS, num(process.env.AI_REQUEST_TIMEOUT_MS, 60_000)),
  openrouterMaxRetries: num(process.env.OPENROUTER_MAX_RETRIES, num(process.env.AI_MAX_RETRIES, 2)),
  /** Sent as OpenRouter's optional attribution headers. */
  openrouterAppTitle: str(process.env.OPENROUTER_APP_TITLE, "Luvify"),
  /**
   * Ollama - local generation through `OLLAMA_BASE_URL/v1`. No API key is ever
   * read or sent: local Ollama needs none, and the OpenRouter key must never
   * reach it. The generous timeout default accounts for a small local model
   * writing a full page of JSON at roughly 10 tokens/second on Apple Silicon.
   */
  ollamaBaseUrl,
  ollamaModel,
  ollamaTimeoutMs: num(process.env.OLLAMA_TIMEOUT_MS, 600_000),
  ollamaMaxRetries: num(process.env.OLLAMA_MAX_RETRIES, num(process.env.AI_MAX_RETRIES, 2)),
  /**
   * `none` keeps `qwen3.5:4b` from spending its whole token budget (and a
   * minute of wall clock) on reasoning before the answer. Set it to `auto` to
   * omit the parameter and let the model use its own default (thinking on).
   */
  ollamaReasoningEffort: str(process.env.OLLAMA_REASONING_EFFORT, "none"),
  jwtSecret: str(process.env.JWT_SECRET, "dev-only-change-me"),
  version: "0.1.0",
} as const;

