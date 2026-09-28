/**
 * Conversation routes: read the transcript and run the deterministic mock
 * interview loop. `POST /chat` and `POST /messages` both answer with the full
 * `ChatResponseDto` so the client never has to reconcile two shapes.
 */

import { Router } from "express";
import {
  ChatRequestSchema,
  PostMessageRequestSchema,
  RequirementsSchema,
  applyAnswer,
  applyClientCorrections,
  archetypeLabel,
  buildProjectKnowledge,
  computeCompleteness,
  deriveProductSummary,
  detectChangeRequest,
  detectOfferings,
  extractRequirementsFromText,
  mergeRequirements,
  type ChatResponseDto,
  type MessagePayload,
} from "@luvify/shared";
import { apiHandler, parseWith } from "../errors";
import { env } from "../env";
import { archetypeFor, pagePlanFor } from "../generate";
import {
  aiIsEnabled,
  composeChatReply,
  extractRequirements,
  getAIProvider,
  removalSentences,
  requirementUpdateToPatch,
  runAI,
} from "../services/ai";
import { completenessSnapshot, nextQuestion } from "../interview";
import { prisma } from "../prisma";
import {
  ensureConversation,
  loadProject,
  requirementsOf,
  saveRequirements,
  toCompletenessDto,
  toMessageDto,
} from "../store";

export const conversationRouter = Router({ mergeParams: true });

/** Scoped to one project explicitly: messages are only ever read for the
 * conversation we just loaded *and* the project from the route params, so a
 * conversation id can never surface another project's transcript. */
async function recentMessages(conversationId: string, projectId: string) {
  const rows = await prisma.message.findMany({
    where: { conversationId, projectId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return rows.map(toMessageDto);
}

conversationRouter.get(
  "/:id/conversation",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const conversation = await ensureConversation(project.id, "REQUIREMENTS", "Requirements");
    const requirements = requirementsOf(project);
    const report = computeCompleteness(requirements);

    let messages = await recentMessages(conversation.id, project.id);
    if (messages.length === 0) {
      const question = nextQuestion(requirements);
      const row = await prisma.message.create({
        data: {
          projectId: project.id,
          conversationId: conversation.id,
          role: "assistant",
          content: question
            ? `Let's get started. ${question.question}`
            : "I have everything I need - generate the specification whenever you're ready.",
          payload: JSON.stringify(payloadFor(report, question)),
        },
      });
      messages = [toMessageDto(row)];
    }

    res.json({
      conversation: { id: conversation.id, kind: conversation.kind, title: conversation.title },
      messages,
      requirements,
      completeness: toCompletenessDto(report),
      status: project.status,
      provider: env.aiProvider,
    });
  }),
);

function payloadFor(
  report: ReturnType<typeof computeCompleteness>,
  question: ReturnType<typeof nextQuestion>,
  updatedFields: string[] = [],
): MessagePayload {
  return {
    kind: question ? "question" : "confirmation",
    questions: question ? [question] : [],
    suggestions: question ? [] : ["Generate specification", "Build the website"],
    bullets: [],
    completeness: completenessSnapshot(report),
    readyForGeneration: report.readyForGeneration,
    requiresConfirmation: false,
    changeSummary: [],
    affectedSections: [],
    provider: env.aiProvider,
    error: "",
    meta: { updatedFields },
  };
}

/** One-line labels for requirement paths, used to acknowledge what changed. */
const FIELD_LABELS: Record<string, string> = {
  "business.name": "your business name",
  "business.description": "your business description",
  "business.industry": "your industry",
  "business.location": "your location",
  "business.targetAudience": "your target audience",
  "business.uniqueSellingPoints": "your selling points",
  "business.valueProposition": "your value proposition",
  "website.purpose": "the site purpose",
  "website.primaryGoal": "your primary goal",
  "website.conversionAction": "the main call to action",
  "website.toneOfVoice": "the tone of voice",
  "website.type": "the website type",
  "branding.brandName": "your brand name",
  "branding.primaryColor": "your primary colour",
  "branding.secondaryColor": "your secondary colour",
  "branding.accentColor": "your accent colour",
  "branding.style": "the visual style",
  "branding.fontPreference": "your fonts",
  "branding.logo": "your logo details",
  "branding.existingAssets": "your existing assets",
  "content.headline": "your headline",
  "content.subheadline": "your subheadline",
  "content.about": "your about copy",
  "content.services": "your services",
  "content.products": "your products",
  "content.testimonials": "your testimonials",
  "content.faq": "your FAQs",
  "content.galleryNotes": "your gallery notes",
  "content.contact": "your contact details",
  "content.contact.email": "your email address",
  "content.contact.phone": "your phone number",
  "content.contact.address": "your address",
  "content.contact.hours": "your opening hours",
  "content.contact.mapUrl": "your map location",
  "content.socials": "your social links",
  "ecommerce.products": "your products",
  "ecommerce.currency": "your currency",
  "ecommerce.paymentProvider": "your payment setup",
  "ecommerce.shipping": "your shipping settings",
  "ecommerce.catalogSize": "your catalog size",
  "ecommerce.variants": "your product variants",
  "technical.domain": "your domain",
  "technical.hosting": "your hosting",
  "technical.seo": "your SEO settings",
  "technical.analytics": "your analytics settings",
  "technical.accessibility": "accessibility notes",
  // Covered by dedicated parts of the reply - never list them as labels.
  "website.requiredPages": "",
  "website.changeRequests": "",
  "website.archetype": "",
  "website.pagePlan": "",
  "website.userJourneys": "",
  "business.offerings": "",
};

function camelWords(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

/** Dotted paths for every requirement key present in an extraction patch. */
function changedPaths(patch: Record<string, unknown>): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of Object.keys(value)) paths.push(`${key}.${nested}`);
    } else {
      paths.push(key);
    }
  }
  return paths;
}

/** Human labels for changed paths; feature booleans collapse into one label. */
function labelsFor(paths: string[]): string[] {
  const labels: string[] = [];
  let featuresSeen = false;
  for (const path of paths) {
    if (path.startsWith("features.")) {
      if (!featuresSeen) {
        featuresSeen = true;
        labels.push("the feature list");
      }
      continue;
    }
    const label = FIELD_LABELS[path] ?? `your ${camelWords(path.split(".").pop() ?? path)}`;
    if (label) labels.push(label);
  }
  return [...new Set(labels)];
}

function joinList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

interface ChatContext {
  projectName: string;
  hasSite: boolean;
  report: ReturnType<typeof computeCompleteness>;
  question: ReturnType<typeof nextQuestion>;
  changedLabels: string[];
  addedPages: string[];
  changeRequest: string | undefined;
  productSummary: string;
  summaryUpdated: boolean;
}

/**
 * Composes the assistant reply from the full context: the project profile,
 * the requirements state, what just changed, the queued change request and the
 * next interview question. This deterministic composition is the mock
 * provider's stand-in for a model call - a real provider would receive this
 * same context together with the recent transcript history.
 */
function composeReply(context: ChatContext): string {
  const parts: string[] = [];

  if (context.summaryUpdated && context.productSummary) {
    parts.push(`Understood - this is ${context.productSummary.charAt(0).toLowerCase()}${context.productSummary.slice(1)}`);
  }
  if (context.addedPages.length > 0) {
    parts.push(`Got it - I've added ${joinList(context.addedPages)} to the page plan.`);
  }
  if (context.changedLabels.length > 0) {
    parts.push(`I've updated ${joinList(context.changedLabels)}.`);
  }
  if (context.changeRequest) {
    parts.push(
      context.hasSite
        ? "I've queued your change request with the project - use Apply change (or regenerate) and it will be picked up."
        : "I've queued your change request with the project - it will be applied when the site is generated.",
    );
  }
  if (parts.length === 0) {
    parts.push("Thanks - noted.");
  }

  if (context.question) {
    parts.push(context.question.question);
  } else if (context.report.readyForGeneration) {
    parts.push(`${context.report.readyMessage} You can generate the specification and the first version of the site now.`);
  } else {
    parts.push(context.report.readyMessage);
  }
  return parts.join(" ");
}

interface ChatInput {
  message?: string | undefined;
  questionId?: string | undefined;
  mapsTo?: string | undefined;
  optionLabels?: string[] | undefined;
  quickReply?: boolean | undefined;
  bootstrap?: boolean | undefined;
}

/** Shared brain for `POST /chat` and `POST /messages`. */
async function runChat(projectId: string, input: ChatInput): Promise<ChatResponseDto> {
  const project = await loadProject(projectId);
  const conversation = await ensureConversation(project.id, "REQUIREMENTS", "Requirements");
  const existing = await recentMessages(conversation.id, project.id);

  let requirements = requirementsOf(project);
  let messages = existing;
  let updatedFields: string[] = [];

  if (input.message && input.message.trim().length > 0) {
    const text = input.message.trim();
    const userRow = await prisma.message.create({
      data: { projectId: project.id, conversationId: conversation.id, role: "user", content: input.message },
    });

    const before = requirements;
    const patch: Record<string, unknown> = {};
    if (input.questionId || input.mapsTo) {
      Object.assign(
        patch,
        applyAnswer(requirements, {
          ...(input.questionId ? { questionId: input.questionId } : {}),
          ...(input.mapsTo ? { mapsTo: input.mapsTo } : {}),
          text: input.message,
          ...(input.optionLabels ? { optionLabels: input.optionLabels } : {}),
        }),
      );
    }
    Object.assign(patch, extractRequirementsFromText(text, requirements));

    // REAL AI PATH: the model extracts the structured requirement update from
    // the client's message, scoped to this project's knowledge only.
    let correctionText = text;
    if (aiIsEnabled()) {
      const knowledge = buildProjectKnowledge(requirements, { projectId: project.id });
      const update = await runAI(() =>
        extractRequirements(
          getAIProvider(),
          {
            projectId: project.id,
            siteName: project.businessName || project.name,
            websiteType: project.websiteType,
            knowledge,
          },
          text,
          existing.map((message) => ({ role: message.role, content: message.content })),
        ),
      );
      Object.assign(patch, requirementUpdateToPatch(update, requirements));
      // Declared removals reuse the existing, tested correction pass.
      correctionText = `${text} ${removalSentences(update.removals)}`.trim();
    }

    // Explicit site-change requests ("change the About page to a darker
    // design") are queued on the requirements so they stay attached to the
    // project and reach the next specification build / modify pass.
    const changeRequest = detectChangeRequest(text);
    if (changeRequest) {
      const website = (patch.website as Record<string, unknown> | undefined) ?? {};
      patch.website = { ...website, changeRequests: [changeRequest] };
    }

    // Maintain the Product/Business Summary from what the client just said,
    // merged with everything already known - descriptions, offerings and the
    // previously maintained summary all feed the derivation.
    const messageOfferings = detectOfferings(text);
    const knownOfferings = [...requirements.business.offerings];
    for (const offering of messageOfferings) {
      if (!knownOfferings.some((entry) => entry.toLowerCase() === offering.toLowerCase())) knownOfferings.push(offering);
    }
    const summaryBefore = requirements.business.productSummary;
    const summaryCandidate = deriveProductSummary({
      businessName: requirements.business.name,
      offerings: knownOfferings,
      description: requirements.business.description,
      previous: summaryBefore,
    });
    if (summaryCandidate && summaryCandidate !== summaryBefore) {
      const business = (patch.business as Record<string, unknown> | undefined) ?? {};
      const mergedOfferings = [
        ...((business.offerings as string[] | undefined) ?? knownOfferings),
      ];
      for (const offering of knownOfferings) {
        if (!mergedOfferings.some((entry) => entry.toLowerCase() === offering.toLowerCase())) mergedOfferings.push(offering);
      }
      patch.business = { ...business, offerings: mergedOfferings, productSummary: summaryCandidate };
    }

    updatedFields = changedPaths(patch);

    requirements = RequirementsSchema.parse(mergeRequirements(requirements, patch));
    // Client corrections override old information: "we don't sell hoodies
    // anymore" removes hoodies from the knowledge base so future generation
    // never mentions them again.
    requirements = applyClientCorrections(requirements, correctionText);

    // Classify the website from the updated requirements and persist the
    // approved page plan, so chat ("add a pricing page", "drop About") keeps
    // evolving the architecture generation must follow.
    const archetype = archetypeFor(requirements);
    const plan = pagePlanFor(requirements);
    requirements = RequirementsSchema.parse(
      mergeRequirements(requirements, {
        website: { archetype, pagePlan: plan.pages, userJourneys: plan.userJourneys },
      } as unknown as Record<string, unknown>),
    );
    await saveRequirements(project.id, requirements);

    const report = computeCompleteness(requirements);
    const question = nextQuestion(requirements);
    const addedPages = requirements.website.requiredPages.filter(
      (name) => !before.website.requiredPages.includes(name),
    );
    const summaryUpdated = requirements.business.productSummary !== before.business.productSummary;
    const acknowledged = labelsFor(updatedFields);
    // REAL AI PATH: the reply is composed by the model from this project's
    // knowledge; the deterministic composer remains the offline fallback path
    // only when the mock provider is explicitly selected.
    const content = aiIsEnabled()
      ? await runAI(() =>
          composeChatReply(
            getAIProvider(),
            {
              projectId: project.id,
              siteName: project.businessName || project.name,
              websiteType: project.websiteType,
              knowledge: buildProjectKnowledge(requirements, { projectId: project.id }),
            },
            {
              userMessage: text,
              acknowledged,
              nextQuestion: question?.question ?? "",
            },
          ),
        )
      : composeReply({
          projectName: project.businessName || project.name,
          hasSite: Boolean(project.website),
          report,
          question,
          changedLabels: acknowledged,
          addedPages,
          changeRequest,
          productSummary: requirements.business.productSummary,
          summaryUpdated,
        });

    const assistantRow = await prisma.message.create({
      data: {
        projectId: project.id,
        conversationId: conversation.id,
        role: "assistant",
        content,
        payload: JSON.stringify(payloadFor(report, question, updatedFields)),
      },
    });
    messages = [...existing, toMessageDto(userRow), toMessageDto(assistantRow)];
  } else if (existing.length === 0) {
    const report = computeCompleteness(requirements);
    const question = nextQuestion(requirements);
    const row = await prisma.message.create({
      data: {
        projectId: project.id,
        conversationId: conversation.id,
        role: "assistant",
        content: question
          ? `Hi! Let's gather the details for ${project.name}. ${question.question}`
          : `Welcome back. ${report.readyMessage}`,
        payload: JSON.stringify(payloadFor(report, question)),
      },
    });
    messages = [toMessageDto(row)];
  }

  const report = computeCompleteness(requirements);
  return {
    messages,
    requirements,
    completeness: toCompletenessDto(report),
    status: project.status,
    provider: env.aiProvider,
  };
}

conversationRouter.post(
  "/:id/chat",
  apiHandler(async (req, res) => {
    const input = parseWith(ChatRequestSchema, req.body, "Chat request");
    res.json(await runChat(req.params.id ?? "", input));
  }),
);

conversationRouter.post(
  "/:id/messages",
  apiHandler(async (req, res) => {
    const input = parseWith(PostMessageRequestSchema, req.body, "Message request");
    // The message DTO carries the text as `content`; `runChat` consumes `message`.
    res.json(await runChat(req.params.id ?? "", { ...input, message: input.content }));
  }),
);
