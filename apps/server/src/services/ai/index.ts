/**
 * Public surface of the AI layer.
 *
 * Routes import from here and never construct a provider themselves, so the
 * OpenRouter call site stays in one place and is impossible to duplicate.
 */

import { env } from "../../env";
import { readAIConfig, usesRealProvider } from "./config";
import { AIError, aiToApiError } from "./errors";
import { OllamaProvider } from "./ollama";
import { OpenRouterProvider } from "./openrouter";
import type { AIProvider } from "./provider";

let cached: { provider: AIProvider; signature: string } | null = null;

/** True when generation should call a real model rather than the offline fixture. */
export function aiIsEnabled(): boolean {
  return usesRealProvider(env.aiProvider);
}

/**
 * The configured provider. Throws `not_configured` when the offline fixture is
 * selected - there is no path where a missing/failed real provider degrades
 * into fabricated output.
 *
 * The provider is chosen purely from `AI_PROVIDER`, so switching between
 * OpenRouter and Ollama is an `.env` edit - never a code change.
 */
export function getAIProvider(): AIProvider {
  const config = readAIConfig();
  if (!usesRealProvider(config.provider)) {
    throw new AIError(
      "not_configured",
      `The AI layer needs a real provider but AI_PROVIDER="${config.provider}". ` +
        `Set AI_PROVIDER=openrouter or AI_PROVIDER=ollama to generate websites.`,
    );
  }

  // Rebuild if the provider, model, endpoint or key presence changed, so
  // config edits take effect without restarting the whole server.
  const signature = [
    config.provider,
    config.model,
    config.baseUrl,
    config.apiKey.length,
    config.reasoningEffort ?? "",
  ].join("|");
  if (cached && cached.signature === signature) return cached.provider;

  const provider = config.provider === "ollama" ? new OllamaProvider(config) : new OpenRouterProvider(config);
  cached = { provider, signature };
  return provider;
}

export { readAIConfig, reportAIConfiguration, usesRealProvider } from "./config";
export { aiToApiError, AIError } from "./errors";
export { applyPageCopy } from "./apply";
export { requirementUpdateToPatch, removalSentences } from "./patch";
export { generateSiteWithAI } from "./generation";
export type { AIPipelineInput, AIPipelineResult } from "./generation";
export { extractRequirements, planArchitecture, generatePageCopy, validatePageCopy, composeChatReply } from "./operations";
export type { AIProjectContext } from "./operations";
export { getAIStatus, logAIStatus } from "./status";
export type { AIStatus } from "./status";
export { OllamaProvider } from "./ollama";
export { OpenRouterProvider } from "./openrouter";
export type { AIProvider } from "./provider";
export type { ArchitecturePlan, ContentValidation, PageCopy, RequirementUpdate } from "./schemas";

/**
 * Runs an AI task, translating any `AIError` into the HTTP error contract.
 * Non-AI errors are re-thrown untouched so real bugs stay 500s.
 */
export async function runAI<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw aiToApiError(error);
  }
}
