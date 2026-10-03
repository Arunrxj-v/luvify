/**
 * AI configuration - the single place the rest of the server reads provider
 * settings from.
 *
 * The active provider's key (`GOOGLE_GENERATIVE_AI_API_KEY` for Gemini,
 * `OPENROUTER_API_KEY` for OpenRouter) is read from `process.env` here and
 * handed straight to the provider's auth header. It is never returned by an
 * API route, never embedded in a generated site and never prefixed with
 * `VITE_`, so the web bundle cannot contain it.
 */

import { env } from "../../env";
import { AIError } from "./errors";
import { logAIConfig } from "./logger";

export interface AIConfig {
  provider: string;
  apiKey: string;
  model: string;
  /**
   * Optional fallback model (Gemini only): when the primary model exhausts its
   * retries on a TRANSIENT failure, one extra retry cycle runs the exact same
   * request (prompts, JSON mode, temperature) against this model. Omitted for
   * providers without a fallback, and never used for auth/invalid-request errors.
   */
  fallbackModel?: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  maxTokens: number;
  /** OpenRouter attribution headers (optional, but recommended by the API). */
  appUrl: string;
  appTitle: string;
}

/** `openrouter` and `gemini` perform real network calls; anything else is the offline fixture. */
export function usesRealProvider(provider: string): boolean {
  return provider === "openrouter" || provider === "gemini";
}

/** The env var that must hold the key for the active provider. Never its value. */
function apiKeyVar(provider: string): string {
  return provider === "gemini" ? "GOOGLE_GENERATIVE_AI_API_KEY" : "OPENROUTER_API_KEY";
}

export function readAIConfig(): AIConfig {
  // Gemini settings win when Gemini is the active provider; OpenRouter keeps
  // its own values otherwise, so both providers can be configured at once.
  if (env.aiProvider === "gemini") {
    return {
      provider: env.aiProvider,
      apiKey: env.geminiApiKey,
      model: env.geminiModel,
      fallbackModel: env.geminiFallbackModel,
      baseUrl: env.geminiBaseUrl,
      timeoutMs: env.geminiTimeoutMs,
      maxRetries: env.geminiMaxRetries,
      temperature: env.aiTemperature,
      maxTokens: env.aiMaxTokens,
      appUrl: env.publicBaseUrl,
      appTitle: env.openrouterAppTitle,
    };
  }
  return {
    provider: env.aiProvider,
    apiKey: env.openrouterApiKey,
    model: env.openrouterModel,
    baseUrl: env.openrouterBaseUrl,
    timeoutMs: env.openrouterTimeoutMs,
    maxRetries: env.openrouterMaxRetries,
    temperature: env.aiTemperature,
    maxTokens: env.aiMaxTokens,
    appUrl: env.publicBaseUrl,
    appTitle: env.openrouterAppTitle,
  };
}

/**
 * Fails fast with an actionable message when the active provider cannot run.
 * Mirrors the required startup check: it names the missing variable but never
 * prints any part of its value.
 */
export function assertAIConfig(config: AIConfig = readAIConfig()): AIConfig {
  if (usesRealProvider(config.provider) && !config.apiKey) {
    const variable = apiKeyVar(config.provider);
    throw new AIError(
      "missing_api_key",
      `${variable} is missing. Set AI_PROVIDER=${config.provider} and add ` +
        `${variable}=<your key> to the repository-root .env, then restart the server. ` +
        `The key is read server-side only and is never exposed to the browser.`,
    );
  }
  return config;
}

/**
 * Startup summary. Reports whether the key is present without revealing it, so
 * a misconfigured deploy is obvious in the logs.
 */
export function reportAIConfiguration(): void {
  const config = readAIConfig();
  logAIConfig({
    provider: config.provider,
    model: config.model,
    fallbackModel: config.fallbackModel,
    baseUrl: config.baseUrl,
    apiKeyPresent: config.apiKey.length > 0,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
  if (usesRealProvider(config.provider) && !config.apiKey) {
    const variable = apiKeyVar(config.provider);
    console.error(
      `[AI] ${variable} is missing - website generation will return a 503 ` +
        `until it is set in the repository-root .env.`,
    );
  }
}
