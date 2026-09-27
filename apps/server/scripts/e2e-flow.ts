/**
 * End-to-end smoke test against a *running* server (`npm run e2e`):
 * health -> templates -> create project -> chat -> specification -> generate ->
 * preview -> export -> publish -> versions. Exits non-zero on the first failure.
 */

import type {
  ExportResponseDto,
  GenerateSpecificationResponseDto,
  GenerateWebsiteResponseDto,
  HealthResponseDto,
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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } } | null)?.error?.message ?? "";
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${response.status} ${message}`);
  }
  return payload as T;
}

const step = (label: string): void => console.log(`\n[e2e] ${label}`);

async function main(): Promise<void> {
  console.log(`[e2e] API base: ${base}`);

  step("health");
  const health = await call<HealthResponseDto>("/api/health");
  assert(health.status === "ok", "health is not ok");
  assert(health.database === "connected", `database is ${health.database}`);
  console.log(`[e2e]   ok, ai=${health.aiProvider}, db=${health.database}`);

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

  console.log("\n[e2e] ALL CHECKS PASSED");
}

main().catch((error: unknown) => {
  console.error("\n[e2e] FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
