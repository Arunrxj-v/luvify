/**
 * Website lifecycle routes: generate, modify, preview, export, publish and
 * version history (list + restore).
 */

import { Router } from "express";
import {
  GenerateWebsiteRequestSchema,
  ModifyWebsiteRequestSchema,
  PublishRequestSchema,
  RequirementsSchema,
  SiteDocumentSchema,
  applyClientCorrections,
  briefKnownFacts,
  buildProjectKnowledge,
  extractRequirementsFromText,
  foldBrief,
  mergeRequirements,
  parseWebsiteSpecification,
  unfoldBrief,
  type ExportResponseDto,
  type GenerateWebsiteResponseDto,
  type ModifyWebsiteResponseDto,
  type PreviewResponseDto,
  type PublishResponseDto,
  type Requirements,
  type RestoreVersionResponseDto,
  type WebsiteSpecification,
} from "@luvify/shared";
import { exportSite, renderPreview } from "@luvify/site-renderer";
import { currentUserId } from "../auth/middleware";
import { clientAssetsOf, hydrateProjectDocument } from "../assets";
import { ApiError, apiHandler, parseWith } from "../errors";
import { env } from "../env";
import {
  buildDocument,
  buildSpecification,
  diffDocuments,
  pagePlanFor,
  refreshDerivedFields,
  resolveTemplateId,
} from "../generate";
import { prisma } from "../prisma";
import {
  aiIsEnabled,
  extractRequirements,
  generateSiteWithAI,
  getAIProvider,
  removalSentences,
  requirementUpdateToPatch,
  runAI,
} from "../services/ai";
import { nextVersionNumber, persistSite, publishProject, verifyDocumentIsolation } from "../pipeline";
import {
  briefOf,
  documentOf,
  loadProject,
  recordActivity,
  requirementsOf,
  saveRequirements,
  toVersionDto,
} from "../store";

export const websiteRouter = Router({ mergeParams: true });

/**
 * The current project's interview conversation, used ONLY to respect explicit
 * client corrections during specification building. It is filtered by
 * projectId, so another project's messages can never enter the prompt.
 */
async function projectConversation(
  projectId: string,
): Promise<Array<{ role: string; content: string }>> {
  const rows = await prisma.message.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { role: true, content: true },
  });
  return rows.reverse().map((row) => ({ role: row.role, content: row.content }));
}

function existingSpecification(
  row: { data: string } | null | undefined,
): WebsiteSpecification | null {
  if (!row) return null;
  try {
    return parseWebsiteSpecification(JSON.parse(row.data));
  } catch {
    return null;
  }
}

/**
 * A stored specification is stale when the product summary changed, the
 * approved page plan no longer matches the current requirements, or the client
 * edited the brief after the spec was built - regenerating keeps the spec (and
 * therefore the generation context) grounded in both the interview and the
 * brief.
 */
function specificationIsStale(
  spec: WebsiteSpecification | null,
  requirements: Requirements,
  timestamps: { briefUpdatedAt?: Date | null; specUpdatedAt?: Date | null } = {},
): boolean {
  if (!spec) return true;
  if (spec.projectContext.productSummary !== requirements.business.productSummary) return true;
  const planned = pagePlanFor(requirements).pages.map((page) => page.path.toLowerCase()).sort();
  const stored = spec.architecture.pages.map((page) => page.path.toLowerCase()).sort();
  if (planned.join("|") !== stored.join("|")) return true;
  const { briefUpdatedAt, specUpdatedAt } = timestamps;
  if (briefUpdatedAt && specUpdatedAt && briefUpdatedAt.getTime() > specUpdatedAt.getTime()) return true;
  return false;
}

/** Persists derived fields (summary, archetype, page plan) when they changed. */
async function syncDerivedRequirements(
  projectId: string,
  current: Requirements,
): Promise<Requirements> {
  const requirements = refreshDerivedFields(current);
  if (JSON.stringify(requirements) !== JSON.stringify(current)) {
    await saveRequirements(projectId, requirements);
  }
  return requirements;
}

websiteRouter.post(
  "/:id/generate",
  apiHandler(async (req, res) => {
    const input = parseWith(GenerateWebsiteRequestSchema, req.body, "Generate request");
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    // Derived data (product summary, archetype, approved page plan) is
    // refreshed first, so generation is always grounded in the client's
    // current requirements rather than a stale snapshot.
    const base = await syncDerivedRequirements(project.id, requirementsOf(project));
    // GENERATION VIEW: the brief (menus, rooms, contact details, ...) fills
    // every gap the interview left. It is folded only in memory - what gets
    // persisted back is unfolded, so the interview stays the single stored
    // source of truth and deleting brief data can never leave ghosts behind.
    const brief = briefOf(project);
    const requirements = foldBrief(base, brief);
    const extraFacts = briefKnownFacts(brief, requirements);

    // REAL AI PATH. OpenRouter decides the architecture and writes every page.
    // Any provider failure is translated into a specific API error and returned
    // to the client - generation never falls back to fabricated content.
    if (aiIsEnabled()) {
      const specificationVersion = (project.specification?.version ?? 0) + 1;
      const versionNumber = await nextVersionNumber(project.id);
      const assets = await clientAssetsOf(project.id);
      const conversation = await projectConversation(project.id);
      const generated = await runAI(() =>
        generateSiteWithAI(getAIProvider(), {
          project: {
            id: project.id,
            name: project.name,
            businessName: project.businessName,
            websiteType: project.websiteType,
            templateId: project.templateId,
          },
          requirements,
          versionNumber,
          specificationVersion,
          templateId: input.templateId ?? null,
          extraFacts,
          assets,
          conversation,
        }),
      );

      const templateId = resolveTemplateId({
        requested: input.templateId,
        current: project.templateId,
        websiteType: project.websiteType,
        archetype: generated.specification.architecture.archetype,
      });

      const data = JSON.stringify(generated.specification);
      await prisma.websiteSpecification.upsert({
        where: { projectId: project.id },
        create: { projectId: project.id, data, version: specificationVersion },
        update: { data, version: specificationVersion },
      });
      // The model's plan/summary become the project's stored requirements, so
      // the preview panel and the next generation agree with what was built.
      // Unfolding first strips the transient brief values: only what the
      // interview itself owns is persisted.
      await saveRequirements(project.id, unfoldBrief(generated.requirements, base));
      await recordActivity(
        project.id,
        "specification_generated",
        `Specification v${specificationVersion} generated with ${generated.report.model}`,
      );

      // Real uploads become real images: fill every empty image slot from this
      // project's assets (hero, gallery, products, team, logo).
      const document = await hydrateProjectDocument(project, generated.document);
      const exported = exportSite(document, {
        projectName: project.slug,
        siteUrl: env.publicBaseUrl,
      });
      const body: GenerateWebsiteResponseDto = await persistSite({
        project,
        document,
        specification: generated.specification,
        files: exported.files,
        changeDescription:
          input.notes?.trim() ||
          `Generated ${generated.document.siteName} with ${generated.report.model}`,
        activityType: "website_generated",
        templateId,
        source: "generation",
      });
      res.json(body);
      return;
    }

    let specification = existingSpecification(project.specification);
    if (
      !specification ||
      input.regenerateSpecification ||
      specificationIsStale(specification, requirements, {
        briefUpdatedAt: project.brief?.updatedAt ?? null,
        specUpdatedAt: project.specification?.updatedAt ?? null,
      })
    ) {
      const version = (project.specification?.version ?? 0) + 1;
      specification = buildSpecification({
        siteName: project.businessName || project.name,
        websiteType: project.websiteType,
        requirements,
        provider: env.aiProvider,
        version,
        extraFacts,
      });
      const data = JSON.stringify(specification);
      await prisma.websiteSpecification.upsert({
        where: { projectId: project.id },
        create: { projectId: project.id, data, version },
        update: { data, version },
      });
      await recordActivity(project.id, "specification_generated", `Specification v${version} generated`);
    }

    // `resolveTemplateId` below uses the classified archetype when the project
    // has no template of its own, so a healthcare platform never renders with
    // a shop template.
    const templateId = resolveTemplateId({
      requested: input.templateId,
      current: project.templateId,
      websiteType: project.websiteType,
      archetype: specification.architecture.archetype,
    });
    const versionNumber = await nextVersionNumber(project.id);
    const built = buildDocument({
      project,
      requirements,
      specification,
      versionNumber,
      provider: env.aiProvider,
      templateId: input.templateId,
    });
    const document = await hydrateProjectDocument(project, built);
    const exported = exportSite(document, { projectName: project.slug, siteUrl: env.publicBaseUrl });

    const body: GenerateWebsiteResponseDto = await persistSite({
      project,
      document,
      specification,
      files: exported.files,
      changeDescription: input.notes?.trim() || `Generated ${document.siteName} from the ${templateId} template`,
      activityType: "website_generated",
      templateId,
      source: "generation",
    });
    res.json(body);
  }),
);

websiteRouter.post(
  "/:id/modify",
  apiHandler(async (req, res) => {
    const input = parseWith(ModifyWebsiteRequestSchema, req.body, "Modify request");
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const before = documentOf(project);
    if (!before) throw ApiError.badRequest("Generate the website before modifying it.");

    const current = await syncDerivedRequirements(project.id, requirementsOf(project));
    let merged = RequirementsSchema.parse(
      mergeRequirements(current, extractRequirementsFromText(input.instruction, current)),
    );
    let correctionInstruction = input.instruction;
    // REAL AI EXTRACTION: free-form instructions ("make the shop warmer and
    // add a product called ...") become the same structured requirement patch
    // the chat path uses. The brief is folded in so the model knows which facts
    // already exist and never invents replacements.
    if (aiIsEnabled()) {
      const brief = briefOf(project);
      const view = foldBrief(current, brief);
      const knowledge = buildProjectKnowledge(view, {
        projectId: project.id,
        extraFacts: briefKnownFacts(brief, view),
      });
      const conversation = await projectConversation(project.id);
      const update = await runAI(() =>
        extractRequirements(
          getAIProvider(),
          {
            projectId: project.id,
            siteName: project.businessName || project.name,
            websiteType: project.websiteType,
            knowledge,
          },
          input.instruction,
          conversation,
        ),
      );
      merged = RequirementsSchema.parse(
        mergeRequirements(merged, requirementUpdateToPatch(update, merged)),
      );
      correctionInstruction = `${input.instruction} ${removalSentences(update.removals)}`.trim();
    }
    // Corrections in the instruction ("don't sell hoodies anymore") win over
    // stored information before the architecture is recomputed.
    const requirements = applyClientCorrections(merged, correctionInstruction);
    // The modified requirements go through the same derivation as chat, so an
    // instruction like "add a pricing page" updates the approved architecture.
    const derived = await syncDerivedRequirements(project.id, requirements);
    // GENERATION VIEW: the brief fills what the interview left open (menus,
    // contact details, photos). Only `derived` was persisted above.
    const brief = briefOf(project);
    const folded = foldBrief(derived, brief);
    const extraFacts = briefKnownFacts(brief, folded);

    let templateId = resolveTemplateId({
      requested: null,
      current: project.templateId,
      websiteType: project.websiteType,
      archetype: pagePlanFor(folded).archetype,
    });
    const versionNumber = await nextVersionNumber(project.id);
    const specificationVersion = (project.specification?.version ?? 0) + 1;
    let specification = buildSpecification({
      siteName: project.businessName || project.name,
      websiteType: project.websiteType,
      requirements: folded,
      provider: env.aiProvider,
      version: specificationVersion,
      extraFacts,
    });
    let after = buildDocument({
      project,
      requirements: folded,
      specification,
      versionNumber,
      provider: env.aiProvider,
      templateId,
    });

    // REAL AI PATH: the change request is applied by regenerating page content
    // through OpenRouter from the corrected requirements.
    let aiRequirements: Requirements | null = null;
    if (aiIsEnabled()) {
      const assets = await clientAssetsOf(project.id);
      const conversation = await projectConversation(project.id);
      const generated = await runAI(() =>
        generateSiteWithAI(getAIProvider(), {
          project: {
            id: project.id,
            name: project.name,
            businessName: project.businessName,
            websiteType: project.websiteType,
            templateId: project.templateId,
          },
          requirements: folded,
          versionNumber,
          specificationVersion,
          templateId,
          extraFacts,
          assets,
          // The instruction is the latest explicit client correction and has
          // priority over every earlier requirement.
          conversation: [...conversation, { role: "user", content: input.instruction }],
        }),
      );
      specification = generated.specification;
      after = generated.document;
      aiRequirements = generated.requirements;
      // The AI plan may classify a different archetype than the stored one;
      // resolve the template from the architecture actually generated.
      templateId = resolveTemplateId({
        requested: null,
        current: project.templateId,
        websiteType: project.websiteType,
        archetype: specification.architecture.archetype,
      });
    }
    // Keep the stored specification and the AI-approved plan in step with the
    // document that is actually persisted, exactly as initial generation does.
    await prisma.websiteSpecification.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, data: JSON.stringify(specification), version: specificationVersion },
      update: { data: JSON.stringify(specification), version: specificationVersion },
    });
    if (aiRequirements) {
      await saveRequirements(project.id, unfoldBrief(aiRequirements, derived));
    }
    // Client uploads fill every empty image slot before the document persists.
    after = await hydrateProjectDocument(project, after);
    const diff = diffDocuments(before, after);
    const exported = exportSite(after, { projectName: project.slug, siteUrl: env.publicBaseUrl });
    const instruction = input.instruction.trim();

    // Safety check: verify the modified document belongs to this project.
    verifyDocumentIsolation(project, after);

    const generated = await persistSite({
      project,
      document: after,
      specification,
      files: exported.files,
      changeDescription: `Modified: ${instruction.length > 120 ? `${instruction.slice(0, 117)}...` : instruction}`,
      activityType: "website_modified",
      templateId,
      source: "modification",
    });

    const body: ModifyWebsiteResponseDto = {
      version: generated.version,
      document: generated.document,
      changeSummary: diff.changeSummary,
      affectedSections: diff.affectedSections,
      message: generated.message,
    };
    res.json(body);
  }),
);

websiteRouter.get(
  "/:id/preview",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const document = documentOf(project);
    if (!document) throw ApiError.badRequest("Generate the website to see a preview.");

    // Safety check: verify the document belongs to this project before rendering.
    verifyDocumentIsolation(project, document);

    const requested = typeof req.query.page === "string" ? req.query.page : "";
    const preview: PreviewResponseDto = renderPreview(document, requested || "/", {
      siteUrl: env.publicBaseUrl,
    });
    res.json(preview);
  }),
);

websiteRouter.get(
  "/:id/export",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const document = documentOf(project);
    if (!document) throw ApiError.badRequest("Generate the website before exporting it.");

    // Safety check: verify the document belongs to this project before exporting.
    verifyDocumentIsolation(project, document);

    const body: ExportResponseDto = exportSite(document, {
      projectName: project.slug,
      siteUrl: env.publicBaseUrl,
    });
    await recordActivity(project.id, "export", `Exported ${body.files.length} files`);
    res.json(body);
  }),
);

websiteRouter.post(
  "/:id/publish",
  apiHandler(async (req, res) => {
    const input = parseWith(PublishRequestSchema, req.body, "Publish request");
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const document = documentOf(project);
    if (!document) throw ApiError.badRequest("Generate the website before publishing it.");

    // Safety check: verify the document belongs to this project before publishing.
    verifyDocumentIsolation(project, document);

    const result = await publishProject(project, document, input.provider ?? "local");
    const body: PublishResponseDto = {
      deployment: result.deployment,
      projectStatus: "PUBLISHED",
      publishedPages: document.pages.map((page) => ({ path: page.path, title: page.title })),
    };
    res.json(body);
  }),
);

websiteRouter.get(
  "/:id/versions",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    res.json(project.versions.map((version) => toVersionDto(version, project.currentVersionId)));
  }),
);

websiteRouter.post(
  "/:id/versions/:versionNumber/restore",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "", currentUserId(req));
    const versionNumber = Number(req.params.versionNumber);
    const snapshot = await prisma.websiteVersion.findFirst({
      where: { projectId: project.id, versionNumber },
    });
    if (!snapshot) throw ApiError.notFound(`Version ${versionNumber} was not found`);

    const document = SiteDocumentSchema.parse(JSON.parse(snapshot.document));
    const specification = snapshot.specification
      ? parseWebsiteSpecification(JSON.parse(snapshot.specification))
      : null;
    const restoredVersion = await nextVersionNumber(project.id);
    document.meta.versionNumber = restoredVersion;
    document.meta.generatedAt = new Date().toISOString();
    // An old snapshot may reference assets deleted since; hydration clears
    // those refs and re-applies the client's current images.
    const hydrated = await hydrateProjectDocument(project, document);

    const exported = exportSite(hydrated, { projectName: project.slug, siteUrl: env.publicBaseUrl });
    const generated = await persistSite({
      project,
      document: hydrated,
      specification,
      files: exported.files,
      changeDescription: `Restored from version ${snapshot.versionNumber}`,
      activityType: "version_restored",
      templateId: project.templateId,
      source: "restore",
    });

    const body: RestoreVersionResponseDto = {
      version: generated.version,
      document: generated.document,
      restoredFrom: snapshot.versionNumber,
      fileCount: exported.files.length,
    };
    res.json(body);
  }),
);
