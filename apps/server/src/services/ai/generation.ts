/**
 * The real, OpenRouter-powered generation pipeline.
 *
 *   requirements -> AI architecture -> specification -> skeleton document
 *     -> per-page AI copy -> AI content validation -> grounding validation
 *     -> SiteDocument (ready for the database and the renderer)
 *
 * The structural skeleton still comes from the template registry, so the model
 * can never invent a component schema: it only supplies copy for sections the
 * renderer already supports. Every step is scoped to one project.
 */

import {
  RequirementsSchema,
  buildProjectKnowledge,
  mergeRequirements,
  validateDocument,
  type ProjectKnowledge,
  type Requirements,
  type SiteDocument,
  type WebsiteSpecification,
} from "@luvify/shared";
import { applyPageCopy } from "./apply";
import { buildDocument, buildSpecification } from "../../generate";
import { AIError } from "./errors";
import { logAI } from "./logger";
import { generatePageCopy, planArchitecture, validatePageCopy, type AIProjectContext } from "./operations";
import type { AIProvider } from "./provider";

export interface AIPipelineInput {
  project: {
    id: string;
    name: string;
    businessName: string;
    websiteType: string;
    templateId: string | null;
  };
  requirements: Requirements;
  versionNumber: number;
  specificationVersion: number;
  templateId?: string | null | undefined;
}

export interface AIPipelineResult {
  document: SiteDocument;
  specification: WebsiteSpecification;
  requirements: Requirements;
  /** Which pages the model wrote, and which needed a regeneration pass. */
  report: {
    pagesGenerated: string[];
    regenerated: string[];
    model: string;
  };
}

/** Raised when a page cannot be made relevant/grounded after one retry. */
function rejectPage(path: string, issues: string[]): AIError {
  return new AIError(
    "invalid_output",
    `Generated content for "${path}" failed content validation and was not saved. ${
      issues.slice(0, 3).join("; ") || "no reason given"
    }`,
    { retryable: true, detail: { page: path, issues } },
  );
}

export async function generateSiteWithAI(
  provider: AIProvider,
  input: AIPipelineInput,
): Promise<AIPipelineResult> {
  const { project } = input;
  const siteName = project.businessName || project.name;

  // ---- Step 1: project knowledge (scoped to this project, always) ----------
  const baseKnowledge = buildProjectKnowledge(input.requirements, {
    projectId: project.id,
    archetype: input.requirements.website.archetype,
  });

  const context: AIProjectContext = {
    projectId: project.id,
    siteName,
    websiteType: project.websiteType,
    knowledge: baseKnowledge,
  };

  logAI("pipeline_start", {
    operation: "specification",
    projectId: project.id,
    provider: provider.name,
    model: provider.model,
    websiteType: project.websiteType,
  });

  // ---- Step 2: the model decides this project's architecture --------------
  const plan = await planArchitecture(provider, context, {
    features: Object.entries(input.requirements.features)
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name),
    requiredPages: input.requirements.website.requiredPages,
    primaryGoal: input.requirements.website.primaryGoal,
    conversionAction: input.requirements.website.conversionAction,
  });

  // The approved plan is folded back into requirements so the specification,
  // the preview panel and later regenerations all agree with it.
  const requirements = RequirementsSchema.parse(
    mergeRequirements(input.requirements, {
      business: {
        productSummary: input.requirements.business.productSummary || plan.businessSummary,
      },
      website: {
        archetype: plan.archetype,
        pagePlan: plan.pages.map((page) => ({
          name: page.name,
          path: page.path,
          purpose: page.purpose,
        })),
        userJourneys: plan.userJourneys.map((journey) => ({
          goal: journey.goal,
          steps: journey.steps,
        })),
      },
    } as Partial<Requirements>),
  );

  // Rebuild knowledge so it carries the final archetype, plan and projectId.
  const knowledge: ProjectKnowledge = buildProjectKnowledge(requirements, {
    projectId: project.id,
    archetype: plan.archetype,
    requiredPages: plan.pages.map((page) => page.name),
    userJourneys: plan.userJourneys.map((journey) => ({ goal: journey.goal, steps: journey.steps })),
  });
  context.knowledge = knowledge;

  // ---- Step 3: specification ----------------------------------------------
  const specification = buildSpecification({
    siteName,
    websiteType: project.websiteType,
    requirements,
    provider: provider.name,
    version: input.specificationVersion,
  });

  // ---- Step 4: renderer-valid skeleton, then AI copy per page -------------
  const skeleton = buildDocument({
    project: {
      name: project.name,
      businessName: project.businessName,
      websiteType: project.websiteType,
      templateId: project.templateId,
    },
    requirements,
    specification,
    versionNumber: input.versionNumber,
    provider: provider.name,
    // `buildDocument` expects undefined (not null) when no template is pinned.
    templateId: input.templateId ?? undefined,
  });

  return writePages(provider, context, {
    skeleton,
    requirements,
    specification,
    knowledge,
    projectId: project.id,
  });
}

interface WritePagesInput {
  skeleton: SiteDocument;
  requirements: Requirements;
  specification: WebsiteSpecification;
  knowledge: ProjectKnowledge;
  projectId: string;
}

/**
 * Generates each page independently with page-specific context, validates it
 * and applies it to the skeleton. A page that cannot pass validation after one
 * regeneration aborts the whole generation - unrelated content is never saved.
 */
async function writePages(
  provider: AIProvider,
  context: AIProjectContext,
  input: WritePagesInput,
): Promise<AIPipelineResult> {
  const pagesGenerated: string[] = [];
  const regenerated: string[] = [];
  let document = input.skeleton;

  for (const page of input.skeleton.pages) {
    const planned =
      input.specification.architecture.pages.find((entry) => entry.path === page.path) ??
      input.specification.pages.find((entry) => entry.path === page.path);

    const pageInput = {
      architecture: {
        archetype: input.specification.architecture.archetype,
        pages: input.specification.architecture.pages.map((entry) => ({
          name: entry.name,
          path: entry.path,
          purpose: entry.purpose,
        })),
      },
      page: {
        name: page.name,
        path: page.path,
        purpose: planned?.purpose ?? "",
        contentRequirements: planned?.contentPlan.doList ?? [],
        // Only this page's sections, so every page gets its own prompt rather
        // than one generic template.
        sectionTypes: page.sections.map((section) => section.type),
      },
    };

    const target = { name: page.name, path: page.path, purpose: pageInput.page.purpose };

    let copy = await generatePageCopy(provider, context, pageInput);
    let verdict = await validatePageCopy(provider, context, target, copy);

    if (!passesValidation(verdict)) {
      logAI("page_regenerate", {
        operation: "content_validation",
        projectId: input.projectId,
        provider: provider.name,
        model: provider.model,
        page: page.path,
        relevanceScore: verdict.relevanceScore,
        issues: verdict.issues.slice(0, 3),
      });
      regenerated.push(page.path);
      copy = await generatePageCopy(provider, context, pageInput);
      verdict = await validatePageCopy(provider, context, target, copy);

      // Still unacceptable after one retry: fail loudly instead of shipping
      // content that does not belong to this project.
      if (!passesValidation(verdict)) {
        throw rejectPage(page.path, [
          verdict.reason,
          ...verdict.unrelatedContent,
          ...verdict.unsupportedFacts,
          ...verdict.issues,
        ]);
      }
    }

    document = {
      ...document,
      pages: document.pages.map((entry) =>
        entry.path === page.path
          ? applyPageCopy(entry, copy, { navigation: document.navigation, knowledge: input.knowledge })
          : entry,
      ),
    };
    pagesGenerated.push(page.path);
  }

  // ---- Final grounding pass: strip any remaining unsupported claim ---------
  const validated = validateDocument(document, input.knowledge);
  document = validated.document;

  logAI("pipeline_complete", {
    operation: "specification",
    projectId: input.projectId,
    provider: provider.name,
    model: provider.model,
    pages: pagesGenerated.length,
    regenerated: regenerated.length,
    qualityScore: validated.report.qualityScore,
  });

  return {
    document,
    specification: input.specification,
    requirements: input.requirements,
    report: { pagesGenerated, regenerated, model: provider.model },
  };
}

/** Accept only copy that is on-topic for this page and reasonably relevant. */
function passesValidation(result: { relevant: boolean; verdict: string; relevanceScore: number }): boolean {
  return result.relevant && result.verdict !== "reject" && result.relevanceScore >= 50;
}

