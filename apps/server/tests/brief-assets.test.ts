/**
 * Client brief + project-scoped assets, exercised over HTTP against the real
 * Express app (same harness as auth-api.test.ts, its own throwaway database).
 *
 * What this suite pins down:
 *   * brief CRUD behind the session + ownership gates (404 for foreign ids);
 *   * upload / list / read / delete of raw bytes with the type allowlist;
 *   * strict project isolation: user B never sees or reaches user A's brief
 *     or files, not even by probing ids directly;
 *   * GENERATION ACTUALLY USES THE SUPPLIED DATA: menu rows, prices, hours
 *     and uploaded images flow into the generated document - and the stored
 *     requirements stay clean (brief values are folded only in memory);
 *   * deleting an uploaded asset scrubs it from the stored document;
 *   * publish rewrites asset URLs and copies the bytes next to the site.
 *
 * `AI_PROVIDER=mock` runs the deterministic branch (fast, free, offline);
 * set `LUVIFY_TEST_LIVE_AI=1` to push the same data through real Gemini.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Type-only import (aliased so it cannot collide with the runtime `createApp`
// that the suite loads dynamically after the environment has been configured).
import type { createApp as CreateApp } from "../src/app";

type App = ReturnType<typeof CreateApp>;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const testDbFile = path.join(repoRoot, "prisma", "sqlite", "brief-test.db");
const testDbUrl = "file:./brief-test.db";
const SESSION_COOKIE = "luvify_session";
const LIVE_AI = process.env.LUVIFY_TEST_LIVE_AI === "1";

// Fresh, per-suite storage: uploads and published files never touch the
// developer's real .uploads / .storage directories.
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "luvify-brief-uploads-"));
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "luvify-brief-storage-"));

// ---------------------------------------------------------------------------
// Environment - MUST be set before anything under src/ is imported.
// ---------------------------------------------------------------------------

process.env.DATABASE_URL = testDbUrl;
process.env.AI_PROVIDER = LIVE_AI ? "gemini" : "mock";
process.env.AUTH_RATE_LIMIT_MAX = "5000";
process.env.AUTH_SESSION_DAYS = "1";
process.env.AUTH_COOKIE_SECURE = "false";
process.env.UPLOADS_DIR = uploadsDir;
process.env.STORAGE_DIR = storageDir;
process.env.APP_BASE_URL = "http://localhost:5173";

function prepareDatabase(): void {
  execFileSync(process.execPath, [path.join(repoRoot, "scripts", "sync-sqlite-schema.mjs")], {
    cwd: repoRoot,
    stdio: "pipe",
  });
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

const { createApp } = await import("../src/app");
const { prisma } = await import("../src/prisma");

// ---------------------------------------------------------------------------
// Cookie-aware HTTP client (same shape as auth-api.test.ts)
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

interface CallResult {
  status: number;
  json: unknown;
  headers: Headers;
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
  headers: Record<string, string> = {},
): Promise<CallResult> {
  const response = await fetch(`${base}${requestPath}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(jar.cookies.size > 0 ? { cookie: jar.header() } : {}),
      ...headers,
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
  return { status: response.status, json, raw, headers: response.headers };
}

/** Raw-bytes upload - mirrors the web client's `uploadAsset` exactly. */
async function upload(
  jar: Jar,
  projectId: string,
  input: { filename: string; category?: string; bytes: Uint8Array },
): Promise<CallResult> {
  const params = new URLSearchParams({ filename: input.filename, category: input.category ?? "" });
  const response = await fetch(`${base}/api/projects/${projectId}/assets?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      ...(jar.cookies.size > 0 ? { cookie: jar.header() } : {}),
    },
    // undici's `BodyInit` type omits ArrayBuffer views; Node's fetch accepts
    // them at runtime (this is exactly how the web client sends file bytes).
    body: input.bytes as unknown as BodyInit,
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
  return { status: response.status, json, raw, headers: response.headers };
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
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  fs.rmSync(storageDir, { recursive: true, force: true });
});

let unique = 0;
const nextEmail = (label: string): string =>
  `${label}-${Date.now().toString(36)}-${(unique += 1)}@example.test`.toLowerCase();

async function signUpFresh(label: string): Promise<Jar> {
  const jar = new Jar();
  const result = await call(jar, "POST", "/api/auth/signup", {
    name: "Brief Tester",
    email: nextEmail(label),
    password: "correct-horse-battery",
  });
  expect(result.status, `signup for ${label} should succeed`).toBe(201);
  return jar;
}

async function createProject(
  jar: Jar,
  name: string,
  websiteType = "restaurant",
): Promise<string> {
  const created = await call(jar, "POST", "/api/projects", {
    name,
    businessDescription: "A speciality coffee roastery and all-day cafe in Kochi.",
    websiteType,
    templateId: websiteType === "restaurant" ? "restaurant" : undefined,
  });
  expect(created.status).toBe(201);
  return (created.json as { id: string }).id;
}

/** Minimal but real PNG magic bytes - classification is metadata-only. */
function pngBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

interface AssetBody {
  id: string;
  kind: string;
  category: string;
  filename: string;
  contentType: string;
  url: string;
}

function assetOf(result: CallResult): AssetBody {
  const body = result.json as { asset?: AssetBody } | null;
  expect(body?.asset, `expected an asset in: ${result.raw}`).toBeTruthy();
  return body?.asset as AssetBody;
}

/** The API path of an asset URL - the test server runs on an ephemeral port. */
function assetPath(url: string): string {
  return new URL(url).pathname;
}

// ---------------------------------------------------------------------------
// The full lifecycle: brief -> uploads -> generation -> scrub -> publish
// ---------------------------------------------------------------------------

describe("brief and assets flow into a real generation", () => {
  let jar: Jar;
  let projectId = "";
  let heroAsset: AssetBody;
  let logoAsset: AssetBody;

  const briefPayload = {
    domain: "restaurant",
    fields: {
      contact: {
        email: "hello@keralacoffee.co",
        hours: "Mon-Sun 7:00-22:00",
        whatsapp: "+91 98470 00000",
      },
    },
    collections: {
      menu: [
        { name: "Kerala Beef Fry", price: "₹480", category: "Mains", diet: "Spicy" },
        { name: "Filter Coffee", price: "₹120", category: "Drinks" },
      ],
    },
  };

  beforeAll(async () => {
    jar = await signUpFresh("brief-owner");
    projectId = await createProject(jar, "Kerala Coffee Co.");

    const saved = await call(jar, "PUT", `/api/projects/${projectId}/brief`, briefPayload);
    expect(saved.status, saved.raw).toBe(200);

    heroAsset = assetOf(
      await upload(jar, projectId, {
        filename: "cafe-hero.png",
        category: "media.hero",
        bytes: pngBytes(),
      }),
    );
    logoAsset = assetOf(
      await upload(jar, projectId, {
        filename: "logo.png",
        category: "brand.logo",
        bytes: pngBytes(),
      }),
    );
  });

  it("requires a session and returns the saved brief verbatim", async () => {
    const anonymous = new Jar();
    expect((await call(anonymous, "GET", `/api/projects/${projectId}/brief`)).status).toBe(401);

    const result = await call(jar, "GET", `/api/projects/${projectId}/brief`);
    expect(result.status).toBe(200);
    const body = result.json as { brief: typeof briefPayload; updatedAt: string | null };
    expect(body.brief).toEqual(briefPayload);
    expect(body.updatedAt).toBeTruthy();
  });

  it("rejects malformed briefs with 400, not 500", async () => {
    const tooLong = await call(jar, "PUT", `/api/projects/${projectId}/brief`, {
      ...briefPayload,
      fields: { contact: { email: "x".repeat(4001) } },
    });
    expect(tooLong.status).toBe(400);
    expect(errorOf(tooLong)?.code).toBe("bad_request");

    const emptyRow = await call(jar, "PUT", `/api/projects/${projectId}/brief`, {
      ...briefPayload,
      collections: { menu: [{}] },
    });
    expect(emptyRow.status).toBe(400);
  });

  it("classifies uploads, parses CSV and serves bytes with defensive headers", async () => {
    const list = await call(jar, "GET", `/api/projects/${projectId}/assets`);
    expect(list.status).toBe(200);
    const assets = (list.json as { assets: AssetBody[] }).assets;
    expect(assets.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([heroAsset.id, logoAsset.id]),
    );
    expect(assets.find((entry) => entry.id === heroAsset.id)?.kind).toBe("PHOTO");
    expect(assets.find((entry) => entry.id === logoAsset.id)?.kind).toBe("LOGO");

    // Raw bytes round-trip...
    const file = await fetch(`${base}${assetPath(heroAsset.url)}`, { headers: { cookie: jar.header() } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(file.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(new Uint8Array(await file.arrayBuffer()).subarray(0, 4)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );

    // ...CSV comes back pre-parsed for the row importer...
    const csv = await upload(jar, projectId, {
      filename: "menu-export.csv",
      bytes: new TextEncoder().encode('Dish,Price\n"Masala Dosa","₹250"\n'),
    });
    expect(csv.status).toBe(201);
    const parsed = (csv.json as { parsed?: { columns: string[]; rows: Array<Record<string, string>> } })
      .parsed;
    expect(parsed?.columns).toEqual(["Dish", "Price"]);
    expect(parsed?.rows[0]?.Dish).toBe("Masala Dosa");

    // ...and disallowed or malformed uploads are refused.
    const exe = await upload(jar, projectId, {
      filename: "virus.exe",
      bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
    });
    expect(exe.status).toBe(400);

    const empty = await upload(jar, projectId, {
      filename: "empty.png",
      bytes: new Uint8Array(0),
    });
    expect(empty.status).toBe(400);

    const noName = await call(jar, "POST", `/api/projects/${projectId}/assets`, undefined, {});
    expect(noName.status).toBe(400);

    const oversized = await upload(jar, projectId, {
      filename: "huge.png",
      bytes: new Uint8Array(21 * 1024 * 1024),
    });
    expect(oversized.status).toBe(400);
    expect(errorOf(oversized)?.message).toMatch(/limit/i);
  });

  it(
    "generation uses the supplied menu, prices, hours and images",
    async () => {
      const result = await call(jar, "POST", `/api/projects/${projectId}/generate`, {});
      expect(result.status, result.raw).toBe(200);
      const body = result.json as {
        document: unknown;
        files: Array<{ path: string; content: string }>;
      };
      const document = JSON.stringify(body.document);

      // Real menu rows and prices reach the document - verbatim, not invented.
      expect(document).toContain("Kerala Beef Fry");
      expect(document).toContain("Filter Coffee");
      expect(document).toContain("₹480");
      expect(document).toContain("₹120");
      // Contact details from the brief land on the contact block.
      expect(document).toContain("hello@keralacoffee.co");
      expect(document).toContain("Mon-Sun 7:00-22:00");
      // The uploaded hero photo and logo are wired into their slots.
      expect(document).toContain(`/assets/${heroAsset.id}`);
      expect(document).toContain(`/assets/${logoAsset.id}`);
      // ...and the exported HTML carries the menu too.
      expect(JSON.stringify(body.files)).toContain("Kerala Beef Fry");

      // The brief-only fact that has no structural carrier reaches the spec's
      // knowledge, so the model can quote it.
      const spec = await call(jar, "GET", `/api/projects/${projectId}/specification`);
      expect(spec.status).toBe(200);
      const specification = (
        spec.json as { specification: { knowledge: { knownFacts: string[] } } | null }
      ).specification;
      const facts = (specification?.knowledge.knownFacts ?? []).join("\n");
      expect(facts).toContain("WhatsApp: +91 98470 00000");
      expect(facts).toContain("Dietary note: Spicy");

      // The interview stays the stored source of truth: folding is in-memory.
      const requirements = await call(jar, "GET", `/api/projects/${projectId}/requirements`);
      expect(requirements.raw).not.toContain("Kerala Beef Fry");
      expect(requirements.raw).not.toContain("+91 98470 00000");
    },
    300_000,
  );

  it("deleting an uploaded asset scrubs it from the stored document", async () => {
    const before = await call(jar, "GET", `/api/projects/${projectId}/preview?page=/`);
    expect(before.status).toBe(200);
    expect(String((before.json as { html: string }).html)).toContain(`/assets/${logoAsset.id}`);

    const removed = await call(jar, "DELETE", `/api/projects/${projectId}/assets/${logoAsset.id}`);
    expect(removed.status).toBe(200);
    expect((removed.json as { deleted: boolean; documentUpdated: boolean }).deleted).toBe(true);
    expect((removed.json as { documentUpdated: boolean }).documentUpdated).toBe(true);

    const after = await call(jar, "GET", `/api/projects/${projectId}/preview?page=/`);
    expect(String((after.json as { html: string }).html)).not.toContain(
      `/assets/${logoAsset.id}`,
    );
    expect((await fetch(`${base}${assetPath(logoAsset.url)}`, { headers: { cookie: jar.header() } })).status).toBe(404);
  });

  it(
    "publish copies uploaded bytes next to the site and rewrites their URLs",
    async () => {
      const published = await call(jar, "POST", `/api/projects/${projectId}/publish`, {});
      expect(published.status, published.raw).toBe(200);
      const url = (published.json as { deployment: { url: string } }).deployment.url;
      const slug = new URL(url).pathname.split("/").filter(Boolean)[1] ?? "";

      const html = fs.readFileSync(path.join(storageDir, slug, "index.html"), "utf8");
      // Every reference now resolves from the published folder, no API session.
      expect(html).toContain(`/sites/${slug}/assets/`);
      expect(html).not.toContain(`/api/projects/${projectId}/assets/${heroAsset.id}`);
      // The hero's bytes were physically copied into the publication.
      const assetsDir = path.join(storageDir, slug, "assets");
      expect(fs.existsSync(assetsDir)).toBe(true);
      expect(fs.readdirSync(assetsDir).length).toBeGreaterThan(0);
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------
// Isolation: project B is a black box from project A's side, and vice versa
// ---------------------------------------------------------------------------

describe("brief and assets are strictly project-scoped", () => {
  let alice: Jar;
  let bob: Jar;
  let aliceProject = "";
  let bobProject = "";
  let aliceAsset: AssetBody;

  beforeAll(async () => {
    alice = await signUpFresh("brief-alice");
    bob = await signUpFresh("brief-bob");
    aliceProject = await createProject(alice, "Alice's Bistro");
    bobProject = await createProject(bob, "Bob's Bistro");
    await call(alice, "PUT", `/api/projects/${aliceProject}/brief`, {
      domain: "restaurant",
      fields: { contact: { email: "alice@secret.test" } },
      collections: { menu: [{ name: "Alice Secret Curry", price: "₹999" }] },
    });
    aliceAsset = assetOf(
      await upload(alice, aliceProject, {
        filename: "alice-secret.png",
        category: "media.hero",
        bytes: pngBytes(),
      }),
    );
  });

  it("another session cannot read or write a foreign brief (404, never 403)", async () => {
    const read = await call(bob, "GET", `/api/projects/${aliceProject}/brief`);
    expect(read.status).toBe(404);
    expect(read.raw).not.toContain("alice@secret.test");

    const write = await call(bob, "PUT", `/api/projects/${aliceProject}/brief`, {
      domain: "restaurant",
      fields: {},
      collections: {},
    });
    expect(write.status).toBe(404);
  });

  it("another session cannot upload into, list or fetch a foreign project's files", async () => {
    const uploadInto = await upload(bob, aliceProject, {
      filename: "bob.png",
      bytes: pngBytes(),
    });
    expect(uploadInto.status).toBe(404);

    const list = await call(bob, "GET", `/api/projects/${aliceProject}/assets`);
    expect(list.status).toBe(404);
    expect(list.raw).not.toContain("alice-secret.png");

    // Direct id probing: Alice's asset id under either path never resolves.
    expect((await call(bob, "GET", `/api/projects/${aliceProject}/assets/${aliceAsset.id}`)).status).toBe(404);
    expect((await call(bob, "GET", `/api/projects/${bobProject}/assets/${aliceAsset.id}`)).status).toBe(404);
    expect((await call(bob, "DELETE", `/api/projects/${bobProject}/assets/${aliceAsset.id}`)).status).toBe(404);
  });

  it("each project sees only its own brief and files", async () => {
    const bobBrief = await call(bob, "GET", `/api/projects/${bobProject}/brief`);
    expect(bobBrief.status).toBe(200);
    expect(bobBrief.raw).not.toContain("alice@secret.test");
    expect((bobBrief.json as { brief: { domain: string } }).brief.domain).toBe("");

    const bobAssets = await call(bob, "GET", `/api/projects/${bobProject}/assets`);
    expect((bobAssets.json as { assets: AssetBody[] }).assets).toEqual([]);

    const aliceAssets = await call(alice, "GET", `/api/projects/${aliceProject}/assets`);
    const ids = (aliceAssets.json as { assets: AssetBody[] }).assets.map((entry) => entry.id);
    expect(ids).toContain(aliceAsset.id);
    expect(ids).not.toContain("");
  });

  it("delete only removes the row it owns", async () => {
    const missing = await call(alice, "DELETE", `/api/projects/${aliceProject}/assets/does-not-exist`);
    expect(missing.status).toBe(404);
    // Alice's asset survived Bob's probe above.
    expect(
      (await fetch(`${base}${assetPath(aliceAsset.url)}`, { headers: { cookie: alice.header() } })).status,
    ).toBe(200);
  });
});
