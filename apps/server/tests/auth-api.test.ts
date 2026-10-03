/**
 * Phase 3 - authentication and project ownership, exercised over HTTP against
 * the real Express app (real routers, real middleware, real error handling).
 *
 * Why it starts its own listener: `src/app.ts` exports `createApp()` precisely
 * so these tests can mount the production app on an ephemeral port instead of
 * mocking Express, and so they never boot the production listener in
 * `src/index.ts`.
 *
 * Isolation:
 *   * a throwaway SQLite database (`prisma/sqlite/auth-test.db`, git-ignored)
 *     is created from scratch before the Prisma client is imported, so the
 *     developer's `dev.db` is never read or written;
 *   * `AI_PROVIDER` defaults to `mock`, so no test spends money or hits the
 *     network. Set `LUVIFY_TEST_LIVE_AI=1` to run the same generation test
 *     through the real Gemini pipeline configured in `.env`.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Type-only import (aliased so it cannot collide with the runtime `createApp`
// that the suite loads dynamically after the environment has been configured).
import type { createApp as CreateApp } from "../src/app";

type App = ReturnType<typeof CreateApp>;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const testDbFile = path.join(repoRoot, "prisma", "sqlite", "auth-test.db");
const testDbUrl = "file:./auth-test.db";
const SESSION_COOKIE = "luvify_session";
/** Opt-in: run the generation test through the real Gemini pipeline. */
const LIVE_AI = process.env.LUVIFY_TEST_LIVE_AI === "1";

// ---------------------------------------------------------------------------
// Environment - MUST be set before anything under src/ is imported, because
// apps/server/src/env.ts reads process.env exactly once at module load.
// ---------------------------------------------------------------------------

process.env.DATABASE_URL = testDbUrl;
process.env.AI_PROVIDER = LIVE_AI ? "gemini" : "mock";
process.env.AUTH_RATE_LIMIT_MAX = "5000"; // this suite makes many auth calls
process.env.AUTH_SESSION_DAYS = "1";
process.env.AUTH_COOKIE_SECURE = "false";
// Fake but well-formed OAuth client configuration: enough to exercise the
// state/redirect handling, never enough to reach a real Google account.
process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret-do-not-leak";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:4000/api/auth/google/callback";
process.env.APP_BASE_URL = "http://localhost:5173";

function prepareDatabase(): void {
  // The SQLite schema is generated (and git-ignored) from the canonical
  // PostgreSQL schema - regenerate so the test DB matches the current schema.
  execFileSync(process.execPath, [path.join(repoRoot, "scripts", "sync-sqlite-schema.mjs")], {
    cwd: repoRoot,
    stdio: "pipe",
  });
  // Start from a clean file so "signup succeeds" is true on every run.
  fs.rmSync(testDbFile, { force: true });
  fs.rmSync(`${testDbFile}-journal`, { force: true });
  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "prisma", "build", "index.js"),
      "db",
      "push",
      "--schema",
      path.join("prisma", "sqlite", "schema.prisma"),
      "--skip-generate",
    ],
    { cwd: repoRoot, stdio: "pipe", env: { ...process.env, DATABASE_URL: testDbUrl } },
  );
}

prepareDatabase();

// Imported only after the environment above is in place.
const { createApp } = await import("../src/app");
const { prisma } = await import("../src/prisma");

// ---------------------------------------------------------------------------
// Tiny cookie-aware HTTP client
// ---------------------------------------------------------------------------

function setCookiesOf(headers: Headers): string[] {
  const fn = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  return typeof fn === "function" ? fn.call(headers) : [];
}

class Jar {
  readonly cookies = new Map<string, string>();

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

interface CallOptions {
  headers?: Record<string, string>;
  /** `manual` keeps a 3xx response (OAuth redirects) instead of following it. */
  redirect?: RequestRedirect;
}

interface CallResult {
  status: number;
  json: unknown;
  headers: Headers;
  location: string | null;
  raw: string;
}

function storeCookies(jar: Jar, headers: Headers): void {
  for (const line of setCookiesOf(headers)) {
    const [pair = "", ...attributes] = line.split(";");
    const index = pair.indexOf("=");
    if (index < 1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    const cleared = attributes.some((entry) => /^\s*max-age\s*=\s*0\s*$/i.test(entry));
    if (cleared || !value) jar.cookies.delete(name);
    else jar.cookies.set(name, value);
  }
}

function errorOf(result: CallResult): { code?: string; message?: string } | undefined {
  return (result.json as { error?: { code?: string; message?: string } } | null)?.error;
}

async function call(
  jar: Jar,
  method: string,
  requestPath: string,
  body?: unknown,
  options: CallOptions = {},
): Promise<CallResult> {
  const response = await fetch(`${base}${requestPath}`, {
    method,
    redirect: options.redirect ?? "follow",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(jar.cookies.size > 0 ? { cookie: jar.header() } : {}),
      ...(options.headers ?? {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  storeCookies(jar, response.headers);
  const raw = await response.text();
  let json: unknown = null;
  if (raw) {
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      json = raw;
    }
  }
  return {
    status: response.status,
    json,
    raw,
    headers: response.headers,
    location: response.headers.get("location"),
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let app: App;
let server: Server;
let base = "";

beforeAll(async () => {
  app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("test server has no port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

let unique = 0;
const nextEmail = (label: string): string =>
  `${label}-${Date.now().toString(36)}-${(unique += 1)}@example.test`.toLowerCase();

const SIGNUP = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  password: "correct-horse-battery",
};

async function signUp(jar: Jar, overrides: Partial<typeof SIGNUP> = {}): Promise<CallResult> {
  return call(jar, "POST", "/api/auth/signup", { ...SIGNUP, ...overrides });
}

/** Signs up a brand-new account and returns its fresh session cookie jar. */
async function signUpFresh(overrides: Partial<typeof SIGNUP> = {}): Promise<{ jar: Jar; email: string; id: string }> {
  const jar = new Jar();
  const email = overrides.email ?? nextEmail("user");
  const result = await signUp(jar, { ...overrides, email });
  expect(result.status, `signup for ${email} should succeed`).toBe(201);
  return { jar, email, id: userOf(result).id };
}

function userOf(result: CallResult): { id: string; name: string; email: string; role: string } {
  const json = result.json as { user?: { id: string; name: string; email: string; role: string } } | null;
  expect(json?.user, `expected a user in: ${result.raw}`).toBeTruthy();
  return json?.user as { id: string; name: string; email: string; role: string };
}

function locationParams(result: CallResult): URLSearchParams {
  return new URL(result.location ?? "http://localhost/").searchParams;
}

// ---------------------------------------------------------------------------
// 1-7: email/password authentication
// ---------------------------------------------------------------------------

describe("email/password authentication", () => {
  it("1. signup succeeds, returns a safe user and sets an httpOnly cookie", async () => {
    const jar = new Jar();
    const result = await signUp(jar, { email: nextEmail("signup") });

    expect(result.status).toBe(201);
    const user = userOf(result);
    expect(user.email).toMatch(/@example\.test$/);
    expect(user.name).toBe(SIGNUP.name);
    expect(user.role).toBe("OWNER");
    expect(user.id).toBeTruthy();

    // The credential is a cookie, not a field in the body.
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(true);
    const setCookie = setCookiesOf(result.headers).join(" ");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=");
    // NODE_ENV=test -> not production, so no Secure flag locally.
    expect(setCookie).not.toContain("Secure");
  });

  it("never returns a password hash, a google id or a session token", async () => {
    const jar = new Jar();
    const email = nextEmail("leak");
    const signup = await signUp(jar, { email });
    const me = await call(jar, "GET", "/api/auth/me");
    const token = jar.cookies.get(SESSION_COOKIE) ?? "";

    expect(token.length).toBeGreaterThan(20);
    for (const body of [signup.raw, me.raw]) {
      expect(body).not.toContain("passwordHash");
      expect(body).not.toContain("scrypt$");
      expect(body).not.toContain("googleId");
      expect(body).not.toContain(token);
    }

    // ...and the row really does carry a hash (it is stored, not skipped).
    const row = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
    expect(row?.passwordHash).toMatch(/^scrypt\$/);
  });

  it("2. duplicate signup is rejected", async () => {
    const email = nextEmail("dup");
    await signUpFresh({ email });

    const second = await signUp(new Jar(), { email });
    expect(second.status).toBe(409);
    expect(errorOf(second)?.code).toBe("email_unavailable");
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("validates the email and password before touching the database", async () => {
    const badEmail = await signUp(new Jar(), { email: "not-an-email" });
    expect(badEmail.status).toBe(400);

    const shortPassword = await signUp(new Jar(), { email: nextEmail("short"), password: "short" });
    expect(shortPassword.status).toBe(400);
    expect(errorOf(shortPassword)?.code).toBe("bad_request");
  });

  it("3. login succeeds, with email casing normalized", async () => {
    const email = nextEmail("CaseSensitive");
    await signUpFresh({ email });

    const jar = new Jar();
    const result = await call(jar, "POST", "/api/auth/login", {
      email: email.toUpperCase(),
      password: SIGNUP.password,
    });

    expect(result.status).toBe(200);
    expect(userOf(result).email).toBe(email.toLowerCase());
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(true);
    expect((await call(jar, "GET", "/api/auth/me")).status).toBe(200);
  });

  it("4. wrong password is rejected with the same message as an unknown account", async () => {
    const email = nextEmail("wrongpw");
    await signUpFresh({ email });

    const wrongPassword = await call(new Jar(), "POST", "/api/auth/login", {
      email,
      password: "definitely-not-the-password",
    });
    expect(wrongPassword.status).toBe(401);
    expect(errorOf(wrongPassword)?.code).toBe("invalid_credentials");

    const unknownAccount = await call(new Jar(), "POST", "/api/auth/login", {
      email: nextEmail("ghost"),
      password: "definitely-not-the-password",
    });
    expect(unknownAccount.status).toBe(401);
    // Identical wording: the response does not reveal whether the account exists.
    expect(errorOf(unknownAccount)?.message).toBe(errorOf(wrongPassword)?.message);
  });

  it("5. unauthenticated /api/auth/me returns 401", async () => {
    const result = await call(new Jar(), "GET", "/api/auth/me");
    expect(result.status).toBe(401);
    expect(errorOf(result)?.code).toBe("unauthorized");
  });

  it("6. authenticated /api/auth/me returns the user", async () => {
    const { jar, email } = await signUpFresh({ email: nextEmail("me") });
    const result = await call(jar, "GET", "/api/auth/me");

    expect(result.status).toBe(200);
    expect(userOf(result).email).toBe(email);
    expect((result.json as { provider: string }).provider).toBe("password");
  });

  it("7. logout invalidates authentication", async () => {
    const { jar, id } = await signUpFresh({ email: nextEmail("logout") });
    expect((await call(jar, "GET", "/api/auth/me")).status).toBe(200);
    expect(await prisma.session.count({ where: { userId: id } })).toBe(1);

    const logout = await call(jar, "POST", "/api/auth/logout");
    expect(logout.status).toBe(200);
    expect(logout.json).toEqual({ ok: true });
    expect(jar.cookies.size).toBe(0);

    // The server-side row is gone - replaying the old cookie fails.
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
    expect((await call(jar, "GET", "/api/auth/me")).status).toBe(401);
    expect((await call(jar, "GET", "/api/projects")).status).toBe(401);
  });

  it("a revoked session cookie cannot be replayed", async () => {
    const { jar, id } = await signUpFresh({ email: nextEmail("replay") });
    const stolen = new Jar();
    stolen.cookies.set(SESSION_COOKIE, jar.cookies.get(SESSION_COOKIE) ?? "");
    expect((await call(stolen, "GET", "/api/auth/me")).status).toBe(200);

    await call(jar, "POST", "/api/auth/logout");
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
    expect((await call(stolen, "GET", "/api/auth/me")).status).toBe(401);
  });

  it("rejects a forged session cookie", async () => {
    const jar = new Jar();
    jar.cookies.set(SESSION_COOKIE, "a".repeat(43));
    expect((await call(jar, "GET", "/api/auth/me")).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 8-13: project ownership - the core of Phase 3
// ---------------------------------------------------------------------------

const NEW_PROJECT = {
  name: "Ownership Bakery",
  businessDescription: "A neighbourhood bakery selling sourdough loaves and celebration cakes.",
  websiteType: "restaurant",
};

describe("project ownership", () => {
  let alice: Jar;
  let bob: Jar;
  let aliceProjectId = "";
  let bobProjectId = "";

  beforeAll(async () => {
    alice = (await signUpFresh({ email: nextEmail("alice") })).jar;
    const created = await call(alice, "POST", "/api/projects", NEW_PROJECT);
    expect(created.status).toBe(201);
    aliceProjectId = (created.json as { id: string }).id;

    bob = new Jar();
    // Anonymous creation must fail before anything else is attempted.
    expect((await call(bob, "POST", "/api/projects", NEW_PROJECT)).status).toBe(401);

    bob = (await signUpFresh({ email: nextEmail("bob") })).jar;
    const createdBob = await call(bob, "POST", "/api/projects", { ...NEW_PROJECT, name: "Bob's Project" });
    expect(createdBob.status).toBe(201);
    bobProjectId = (createdBob.json as { id: string }).id;
  });

  it("8. an authenticated user can create a project", async () => {
    expect(aliceProjectId).toBeTruthy();
    const detail = await call(alice, "GET", `/api/projects/${aliceProjectId}`);
    expect(detail.status).toBe(200);
    expect((detail.json as { name: string }).name).toBe(NEW_PROJECT.name);
  });

  it("ownership comes from the session, never from the request body", async () => {
    const { jar, id } = await signUpFresh({ email: nextEmail("spoof") });
    const aliceId = userOf(await call(alice, "GET", "/api/auth/me")).id;

    const created = await call(jar, "POST", "/api/projects", { ...NEW_PROJECT, userId: aliceId });
    expect(created.status).toBe(201);
    const createdId = (created.json as { id: string }).id;

    const row = await prisma.project.findUnique({ where: { id: createdId }, select: { userId: true } });
    expect(row?.userId).toBe(id); // the caller's own id...
    expect(row?.userId).not.toBe(aliceId); // ...never the spoofed one
    await call(jar, "DELETE", `/api/projects/${createdId}`);
  });

  it("9. a user retrieves only their own projects", async () => {
    const aliceList = await call(alice, "GET", "/api/projects");
    expect(aliceList.status).toBe(200);
    const aliceIds = (aliceList.json as Array<{ id: string }>).map((project) => project.id);
    expect(aliceIds).toContain(aliceProjectId);
    expect(aliceIds).not.toContain(bobProjectId);

    const bobList = await call(bob, "GET", "/api/projects");
    expect((bobList.json as Array<{ id: string }>).map((project) => project.id)).toEqual([bobProjectId]);
  });

  it("10. a user cannot retrieve another user's project", async () => {
    const result = await call(bob, "GET", `/api/projects/${aliceProjectId}`);
    // 404 rather than 403: confirming existence is exactly the leak to avoid.
    expect(result.status).toBe(404);
    expect(result.raw).not.toContain(NEW_PROJECT.businessDescription);
    expect(result.raw).not.toContain(NEW_PROJECT.name);
  });

  it("11. a user cannot modify another user's project", async () => {
    const patch = await call(bob, "PATCH", `/api/projects/${aliceProjectId}`, { name: "Stolen" });
    expect(patch.status).toBe(404);

    const requirements = await call(bob, "PUT", `/api/projects/${aliceProjectId}/requirements`, {
      business: { productSummary: "attacker controlled summary" },
    });
    expect(requirements.status).toBe(404);

    const row = await prisma.project.findUnique({ where: { id: aliceProjectId }, select: { name: true } });
    expect(row?.name).toBe(NEW_PROJECT.name);
  });

  it("12. a user cannot delete another user's project", async () => {
    const result = await call(bob, "DELETE", `/api/projects/${aliceProjectId}`);
    expect(result.status).toBe(404);
    expect(await prisma.project.findUnique({ where: { id: aliceProjectId }, select: { id: true } })).toBeTruthy();
  });

  it("13. a user cannot generate content for another user's project", async () => {
    const generate = await call(bob, "POST", `/api/projects/${aliceProjectId}/generate`, {});
    expect(generate.status).toBe(404);

    const spec = await call(bob, "POST", `/api/projects/${aliceProjectId}/specification/generate`, {});
    expect(spec.status).toBe(404);

    const chat = await call(bob, "POST", `/api/projects/${aliceProjectId}/messages`, { content: "hi" });
    expect(chat.status).toBe(404);

    const preview = await call(bob, "GET", `/api/projects/${aliceProjectId}/preview?page=/`);
    expect(preview.status).toBe(404);

    // Alice's project was never touched by any of those attempts.
    expect(await prisma.websiteVersion.count({ where: { projectId: aliceProjectId } })).toBe(0);
    expect(await prisma.message.count({ where: { projectId: aliceProjectId, role: "user" } })).toBe(0);
  });

  it("every project sub-resource enforces ownership", async () => {
    const attempts: Array<[string, string, unknown?]> = [
      ["GET", `/api/projects/${aliceProjectId}/conversation`],
      ["GET", `/api/projects/${aliceProjectId}/requirements`],
      ["GET", `/api/projects/${aliceProjectId}/specification`],
      ["GET", `/api/projects/${aliceProjectId}/export`],
      ["GET", `/api/projects/${aliceProjectId}/versions`],
      ["GET", `/api/projects/${aliceProjectId}/business`],
      ["GET", `/api/projects/${aliceProjectId}/products`],
      ["GET", `/api/projects/${aliceProjectId}/customers`],
      ["GET", `/api/projects/${aliceProjectId}/orders`],
      ["GET", `/api/projects/${aliceProjectId}/domains`],
      ["POST", `/api/projects/${aliceProjectId}/modify`, { instruction: "make the hero darker" }],
      ["POST", `/api/projects/${aliceProjectId}/publish`, { provider: "local" }],
      ["POST", `/api/projects/${aliceProjectId}/chat`, { message: "hello" }],
      ["POST", `/api/projects/${aliceProjectId}/requirements/analyze`, { text: "we sell bread" }],
    ];

    for (const [method, requestPath, body] of attempts) {
      const result = await call(bob, method, requestPath, body);
      expect(result.status, `${method} ${requestPath}`).toBe(404);
    }
  });

  it("all project routes reject anonymous callers with 401", async () => {
    const routes: Array<[string, string, unknown?]> = [
      ["GET", "/api/projects"],
      ["POST", "/api/projects", NEW_PROJECT],
      ["GET", `/api/projects/${aliceProjectId}`],
      ["PATCH", `/api/projects/${aliceProjectId}`, { name: "x" }],
      ["DELETE", `/api/projects/${aliceProjectId}`],
      ["GET", `/api/projects/${aliceProjectId}/preview?page=/`],
      ["POST", `/api/projects/${aliceProjectId}/generate`, {}],
    ];
    for (const [method, requestPath, body] of routes) {
      const result = await call(new Jar(), method, requestPath, body);
      expect(result.status, `${method} ${requestPath}`).toBe(401);
    }
  });

  it("rejects state-changing requests from an untrusted origin (CSRF)", async () => {
    const { jar } = await signUpFresh({ email: nextEmail("csrf") });

    const rejected = await call(jar, "POST", "/api/projects", NEW_PROJECT, {
      headers: { origin: "https://evil.example" },
    });
    expect(rejected.status).toBe(403);

    // The same request from a configured browser origin is accepted.
    const allowed = await call(jar, "POST", "/api/projects", NEW_PROJECT, {
      headers: { origin: "http://localhost:5173" },
    });
    expect(allowed.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 14-15: existing functionality keeps working, behind authentication
// ---------------------------------------------------------------------------

describe("existing project functionality", () => {
  let jar: Jar;
  let projectId = "";

  beforeAll(async () => {
    const fresh = await signUpFresh({ email: nextEmail("pipeline") });
    jar = fresh.jar;
    const created = await call(jar, "POST", "/api/projects", {
      name: "Pipeline Bakery",
      businessDescription: "A bakery selling sourdough bread, pastries and custom celebration cakes daily.",
      websiteType: "restaurant",
      templateId: "restaurant",
    });
    expect(created.status).toBe(201);
    projectId = (created.json as { id: string }).id;
  });

  it("health and templates stay public (the login screen needs them)", async () => {
    const anonymous = new Jar();
    expect((await call(anonymous, "GET", "/api/health")).status).toBe(200);
    expect((await call(anonymous, "GET", "/api/templates")).status).toBe(200);
    expect((await call(anonymous, "GET", "/api/auth/providers")).status).toBe(200);
  });

  it("the seeded interview conversation still loads", async () => {
    const result = await call(jar, "GET", `/api/projects/${projectId}/conversation`);
    expect(result.status).toBe(200);
    const body = result.json as { messages: unknown[]; completeness: { overall: number } };
    expect(body.messages.length).toBeGreaterThan(0);
    expect(body.completeness.overall).toBeGreaterThan(0);
  });

  // These two drive the AI pipeline, so they must tolerate a real Gemini call
  // when the suite runs with LUVIFY_TEST_LIVE_AI=1 (mock mode is ~1ms).
  it(
    "posting a chat message still updates requirements",
    async () => {
      const result = await call(jar, "POST", `/api/projects/${projectId}/messages`, {
        content: "We are open weekdays from 7am to 4pm and take bookings for custom cakes.",
      });
      expect(result.status).toBe(200);
      expect((result.json as { completeness: { overall: number } }).completeness.overall).toBeGreaterThan(0);
    },
    120_000,
  );

  it(
    "specification generation still works",
    async () => {
      const result = await call(jar, "POST", `/api/projects/${projectId}/specification/generate`, {});
      expect(result.status).toBe(200);
      const body = result.json as { specification: { pages: unknown[] }; version: number };
      expect(body.specification.pages.length).toBeGreaterThan(0);
      expect(body.version).toBeGreaterThan(0);
    },
    120_000,
  );

  it(
    "14. generation works for the authenticated user's own project",
    async () => {
      const result = await call(jar, "POST", `/api/projects/${projectId}/generate`, {});
      expect(result.status).toBe(200);
      const body = result.json as {
        document: { pages: unknown[] };
        files: unknown[];
        version: { versionNumber: number };
      };
      expect(body.document.pages.length).toBeGreaterThan(0);
      expect(body.files.length).toBeGreaterThan(0);
      expect(body.version.versionNumber).toBe(1);
    },
    300_000,
  );

  it("15. preview, export, versions and publish all still work", async () => {
    const preview = await call(jar, "GET", `/api/projects/${projectId}/preview?page=/`);
    expect(preview.status).toBe(200);
    expect(String((preview.json as { html: string }).html)).toContain("<!doctype html");

    const exported = await call(jar, "GET", `/api/projects/${projectId}/export`);
    expect(exported.status).toBe(200);
    expect((exported.json as { files: unknown[] }).files.length).toBeGreaterThan(0);

    const versions = await call(jar, "GET", `/api/projects/${projectId}/versions`);
    expect((versions.json as unknown[]).length).toBe(1);

    const published = await call(jar, "POST", `/api/projects/${projectId}/publish`, { provider: "local" });
    expect(published.status).toBe(200);

    const detail = await call(jar, "GET", `/api/projects/${projectId}`);
    expect((detail.json as { document: unknown }).document).toBeTruthy();
    expect((detail.json as { deployments: unknown[] }).deployments.length).toBe(1);
  });

  it("deleting your own project still works", async () => {
    const result = await call(jar, "DELETE", `/api/projects/${projectId}`);
    expect(result.status).toBe(200);
    expect(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Google OAuth - server-side flow, verified without a browser
// ---------------------------------------------------------------------------

describe("google oauth", () => {
  const originalFetch = globalThis.fetch;

  function googleStub(identity: Record<string, unknown>): void {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      // Stand in for Google's two server-to-server endpoints; everything else
      // - including this test suite's own requests - hits the real stack.
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: "test-access-token", token_type: "Bearer" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) {
        return Promise.resolve(
          new Response(JSON.stringify(identity), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return originalFetch.call(globalThis, input, init);
    });
  }

  beforeAll(() => {
    googleStub({
      sub: "google-sub-123456",
      email: "google.user@example.test",
      email_verified: true,
      name: "Google User",
      picture: "https://example.test/avatar.png",
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("reports which sign-in methods this server offers", async () => {
    const result = await call(new Jar(), "GET", "/api/auth/providers");
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ google: true, password: true });
  });

  it("redirects to Google with an OpenID Connect request and a bound state", async () => {
    const jar = new Jar();
    const result = await call(jar, "GET", "/api/auth/google?redirect=/dashboard", undefined, {
      redirect: "manual",
    });

    expect(result.status).toBe(302);
    const location = new URL(result.location ?? "");
    expect(`${location.origin}${location.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/auth/google/callback");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(location.searchParams.get("state")).toBeTruthy();

    // The state is pinned to this browser in an httpOnly cookie.
    expect(jar.cookies.has("luvify_oauth_state")).toBe(true);
    expect(setCookiesOf(result.headers).join(" ")).toContain("HttpOnly");
    // The client secret never appears in anything the browser receives.
    expect(result.location ?? "").not.toContain("test-client-secret-do-not-leak");
  });

  it("never exposes the OAuth client secret through the API", async () => {
    const jar = new Jar();
    await signUpFresh({ email: nextEmail("secret") });
    const responses = await Promise.all([
      call(jar, "GET", "/api/auth/providers"),
      call(jar, "GET", "/api/health"),
      call(jar, "GET", "/api/auth/me"),
      call(jar, "GET", "/api/templates"),
    ]);
    for (const response of responses) {
      expect(response.raw).not.toContain("test-client-secret-do-not-leak");
    }
  });

  it("rejects a callback without a valid state and issues no session", async () => {
    const jar = new Jar();
    const result = await call(jar, "GET", "/api/auth/google/callback?code=abc&state=forged", undefined, {
      redirect: "manual",
    });

    expect(result.status).toBe(302);
    expect(result.location).toContain("auth_error=invalid_state");
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await prisma.user.findUnique({ where: { email: "google.user@example.test" } })).toBeNull();
  });

  it("rejects a state issued to a different browser", async () => {
    const attacker = new Jar();
    const redirect = await call(attacker, "GET", "/api/auth/google", undefined, { redirect: "manual" });
    const state = locationParams(redirect).get("state");

    // A valid state, but without the cookie that binds it to a browser.
    const result = await call(
      new Jar(),
      "GET",
      `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state ?? "")}`,
      undefined,
      { redirect: "manual" },
    );
    expect(result.location).toContain("auth_error=invalid_state");
  });

  it("completes the flow, creates the account and establishes a normal session", async () => {
    const jar = new Jar();
    const redirect = await call(jar, "GET", "/api/auth/google", undefined, { redirect: "manual" });
    const state = locationParams(redirect).get("state");

    const callback = await call(
      jar,
      "GET",
      `/api/auth/google/callback?code=one-time-code&state=${encodeURIComponent(state ?? "")}`,
      undefined,
      { redirect: "manual" },
    );

    expect(callback.status).toBe(302);
    expect(callback.location).toBe("http://localhost:5173/");
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(true);
    // The one-shot state cookie is cleared after use.
    expect(jar.cookies.has("luvify_oauth_state")).toBe(false);

    const me = await call(jar, "GET", "/api/auth/me");
    expect(me.status).toBe(200);
    expect(userOf(me).email).toBe("google.user@example.test");
    expect((me.json as { provider: string }).provider).toBe("google");

    const row = await prisma.user.findUnique({
      where: { email: "google.user@example.test" },
      select: { passwordHash: true, googleId: true, avatarUrl: true },
    });
    // This account never set a password - and none is invented for it.
    expect(row?.passwordHash).toBeNull();
    expect(row?.googleId).toBe("google-sub-123456");
    expect(row?.avatarUrl).toBe("https://example.test/avatar.png");

    // Signing in through Google produces exactly the same session as a
    // password login, so every protected route treats them identically.
    const projects = await call(jar, "GET", "/api/projects");
    expect(projects.status).toBe(200);
    expect(projects.json).toEqual([]);
  });

  it("signs in an existing Google account again without duplicating it", async () => {
    // Second visit: the same Google subject must resolve to the same row, and
    // the user must land back where they asked to go (never off-site).
    const identity = {
      sub: "google-sub-repeat",
      email: "repeat.signin@example.test",
      email_verified: true,
      name: "Repeat Signer",
    };
    googleStub(identity);

    const signIn = async (redirect?: string) => {
      const jar = new Jar();
      const initiate = await call(
        jar,
        "GET",
        `/api/auth/google${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`,
        undefined,
        { redirect: "manual" },
      );
      const state = locationParams(initiate).get("state");
      const callback = await call(
        jar,
        "GET",
        `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state ?? "")}`,
        undefined,
        { redirect: "manual" },
      );
      return { jar, callback, me: await call(jar, "GET", "/api/auth/me") };
    };

    const first = await signIn("/dashboard");
    expect(first.callback.status).toBe(302);
    // Redirected back into the authenticated app at the requested path.
    expect(first.callback.location).toBe("http://localhost:5173/dashboard");
    expect(first.me.status).toBe(200);
    const firstId = userOf(first.me).id;
    expect(userOf(first.me).email).toBe(identity.email);

    const second = await signIn();
    expect(second.callback.status).toBe(302);
    expect(second.callback.location).not.toContain("auth_error");
    expect(second.me.status).toBe(200);
    expect(userOf(second.me).id).toBe(firstId); // same account, new session
    expect((second.me.json as { provider: string }).provider).toBe("google");

    expect(await prisma.user.count({ where: { email: identity.email } })).toBe(1);
    expect(await prisma.user.count({ where: { googleId: identity.sub } })).toBe(1);
  });

  it("rejects a replayed OAuth state (single use)", async () => {
    googleStub({ sub: "google-sub-replay", email: "replay@example.test", email_verified: true, name: "Replay" });

    const jar = new Jar();
    const initiate = await call(jar, "GET", "/api/auth/google", undefined, { redirect: "manual" });
    const state = locationParams(initiate).get("state");
    const callbackUrl = `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state ?? "")}`;

    const first = await call(jar, "GET", callbackUrl, undefined, { redirect: "manual" });
    expect(first.status).toBe(302);
    expect(first.location).not.toContain("auth_error");
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(true);
    expect(await prisma.user.count({ where: { googleId: "google-sub-replay" } })).toBe(1);

    // The state cookie is consumed, so the same link cannot be used twice.
    const replay = await call(jar, "GET", callbackUrl, undefined, { redirect: "manual" });
    expect(replay.status).toBe(302);
    expect(replay.location).toContain("auth_error=invalid_state");
    expect(await prisma.user.count({ where: { googleId: "google-sub-replay" } })).toBe(1);
  });

  it("ignores identity claims supplied by the caller in the callback URL", async () => {
    // The only identity source is Google's userinfo endpoint, reached with a
    // server-held access token - nothing in the request is believed.
    googleStub({ sub: "google-sub-honest", email: "real.owner@example.test", email_verified: true, name: "Real Owner" });

    const jar = new Jar();
    const initiate = await call(jar, "GET", "/api/auth/google", undefined, { redirect: "manual" });
    const state = locationParams(initiate).get("state");
    const callback = await call(
      jar,
      "GET",
      `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state ?? "")}` +
        "&email=attacker@evil.test&sub=attacker-sub&name=Attacker&picture=https://evil.test/x.png",
      undefined,
      { redirect: "manual" },
    );

    expect(callback.status).toBe(302);
    expect(callback.location).not.toContain("auth_error");
    const me = await call(jar, "GET", "/api/auth/me");
    expect(me.status).toBe(200);
    expect(userOf(me).email).toBe("real.owner@example.test");
    expect(await prisma.user.findUnique({ where: { email: "attacker@evil.test" } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { googleId: "attacker-sub" } })).toBeNull();
  });

  it("refuses to merge Google into an existing password account (pre-hijacking)", async () => {
    // Signup never verifies the address, so a row keyed on this email proves
    // nothing. Signing in with Google must NOT hand that row over: an attacker
    // who pre-registers the victim's address would otherwise inherit the
    // victim's Google account and read everything created there afterwards.
    const email = nextEmail("linkable");
    const { jar: passwordJar, id } = await signUpFresh({ email });
    const before = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true, googleId: true } });

    googleStub({ sub: "google-sub-linked", email, email_verified: true, name: "Linked User" });

    const jar = new Jar();
    const redirect = await call(jar, "GET", "/api/auth/google", undefined, { redirect: "manual" });
    const state = locationParams(redirect).get("state");
    const callback = await call(
      jar,
      "GET",
      `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state ?? "")}`,
      undefined,
      { redirect: "manual" },
    );

    expect(callback.status).toBe(302);
    expect(callback.location).toContain("auth_error=account_exists_password");
    // No session was created and no credential was touched.
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(false);
    const after = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, googleId: true } });
    expect(after?.id).toBe(id); // same row - not duplicated, not relinked
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(after?.googleId).toBeNull();

    // The password path still works, unchanged.
    const signIn = await call(new Jar(), "POST", "/api/auth/login", { email, password: SIGNUP.password });
    expect(signIn.status).toBe(200);
    expect(userOf(signIn).id).toBe(id);
    expect((await call(passwordJar, "GET", "/api/auth/me")).status).toBe(200);
  });

  it("still signs in an account that already carries both credentials", async () => {
    // A row created by Google that later gained a password (or vice versa)
    // must keep signing in through Google and report `password+google`.
    const email = nextEmail("both");
    const { id } = await signUpFresh({ email });
    await prisma.user.update({ where: { id }, data: { googleId: "google-sub-both" } });

    googleStub({ sub: "google-sub-both", email, email_verified: true, name: "Both Credentials" });

    const jar = new Jar();
    const redirect = await call(jar, "GET", "/api/auth/google", undefined, { redirect: "manual" });
    const state = locationParams(redirect).get("state");
    const callback = await call(
      jar,
      "GET",
      `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state ?? "")}`,
      undefined,
      { redirect: "manual" },
    );

    expect(callback.status).toBe(302);
    expect(callback.location).not.toContain("auth_error");
    const me = await call(jar, "GET", "/api/auth/me");
    expect(me.status).toBe(200);
    expect(userOf(me).id).toBe(id);
    expect((me.json as { provider: string }).provider).toBe("password+google");
  });

  it("refuses an email already linked to a different Google account", async () => {
    const email = nextEmail("conflict");
    const { id } = await signUpFresh({ email });
    await prisma.user.update({ where: { id }, data: { googleId: "google-sub-original" } });

    // Same address, different Google subject: this must never re-key the row.
    googleStub({ sub: "google-sub-other", email, email_verified: true, name: "Someone Else" });

    const jar = new Jar();
    const redirect = await call(jar, "GET", "/api/auth/google", undefined, { redirect: "manual" });
    const state = locationParams(redirect).get("state");
    const callback = await call(
      jar,
      "GET",
      `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state ?? "")}`,
      undefined,
      { redirect: "manual" },
    );

    expect(callback.status).toBe(302);
    expect(callback.location).toContain("auth_error=account_conflict");
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(false);
    const row = await prisma.user.findUnique({ where: { email }, select: { googleId: true, passwordHash: true } });
    expect(row?.googleId).toBe("google-sub-original");
    expect(row?.passwordHash).toMatch(/^scrypt\$/);
  });

  it("refuses an identity whose email Google has not verified", async () => {
    googleStub({
      sub: "unverified-sub",
      email: "unverified@example.test",
      email_verified: false,
    });

    const jar = new Jar();
    const redirect = await call(jar, "GET", "/api/auth/google", undefined, { redirect: "manual" });
    const state = locationParams(redirect).get("state");
    const callback = await call(
      jar,
      "GET",
      `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state ?? "")}`,
      undefined,
      { redirect: "manual" },
    );

    expect(callback.location).toContain("auth_error=oauth_unverified_email");
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await prisma.user.findUnique({ where: { email: "unverified@example.test" } })).toBeNull();
  });

  it("reports a denied consent without creating anything", async () => {
    const result = await call(new Jar(), "GET", "/api/auth/google/callback?error=access_denied&state=x", undefined, {
      redirect: "manual",
    });
    expect(result.location).toContain("auth_error=cancelled");
  });

  it("never turns the callback into an open redirect", async () => {
    const { safeRedirectPath } = await import("../src/auth/oauth");
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/")).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("https://evil.example")).toBe("/");
    expect(safeRedirectPath("//evil.example")).toBe("/");
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
    expect(safeRedirectPath("/path\nLocation: https://evil.example")).toBe("/");
    expect(safeRedirectPath("/path?next=https://evil.example")).toBe("/path?next=https://evil.example");
  });
});

// ---------------------------------------------------------------------------
// Password storage
// ---------------------------------------------------------------------------

describe("password storage", () => {
  it("hashes with scrypt, using a fresh salt every time", async () => {
    const { hashPassword, verifyPassword } = await import("../src/auth/passwords");
    const first = await hashPassword("same-password-123");
    const second = await hashPassword("same-password-123");

    expect(first).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
    expect(first).not.toBe(second); // per-password random salt
    await expect(verifyPassword("same-password-123", first)).resolves.toBe(true);
    await expect(verifyPassword("same-password-123", second)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password-123", first)).resolves.toBe(false);
    await expect(verifyPassword("same-password-123", null)).resolves.toBe(false);
    await expect(verifyPassword("same-password-123", "not-a-hash")).resolves.toBe(false);
  });

  it("the stored hash verifies but the plaintext is never persisted", async () => {
    const email = nextEmail("storage");
    await signUpFresh({ email });
    const row = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toContain(SIGNUP.password);
  });
});
