/**
 * Requirements + specification routes: read/merge/analyze requirements and
 * generate (or read) the structured website specification.
 */
import { Router } from "express";
import { z } from "zod";
import {
  RequirementsSchema,
  applyAnswer,
  applyClientCorrections,
  computeCompleteness,
  deriveProductSummary,
  extractRequirementsFromText,
  mergeRequirements,
  summarizeSpecification,
  type AnalyzeRequirementsResponseDto,
  type GenerateSpecificationResponseDto,
} from "@luvify/shared";
import { apiHandler, parseWith } from "../errors";
import { env } from "../env";
import { buildSpecification, refreshDerivedFields } from "../generate";
import { prisma } from "../prisma";
import { loadProject, recordActivity, requirementsOf, saveRequirements, toCompletenessDto } from "../store";

export const projectInsightsRouter = Router({ mergeParams: true });

const AnalyzeRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  questionId: z.string().trim().max(80).optional(),
  mapsTo: z.string().trim().max(80).optional(),
  optionLabels: z.array(z.string().max(120)).max(12).optional(),
});

projectInsightsRouter.get(
  "/:id/requirements",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const requirements = requirementsOf(project);
    res.json({ requirements, completeness: toCompletenessDto(computeCompleteness(requirements)) });
  }),
);

projectInsightsRouter.put(
  "/:id/requirements",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const patch = parseWith(z.record(z.string(), z.unknown()), req.body, "Requirements patch");
    const merged = mergeRequirements(requirementsOf(project), patch as Parameters<typeof mergeRequirements>[1]);
    const parsed = RequirementsSchema.parse(merged);
    // A hand-edited summary or page plan is authoritative: only re-derive the
    // parts the caller did not supply.
    const business = (patch.business as Record<string, unknown> | undefined) ?? {};
    const website = (patch.website as Record<string, unknown> | undefined) ?? {};
    const requirements = refreshDerivedFields(parsed, {
      keepSummary: typeof business.productSummary === "string",
      keepPlan: Array.isArray(website.pagePlan) && website.pagePlan.length > 0,
    });
    const { report } = await saveRequirements(project.id, requirements);
    await recordActivity(project.id, "requirements_updated", `Requirements updated (${report.overall}% complete)`);
    const body: AnalyzeRequirementsResponseDto = {
      requirements,
      completeness: toCompletenessDto(report),
      updatedFields: Object.keys(patch),
    };
    res.json(body);
  }),
);

projectInsightsRouter.post(
  "/:id/requirements/analyze",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const input = parseWith(AnalyzeRequestSchema, req.body, "Analyze request");
    const current = requirementsOf(project);

    let patch = extractRequirementsFromText(input.text, current);
    if (input.questionId || input.mapsTo) {
      patch = {
        ...patch,
        ...applyAnswer(current, {
          ...(input.questionId ? { questionId: input.questionId } : {}),
          ...(input.mapsTo ? { mapsTo: input.mapsTo } : {}),
          text: input.text,
          ...(input.optionLabels ? { optionLabels: input.optionLabels } : {}),
        }),
      };
    }

    const requirements = applyClientCorrections(
      RequirementsSchema.parse(mergeRequirements(current, patch)),
      input.text,
    );
    // Keep the summary + architecture in step with manual requirement edits.
    const withDerived = refreshDerivedFields(requirements);
    const { report } = await saveRequirements(project.id, withDerived);
    const body: AnalyzeRequirementsResponseDto = {
      requirements: withDerived,
      completeness: toCompletenessDto(report),
      updatedFields: Object.keys(patch),
    };
    res.json(body);
  }),
);

projectInsightsRouter.get(
  "/:id/specification",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const specification = project.specification
      ? JSON.parse(project.specification.data) as Parameters<typeof summarizeSpecification>[0]
      : null;
    res.json({
      specification,
      version: project.specification?.version ?? 0,
      summary: specification ? summarizeSpecification(specification) : "",
    });
  }),
);

projectInsightsRouter.post(
  "/:id/specification/generate",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const requirements = requirementsOf(project);
    const version = (project.specification?.version ?? 0) + 1;
    const specification = buildSpecification({
      siteName: project.businessName || project.name,
      websiteType: project.websiteType,
      requirements,
      provider: env.aiProvider,
      version,
    });
    const data = JSON.stringify(specification);
    await prisma.websiteSpecification.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, data, version },
      update: { data, version },
    });
    await recordActivity(project.id, "specification_generated", `Specification v${version} generated`);
    const body: GenerateSpecificationResponseDto = {
      specification,
      version,
      summary: summarizeSpecification(specification),
    };
    res.json(body);
  }),
);
