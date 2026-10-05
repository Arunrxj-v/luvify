import fs from "node:fs/promises";
import path from "node:path";
import type { Response } from "express";
import { exportSite } from "@luvify/site-renderer";
import type { ProjectAsset } from "@prisma/client";
import {
  ALLOWED_CONTENT_TYPES,
  classifyAsset,
  detectContentType,
  foldBrief,
  hydrateDocument,
  parseDelimited,
  storageNameFor,
  type AssetDto,
  type ClientAsset,
  type DelimitedParse,
  type HydrateTeamMember,
  type SiteDocument,
} from "@luvify/shared";
import { ApiError } from "./errors";
import { env } from "./env";
import { prisma } from "./prisma";
import { syncWebsiteFiles } from "./pipeline";
import { briefOf, documentOf, requirementsOf, type ProjectWithRelations } from "./store";

/**
 * Project-scoped asset storage.
 *
 * Bytes live under `UPLOADS_DIR/<projectId>/<storageName>` where `storageName`
 * is `<assetId><ext>` - server-generated, never a client path, so directory
 * traversal is impossible by construction. Every read here takes a
 * `ProjectWithRelations` (fetched through `loadProject`, which joins on
 * userId), and every query filters on `projectId`, so one user's project can
 * never surface another's file: foreign ids simply behave like missing ones.
 */

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

/** Extension candidates accepted by the upload endpoint, for error messages. */
const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "pdf", "csv", "tsv", "txt", "xlsx", "xls", "docx", "doc", "mp4", "webm"];

/** Absolute URL stored inside generated documents (works in preview srcdoc). */
export function assetUrl(projectId: string, assetId: string): string {
  return `${env.publicBaseUrl}/api/projects/${projectId}/assets/${assetId}`;
}

export function toAssetDto(row: ProjectAsset): AssetDto {
  return {
    id: row.id,
    kind: row.kind as AssetDto["kind"],
    category: row.category,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    alt: row.alt,
    url: assetUrl(row.projectId, row.id),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Oldest first, grouped by brief slot so hydration consumes them in order. */
export async function listAssetRows(projectId: string): Promise<ProjectAsset[]> {
  return prisma.projectAsset.findMany({
    where: { projectId },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
}

export async function clientAssetsOf(projectId: string): Promise<ClientAsset[]> {
  const rows = await listAssetRows(projectId);
  return rows.map((row) => {
    const dto = toAssetDto(row);
    return { id: dto.id, url: dto.url, kind: dto.kind, category: dto.category, filename: dto.filename, alt: dto.alt };
  });
}

export function assetFilePath(row: ProjectAsset): string {
  const dir = path.resolve(env.uploadsDir, row.projectId);
  const filePath = path.resolve(dir, row.storageName);
  // Belt and braces: the name is server-generated, but any resolution that
  // escapes the project directory is a bug, not a download.
  if (!filePath.startsWith(dir + path.sep)) {
    throw ApiError.notFound(`Asset "${row.id}" was not found`);
  }
  return filePath;
}

export interface SaveAssetInput {
  filename: string;
  category: string;
  alt: string;
  bytes: Buffer;
}

/**
 * Validates the bytes against the type allowlist (sniffed content type wins
 * over the client-declared one), writes them and records the row.
 */
export async function saveAsset(
  project: ProjectWithRelations,
  input: SaveAssetInput,
): Promise<{ row: ProjectAsset; parsed?: DelimitedParse }> {
  const filename = sanitizeFilename(input.filename);
  if (!filename) throw ApiError.badRequest("An upload needs a file name.");
  if (input.bytes.length === 0) throw ApiError.badRequest(`"${filename}" is empty.`);
  if (input.bytes.length > MAX_ASSET_BYTES) {
    throw ApiError.badRequest(
      `"${filename}" is ${formatBytes(input.bytes.length)}. The limit is ${formatBytes(MAX_ASSET_BYTES)}.`,
    );
  }

  const contentType = detectContentType(filename, input.bytes);
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw ApiError.badRequest(
      `"${filename}" (${contentType}) is not a supported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    );
  }

  const kind = classifyAsset(filename, contentType);
  const row = await prisma.projectAsset.create({
    data: {
      projectId: project.id,
      kind,
      category: input.category.slice(0, 60),
      filename,
      contentType,
      sizeBytes: input.bytes.length,
      storageName: "pending",
      alt: input.alt.slice(0, 300),
    },
  });

  try {
    const storageName = storageNameFor(row.id, filename, contentType);
    const dir = path.resolve(env.uploadsDir, project.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, storageName), input.bytes);
    const updated = await prisma.projectAsset.update({
      where: { id: row.id },
      data: { storageName },
    });
    const parsed = contentType.startsWith("text/")
      ? parseDelimited(input.bytes.toString("utf8"))
      : undefined;
    return { row: updated, ...(parsed && parsed.rows.length > 0 ? { parsed } : {}) };
  } catch (error) {
    // Never leave a row whose bytes are missing.
    await prisma.projectAsset.delete({ where: { id: row.id } }).catch(() => undefined);
    throw error;
  }
}

/**
 * Deletes the row and the bytes. When the stored document referenced the
 * asset, the document is re-hydrated in clear-only mode and re-exported so the
 * site shows an honest placeholder instead of a broken image.
 */
export async function deleteAsset(
  project: ProjectWithRelations,
  row: ProjectAsset,
): Promise<{ documentUpdated: boolean }> {
  await prisma.projectAsset.delete({ where: { id: row.id } }).catch(() => undefined);
  await fs.rm(assetFilePath(row), { force: true });

  const document = documentOf(project);
  if (!document || !documentHasAsset(document, row.id)) return { documentUpdated: false };

  const assets = await clientAssetsOf(project.id);
  const scrubbed = hydrateDocument(document, { assets, fill: false });
  if (JSON.stringify(scrubbed) === JSON.stringify(document)) return { documentUpdated: false };

  const files = exportSite(scrubbed).files;
  await prisma.website.update({
    where: { projectId: project.id },
    data: { document: JSON.stringify(scrubbed) },
  });
  await syncWebsiteFiles(project.id, files);
  return { documentUpdated: true };
}

function documentHasAsset(document: SiteDocument, assetId: string): boolean {
  return JSON.stringify(document).includes(`/assets/${assetId}`);
}

/**
 * The hydration pass: fills empty image slots (hero, gallery, products, team,
 * logo) from this project's uploads and clears references to deleted assets.
 * `fill: false` is the delete-scrub mode - clear only, never add.
 */
export async function hydrateProjectDocument(
  project: ProjectWithRelations,
  document: SiteDocument,
  options: { fill?: boolean } = {},
): Promise<SiteDocument> {
  const assets = await clientAssetsOf(project.id);
  const brief = briefOf(project);
  const folded = foldBrief(requirementsOf(project), brief);
  const team: HydrateTeamMember[] = folded.content.team.slice(0, 12).map((member) => ({
    name: member.name,
    role: member.role,
    bio: member.bio,
  }));
  return hydrateDocument(document, { assets, team, ...(options.fill === false ? { fill: false } : {}) });
}

/** Streams a stored asset to the response with defensive headers. */
export async function sendAsset(row: ProjectAsset, res: Response): Promise<void> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(assetFilePath(row));
  } catch {
    throw ApiError.notFound(`Asset "${row.id}" was not found`);
  }
  const inline = row.contentType.startsWith("image/") || row.contentType === "application/pdf" || row.contentType.startsWith("text/");
  res.setHeader("Content-Type", row.contentType);
  // Uploaded files are user data, not code: never let a browser sniff or run
  // them as the site's own origin.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
  res.setHeader("Content-Length", String(bytes.length));
  res.send(bytes);
}

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return base.slice(0, 200);
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
