/**
 * Generation pipeline: writes the rendered `SiteDocument`, its exported files,
 * version snapshots, activities and generation messages to the database, plus
 * the local publish step that writes a deployable copy of the site to disk.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  GenerateWebsiteResponseDto,
  SiteDocument,
  WebsiteFileDto,
  WebsiteSpecification,
} from "@luvify/shared";
import { exportSite } from "@luvify/site-renderer";
import type { Deployment } from "@prisma/client";
import { env } from "./env";
import { prisma } from "./prisma";
import { toDeploymentDto, toFileDto, toMessageDto, toVersionDto } from "./store";
import { ensureConversation, recordActivity, type ProjectWithRelations } from "./store";
import { ApiError } from "./errors";

export async function nextVersionNumber(projectId: string): Promise<number> {
  const latest = await prisma.websiteVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return (latest?.versionNumber ?? 0) + 1;
}

/** Upserts every exported file and deletes the ones that no longer exist. */
export async function syncWebsiteFiles(
  projectId: string,
  files: Array<{ path: string; language: string; content: string }>,
): Promise<WebsiteFileDto[]> {
  const keep = files.map((file) => file.path);
  for (const file of files) {
    await prisma.websiteFile.upsert({
      where: { projectId_path: { projectId, path: file.path } },
      create: { projectId, path: file.path, language: file.language, content: file.content },
      update: { language: file.language, content: file.content },
    });
  }
  await prisma.websiteFile.deleteMany({ where: { projectId, path: { notIn: keep } } });
  const rows = await prisma.websiteFile.findMany({ where: { projectId }, orderBy: { path: "asc" } });
  return rows.map(toFileDto);
}

export interface PersistSiteInput {
  project: ProjectWithRelations;
  document: SiteDocument;
  specification: WebsiteSpecification | null;
  files: Array<{ path: string; language: string; content: string }>;
  changeDescription: string;
  activityType: string;
  templateId: string | null;
  source: "generation" | "modification" | "restore" | "template" | "seed";
}

/**
 * Verifies that a generated document belongs to the given project.
 * Fails safely if the document contains content from a different project.
 */
export function verifyDocumentIsolation(
  project: Pick<ProjectWithRelations, "businessName" | "name">,
  document: SiteDocument,
): void {
  const expectedName = (project.businessName || project.name).trim();
  const actualName = document.siteName.trim();

  // The document's site name must match the project's business name.
  // If it doesn't, the document was built from another project's context.
  if (expectedName && actualName && expectedName !== actualName) {
    throw ApiError.badRequest(
      `Document isolation violation: generated document siteName "${actualName}" does not match project "${expectedName}". Refusing to persist.`,
    );
  }
}

/** Persists a freshly built document as the project's current version. */
export async function persistSite(input: PersistSiteInput): Promise<GenerateWebsiteResponseDto> {
  const { project, document } = input;

  // Safety check: verify the document belongs to this project before saving.
  verifyDocumentIsolation(project, document);

  const documentJson = JSON.stringify(document);

  await prisma.website.upsert({
    where: { projectId: project.id },
    create: { projectId: project.id, document: documentJson },
    update: { document: documentJson },
  });

  const files = await syncWebsiteFiles(project.id, input.files);

  const version = await prisma.websiteVersion.create({
    data: {
      projectId: project.id,
      versionNumber: document.meta.versionNumber,
      specification: input.specification ? JSON.stringify(input.specification) : null,
      document: documentJson,
      files: JSON.stringify(input.files),
      changeDescription: input.changeDescription,
      source: input.source,
    },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: { currentVersionId: version.id, status: "DRAFT", templateId: input.templateId },
  });
  await recordActivity(project.id, input.activityType, input.changeDescription);

  const conversation = await ensureConversation(project.id, "BUILDER", "Builder");
  const message = await prisma.message.create({
    data: {
      projectId: project.id,
      conversationId: conversation.id,
      role: "generation",
      content: `${input.changeDescription} (version ${version.versionNumber}: ${document.pages.length} pages, ${files.length} files).`,
      payload: JSON.stringify({
        kind: "generation",
        versionNumber: version.versionNumber,
        provider: document.meta.provider,
        changeSummary: [input.changeDescription],
        bullets: files.slice(0, 10).map((file) => file.path),
      }),
    },
  });

  return {
    version: toVersionDto(version, version.id),
    document,
    files,
    message: toMessageDto(message),
    status: "DRAFT",
  };
}

export interface PublishResult {
  deployment: ReturnType<typeof toDeploymentDto>;
  fileCount: number;
  url: string;
}

/**
 * Writes every exported file to `STORAGE_DIR/<slug>` and records a READY
 * deployment. The files are served back at `/sites/<slug>` by the API server,
 * which is what the deployment URL points at.
 */
export async function publishProject(
  project: ProjectWithRelations,
  document: SiteDocument,
  provider: string,
): Promise<PublishResult> {
  const directory = path.resolve(env.storageDir, project.slug);
  const exported = exportSite(document, { projectName: project.slug, siteUrl: env.publicBaseUrl });

  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });

  for (const file of exported.files) {
    const target = path.resolve(directory, file.path);
    if (!target.startsWith(directory + path.sep)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf8");
  }

  const url = `${env.publicBaseUrl}/sites/${project.slug}/`;
  const deployment: Deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      versionNumber: document.meta.versionNumber,
      status: "READY",
      url,
      provider,
      message: `Published ${exported.files.length} files`,
      publishedAt: new Date(),
    },
  });
  await prisma.project.update({ where: { id: project.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await recordActivity(project.id, "published", `Published ${document.siteName} to ${url}`);

  return { deployment: toDeploymentDto(deployment), fileCount: exported.files.length, url };
}
