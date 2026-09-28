/**
 * The AI operations that power Luvify's pipeline.
 *
 *   requirement_extraction -> architecture_plan -> page_content -> content_validation
 *
 * One structured call per step: the pipeline is never a single request that
 * blindly emits a whole website. Every function receives an explicit project
 * context, so a call can only ever see one project's data.
 */

import type { ProjectKnowledge } from "@luvify/shared";
import { completeStructured } from "./json";
import type { AIProvider } from "./provider";
import { architecturePrompt, chatReplyPrompt, contentValidationPrompt, pageCopyPrompt, requirementExtractionPrompt } from "./prompts";
import {
  ArchitecturePlanSchema,
  ContentValidationSchema,
  PageCopySchema,
  RequirementUpdateSchema,
  type ArchitecturePlan,
  type ContentValidation,
  type PageCopy,
  type RequirementUpdate,
} from "./schemas";

/** The single project an AI call is scoped to. */
export interface AIProjectContext {
  projectId: string;
  siteName: string;
  websiteType: string;
  knowledge: ProjectKnowledge;
}

/** Step 1 - turn a client message into a structured requirements patch. */
export async function extractRequirements(
  provider: AIProvider,
  context: AIProjectContext,
  message: string,
  history: Array<{ role: string; content: string }>,
): Promise<RequirementUpdate> {
  const prompt = requirementExtractionPrompt(
    { siteName: context.siteName, websiteType: context.websiteType, knowledge: context.knowledge },
    message,
    history,
  );
  const result = await completeStructured(provider, {
    operation: "requirement_extraction",
    projectId: context.projectId,
    system: prompt.system,
    user: prompt.user,
    schema: RequirementUpdateSchema,
    temperature: 0.2,
  });
  return result.data;
}

/** Step 2 - decide the site's architecture from this project's requirements. */
export async function planArchitecture(
  provider: AIProvider,
  context: AIProjectContext,
  requirements: {
    features: string[];
    requiredPages: string[];
    primaryGoal: string;
    conversionAction: string;
  },
): Promise<ArchitecturePlan> {
  const prompt = architecturePrompt({
    siteName: context.siteName,
    websiteType: context.websiteType,
    knowledge: context.knowledge,
    features: requirements.features,
    requiredPages: requirements.requiredPages,
    primaryGoal: requirements.primaryGoal,
    conversionAction: requirements.conversionAction,
  });
  const result = await completeStructured(provider, {
    operation: "architecture_plan",
    projectId: context.projectId,
    system: prompt.system,
    user: prompt.user,
    schema: ArchitecturePlanSchema,
    temperature: 0.3,
    // A plan without a home page would ship a site with no root index.html.
    refine: (plan) => (plan.pages.some((page) => page.path.trim() === "/") ? null : "no page has path \"/\" - the home page is required"),
  });
  return result.data;
}

/** Step 3 - write one page's copy, using only that page's section list. */
export async function generatePageCopy(
  provider: AIProvider,
  context: AIProjectContext,
  input: {
    architecture: { archetype: string; pages: Array<{ name: string; path: string; purpose: string }> };
    page: {
      name: string;
      path: string;
      purpose: string;
      contentRequirements: string[];
      sectionTypes: string[];
    };
  },
): Promise<PageCopy> {
  const prompt = pageCopyPrompt({
    siteName: context.siteName,
    websiteType: context.websiteType,
    knowledge: context.knowledge,
    architecture: input.architecture,
    page: input.page,
  });
  const result = await completeStructured(provider, {
    operation: "page_content",
    projectId: context.projectId,
    system: prompt.system,
    user: prompt.user,
    schema: PageCopySchema,
    temperature: 0.7,
  });
  return result.data;
}

/** Step 4 - audit the generated copy before it is persisted. */
export async function validatePageCopy(
  provider: AIProvider,
  context: AIProjectContext,
  page: { name: string; path: string; purpose: string },
  copy: PageCopy,
): Promise<ContentValidation> {
  const prompt = contentValidationPrompt({
    siteName: context.siteName,
    websiteType: context.websiteType,
    knowledge: context.knowledge,
    page,
    copy,
  });
  const result = await completeStructured(provider, {
    operation: "content_validation",
    projectId: context.projectId,
    system: prompt.system,
    user: prompt.user,
    schema: ContentValidationSchema,
    temperature: 0,
  });
  return result.data;
}

/** Chat reply grounded in the project's own knowledge (plain text, not JSON). */
export async function composeChatReply(
  provider: AIProvider,
  context: AIProjectContext,
  input: { userMessage: string; acknowledged: string[]; nextQuestion: string },
): Promise<string> {
  const prompt = chatReplyPrompt({
    siteName: context.siteName,
    websiteType: context.websiteType,
    knowledge: context.knowledge,
    userMessage: input.userMessage,
    acknowledged: input.acknowledged,
    nextQuestion: input.nextQuestion,
  });
  const completion = await provider.complete({
    operation: "chat_reply",
    projectId: context.projectId,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: 0.6,
    maxTokens: 400,
  });
  return completion.text.trim();
}
