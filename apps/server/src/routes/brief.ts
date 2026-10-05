/**
 * Client brief + uploaded assets: the project-scoped content the client
 * supplies (menus, catalogs, photos, logos, documents) so generation can use
 * real facts and real images instead of inventing them.
 *
 * Every route resolves the project through `loadProject(id, userId)`, which
 * joins on the owner inside the query - a foreign project id (or a foreign
 * asset id) is indistinguishable from a missing one, so probing never
 * confirms anything. Asset bytes are raw `application/octet-stream`; all
 * metadata travels in query params so no body-parser other than this route's
 * own `express.raw` ever sees the payload.
 */
import { Router, raw } from "express";
import {
  SaveBriefRequestSchema,
  type BriefResponseDto,
  type DeleteAssetResponseDto,
  type UploadAssetResponseDto,
} from "@luvify/shared";
import { currentUserId } from "../auth/middleware";
import { deleteAsset, listAssetRows, saveAsset, sendAsset, toAssetDto } from "../assets";
import { ApiError, apiHandler, parseWith } from "../errors";
import { prisma } from "../prisma";
import { loadProject, recordActivity, saveBrief, toBriefResponse } from "../store";

export const projectBriefRouter = Router({ mergeParams: true });

// --- brief -------------------------------------------------------------------

projectBriefRouter.get(
  "/:id/brief",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const body: BriefResponseDto = toBriefResponse(project);
    res.json(body);
  }),
);

projectBriefRouter.put(
  "/:id/brief",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const brief = parseWith(SaveBriefRequestSchema, req.body, "Brief request");
    const updatedAt = await saveBrief(project.id, brief);
    await recordActivity(project.id, "requirements_updated", "Content & assets updated");
    const body: BriefResponseDto = { brief, updatedAt: updatedAt.toISOString() };
    res.json(body);
  }),
);

// --- assets ------------------------------------------------------------------

projectBriefRouter.get(
  "/:id/assets",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const rows = await listAssetRows(project.id);
    const assets = rows.map(toAssetDto);
    res.json({ assets });
  }),
);

projectBriefRouter.post(
  "/:id/assets",
  raw({ type: "application/octet-stream", limit: "25mb" }),
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const filename = String(req.query.filename ?? "");
    if (!filename.trim()) throw ApiError.badRequest("An upload needs ?filename=.");
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw ApiError.badRequest("Send the file bytes with Content-Type: application/octet-stream.");
    }
    const { row, parsed } = await saveAsset(project, {
      filename,
      category: String(req.query.category ?? ""),
      alt: String(req.query.alt ?? ""),
      bytes: req.body,
    });
    const body: UploadAssetResponseDto = {
      asset: toAssetDto(row),
      ...(parsed ? { parsed } : {}),
    };
    res.status(201).json(body);
  }),
);

projectBriefRouter.get(
  "/:id/assets/:assetId",
  apiHandler(async (req, res) => {
    // Ownership of the project gates ownership of the asset: both ids must
    // resolve inside one owner-scoped query before a byte is read.
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const row = await prisma.projectAsset.findFirst({
      where: { id: req.params.assetId ?? "", projectId: project.id },
    });
    if (!row) throw ApiError.notFound("Asset not found");
    await sendAsset(row, res);
  }),
);

projectBriefRouter.delete(
  "/:id/assets/:assetId",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const row = await prisma.projectAsset.findFirst({
      where: { id: req.params.assetId ?? "", projectId: project.id },
    });
    if (!row) throw ApiError.notFound("Asset not found");
    const { documentUpdated } = await deleteAsset(project, row);
    const body: DeleteAssetResponseDto = { deleted: true, documentUpdated };
    res.json(body);
  }),
);
