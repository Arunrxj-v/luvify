/**
 * End-to-end smoke test against a *running* server (`npm run e2e`):
 * health -> sign in -> templates -> create project -> chat -> specification ->
 * generate -> preview -> export -> publish -> versions. Exits non-zero on the
 * first failure.
 *
 * Phase 3: every project endpoint requires a session, so this script signs up
 * (or logs into) an `e2e@luvify.test` account first and carries the resulting
 * httpOnly cookie jar for the rest of the run.
 */

import type {
  ExportResponseDto,
  GenerateSpecificationResponseDto,
  GenerateWebsiteResponseDto,
  HealthResponseDto,
  MeResponseDto,
  PreviewResponseDto,
  ProjectDetailDto,
  PublishResponseDto,
  TemplateDto,
  VersionDto,
} from "@luvify/shared";

const base = (process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`).replace(/\/$/, "");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Session cookie(s) returned by the server - the browser's job, simulated here. */
const cookieJar = new Map<string, string>();

function storeCookies(response: Response): void {
  const lines: string[] =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const line of lines) {
    const [pair = "", ...attributes] = line.split(";");
    const index = pair.indexOf("=");
    if (index < 1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    const expired = attributes.some((entry) => /^\s*max-age\s*=\s*0\s*$/i.test(entry));
    if (expired || !value) cookieJar.delete(name);
    else cookieJar.set(name, value);
  }
}

function cookieHeader(): string {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(cookieJar.size > 0 ? { cookie: cookieHeader() } : {}),
      ...(init?.headers ?? {}),
    },
  });
  storeCookies(response);
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } } | null)?.error?.message ?? "";
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${response.status} ${message}`);
  }
  return payload as T;
}

const step = (label: string): void => console.log(`\n[e2e] ${label}`);

// Local runner credentials for a throwaway `.test` address. Overridable so the
// script never becomes a shared hard-coded password if it is ever pointed at a
// deployment: `E2E_EMAIL=... E2E_PASSWORD=... npm run e2e`.
const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e@luvify.test";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "e2e-runner-password-2026";

/** Signs up on the first run, logs in on every run after that. */
async function signIn(): Promise<void> {
  try {
    await call<unknown>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name: "E2E Runner", email: E2E_EMAIL, password: E2E_PASSWORD }),
    });
    console.log("[e2e]   signed up a fresh account");
  } catch (error) {
    if (!String(error).includes("-> 409 ")) throw error;
    await call<unknown>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
    });
    console.log("[e2e]   signed in with the existing account");
  }
  const me = await call<MeResponseDto>("/api/auth/me");
  assert(me.user.email === E2E_EMAIL, "session did not resolve to the e2e account");
  assert(cookieJar.size > 0, "no session cookie was set");
  console.log(`[e2e]   session ok for ${me.user.email} (${me.provider})`);
}

async function main(): Promise<void> {
  console.log(`[e2e] API base: ${base}`);

  step("health");
  const health = await call<HealthResponseDto>("/api/health");
  assert(health.status === "ok", "health is not ok");
  assert(health.database === "connected", `database is ${health.database}`);
  console.log(`[e2e]   ok, ai=${health.aiProvider}, db=${health.database}`);

  step("sign in");
  await signIn();

  step("templates");
  const templates = await call<TemplateDto[]>("/api/templates");
  assert(templates.length > 0, "no templates returned");
  console.log(`[e2e]   ${templates.length} templates: ${templates.map((t) => t.id).join(", ")}`);

  step("create project");
  const project = await call<ProjectDetailDto>("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: `E2E Bakery ${Date.now().toString(36)}`,
      businessName: "E2E Test Bakery",
      businessDescription: "An end-to-end test bakery used to verify the generation pipeline.",
      websiteType: "restaurant",
      templateId: "restaurant",
      contactEmail: "e2e@luvify.test",
    }),
  });
  assert(project.id, "project id missing");
  assert(project.requirements, "requirements were not seeded");
  console.log(`[e2e]   project ${project.id} (slug ${project.slug})`);

  step("chat updates requirements");
  const chat = await call<{ completeness: { overall: number } }>("/api/projects/" + project.id + "/chat", {
    method: "POST",
    body: JSON.stringify({ message: "We are open weekdays 7am to 4pm and take bookings for custom cakes." }),
  });
  assert(chat.completeness.overall > 0, "completeness stayed at 0");
  console.log(`[e2e]   completeness ${chat.completeness.overall}%`);

  step("generate specification");
  const specification = await call<GenerateSpecificationResponseDto>(
    `/api/projects/${project.id}/specification/generate`,
    { method: "POST", body: "{}" },
  );
  assert(specification.specification.pages.length > 0, "specification has no pages");
  console.log(`[e2e]   v${specification.version}, pages: ${specification.specification.pages.length}`);

  step("generate website");
  const generated = await call<GenerateWebsiteResponseDto>(`/api/projects/${project.id}/generate`, {
    method: "POST",
    body: "{}",
  });
  assert(generated.document.pages.length > 0, "document has no pages");
  assert(generated.files.length > 0, "no files were exported");
  assert(generated.version.versionNumber === 1, `unexpected version ${generated.version.versionNumber}`);
  console.log(`[e2e]   ${generated.document.pages.length} pages, ${generated.files.length} files`);

  step("preview");
  const preview = await call<PreviewResponseDto>(`/api/projects/${project.id}/preview?page=/`);
  assert(preview.html.includes("<!doctype html"), "preview html looks wrong");
  assert(preview.css.length > 0, "preview css missing");
  assert(preview.pages.length === generated.document.pages.length, "preview page list mismatch");
  console.log(`[e2e]   html ${preview.html.length} bytes, css ${preview.css.length} bytes`);

  step("export");
  const exported = await call<ExportResponseDto>(`/api/projects/${project.id}/export`);
  assert(exported.files.length >= generated.files.length, "export lost files");
  assert(exported.files.some((file) => file.path.endsWith(".html")), "no html file in export");
  console.log(`[e2e]   ${exported.files.length} files in bundle`);

  step("publish");
  const published = await call<PublishResponseDto>(`/api/projects/${project.id}/publish`, {
    method: "POST",
    body: JSON.stringify({ provider: "local" }),
  });
  assert(published.deployment.status === "READY", `deployment ${published.deployment.status}`);
  assert(published.publishedPages.length > 0, "no published pages");
  if (published.deployment.url) {
    const site = await fetch(published.deployment.url);
    assert(site.ok, `published url returned ${site.status}`);
  }
  console.log(`[e2e]   deployment ${published.deployment.status} at ${published.deployment.url}`);

  step("versions");
  const versions = await call<VersionDto[]>(`/api/projects/${project.id}/versions`);
  assert(versions.length === 1, `expected 1 version, got ${versions.length}`);
  console.log(`[e2e]   version history: ${versions.map((version) => version.versionNumber).join(", ")}`);

  step("cleanup");
  await call(`/api/projects/${project.id}`, { method: "DELETE" });
  console.log("[e2e]   project deleted");

  step("sign out");
  await call("/api/auth/logout", { method: "POST" });
  const afterSignOut = await fetch(`${base}/api/auth/me`, { headers: { cookie: cookieHeader() } });
  assert(afterSignOut.status === 401, `expected 401 after logout, got ${afterSignOut.status}`);
  console.log("[e2e]   session revoked");

  console.log("\n[e2e] ALL CHECKS PASSED");
}

main().catch((error: unknown) => {
  console.error("\n[e2e] FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
