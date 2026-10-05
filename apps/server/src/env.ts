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
 * An unset or blank value must reach the fallback: `Number("")` is `0`, which
 * would otherwise silently disable timeouts and retries.
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
 * `gemini` (Google Gemini) is the production provider, `openrouter` remains a
 * supported alternative. `mock` is an explicitly-selected offline fixture used
 * by the test suite; it is never chosen automatically, so a provider outage can
 * never silently produce a fabricated website.
 */
const aiProvider = str(process.env.AI_PROVIDER, "gemini").toLowerCase();

const openrouterModel = str(process.env.OPENROUTER_MODEL, "openai/gpt-4o-mini");

/** Google Gemini - read here and nowhere else, never logged, never prefixed `VITE_`. */
const geminiApiKey = str(process.env.GOOGLE_GENERATIVE_AI_API_KEY, "");
/** Primary model. Gemini 3.8 Flash stays the default; a fallback runs one extra cycle (see GEMINI_FALLBACK_MODEL). */
const geminiModel = str(process.env.GEMINI_MODEL, "gemini-3.8-flash");
/**
 * Optional fallback model for one extra retry cycle after the primary model
 * exhausts its retries on a transient failure (429 / 5xx / network). Empty
 * disables the fallback entirely. Non-transient failures (auth, bad request,
 * missing key) never reach it.
 */
const geminiFallbackModel = str(process.env.GEMINI_FALLBACK_MODEL, "gemini-3.5-flash-lite");

// Normalized once so every `=== "production"` / `"development"` check below
// (boot guard, cookie Secure default, demo-login gate) is case-insensitive.
const nodeEnv = str(process.env.NODE_ENV, "development").trim().toLowerCase() || "development";

/**
 * How Express derives the client IP that the auth rate limiter keys on.
 *
 * The default (`1`) trusts exactly one proxy hop, which matches the hosted
 * layout (Nginx / Tailscale in front of the Node process). Set
 * `TRUST_PROXY=false` when the process is exposed directly - otherwise a client
 * can send a fresh `X-Forwarded-For` per request and get a fresh rate-limit
 * bucket each time. Accepts `true`, `false` or a hop count.
 */
const trustProxyRaw = str(process.env.TRUST_PROXY, "1").trim().toLowerCase();
const trustProxy =
  trustProxyRaw === "true"
    ? true
    : trustProxyRaw === "false" || trustProxyRaw === ""
      ? false
      : Number.isFinite(Number(trustProxyRaw))
        ? Number(trustProxyRaw)
        : false;
const corsOrigins = str(process.env.CORS_ORIGINS, "http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const publicBaseUrl = str(process.env.PUBLIC_BASE_URL, "http://localhost:4000").replace(/\/$/, "");

/**
 * Google OAuth (server-side only).
 *
 * All three must be set for "Continue with Google" to be offered; the client id
 * and secret never leave this process and are never part of a VITE_* variable,
 * a build artefact or an API response. `GOOGLE_OAUTH_REDIRECT_URI` must match
 * the authorized redirect URI registered in the Google Cloud console exactly.
 */
const googleClientId = str(process.env.GOOGLE_CLIENT_ID, "");
const googleClientSecret = str(process.env.GOOGLE_CLIENT_SECRET, "");
const googleOauthRedirectUri = str(process.env.GOOGLE_OAUTH_REDIRECT_URI, "");

/**
 * Origin of the SPA the OAuth callback redirects back to. Defaults to the first
 * allowed browser origin, which is the Vite dev server locally.
 */
const appBaseUrl = str(process.env.APP_BASE_URL, corsOrigins[0] ?? "http://localhost:5173").replace(/\/$/, "");

/**
 * `Secure` on the session cookie.
 *
 * Defaults to on whenever NODE_ENV=production (the hosted deployment is HTTPS
 * behind Nginx/Tailscale Funnel). Set `AUTH_COOKIE_SECURE=false` only when a
 * production build is deliberately served over plain http - a Secure cookie is
 * then silently dropped by the browser and every login appears to fail.
 */
const cookieSecure = str(
  process.env.AUTH_COOKIE_SECURE,
  nodeEnv === "production" ? "true" : "false",
).toLowerCase();

export const env = {
  nodeEnv,
  port: Number(str(process.env.PORT, "4000")) || 4000,
  /** See the TRUST_PROXY comment above - drives `app.set("trust proxy", ...)`. */
  trustProxy,
  corsOrigins,
  publicBaseUrl,
  storageDir: path.resolve(repoRoot, str(process.env.STORAGE_DIR, ".storage")),
  /** Root of uploaded client assets (logos, photos, menus): `UPLOADS_DIR`. */
  uploadsDir: path.resolve(repoRoot, str(process.env.UPLOADS_DIR, ".uploads")),
  aiProvider,
  /** Model label reported to the UI; the mock provider has no real model. */
  aiModel:
    aiProvider === "gemini"
      ? geminiModel
      : aiProvider === "openrouter"
        ? openrouterModel
        : "mock",
  /** Shared generation tuning. */
  aiTemperature: num(process.env.AI_TEMPERATURE, 0.6),
  aiMaxTokens: num(process.env.AI_MAX_TOKENS, 4096),
  /** Google Gemini - the key is read here and nowhere else, and never logged. */
  geminiApiKey,
  geminiModel,
  geminiFallbackModel,
  geminiBaseUrl: str(process.env.GEMINI_BASE_URL, "https://generativelanguage.googleapis.com"),
  geminiTimeoutMs: num(process.env.GEMINI_TIMEOUT_MS, num(process.env.AI_REQUEST_TIMEOUT_MS, 60_000)),
  geminiMaxRetries: num(process.env.GEMINI_MAX_RETRIES, num(process.env.AI_MAX_RETRIES, 2)),
  /** OpenRouter - the key is read here and nowhere else, and never logged. */
  openrouterApiKey: str(process.env.OPENROUTER_API_KEY, ""),
  openrouterModel,
  openrouterBaseUrl: str(process.env.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1").replace(/\/$/, ""),
  openrouterTimeoutMs: num(process.env.OPENROUTER_TIMEOUT_MS, num(process.env.AI_REQUEST_TIMEOUT_MS, 60_000)),
  openrouterMaxRetries: num(process.env.OPENROUTER_MAX_RETRIES, num(process.env.AI_MAX_RETRIES, 2)),
  /** Sent as OpenRouter's optional attribution headers. */
  openrouterAppTitle: str(process.env.OPENROUTER_APP_TITLE, "Luvify"),
  /** Legacy shared secret used to sign OAuth state blobs (see auth/oauth.ts). */
  jwtSecret: str(process.env.JWT_SECRET, "dev-only-change-me"),
  /** True when JWT_SECRET still carries the shipped development placeholder. */
  authInsecureSecret: str(process.env.JWT_SECRET, "dev-only-change-me") === "dev-only-change-me",
  auth: {
    /** Browser session cookie name. httpOnly - never readable from JavaScript. */
    sessionCookieName: str(process.env.SESSION_COOKIE_NAME, "luvify_session"),
    /** Short-lived cookie that binds the Google OAuth `state` to this browser. */
    oauthCookieName: str(process.env.OAUTH_COOKIE_NAME, "luvify_oauth_state"),
    /** How long a signed-in session survives without activity. */
    sessionDays: num(process.env.AUTH_SESSION_DAYS, 14),
    /** Lifetime of the OAuth state blob (single short-lived redirect). */
    oauthStateSeconds: num(process.env.OAUTH_STATE_SECONDS, 600),
    cookieSecure: cookieSecure === "true" || cookieSecure === "1",
    /** Requests per window allowed on /api/auth before 429. */
    rateLimitMax: num(process.env.AUTH_RATE_LIMIT_MAX, 30),
    appBaseUrl,
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      redirectUri: googleOauthRedirectUri,
      /** Both endpoints are constant, documented Google URLs - not configurable. */
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      userinfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
      get enabled(): boolean {
        return Boolean(googleClientId && googleClientSecret && googleOauthRedirectUri);
      },
    },
  },
  version: "0.1.0",
} as const;

