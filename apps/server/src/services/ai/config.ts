/**
 * AI configuration - the single place the rest of the server reads provider
 * settings from.
 *
 * The OpenRouter key is read from `process.env` here and handed straight to the
 * provider's `Authorization` header. It is never returned by an API route,
 * never embedded in a generated site and never prefixed with `VITE_`, so the
 * web bundle cannot contain it.
 */

import { env } from "../../env";
import { AIError } from "./errors";
import { logAIConfig } from "./logger";

export interface AIConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  maxTokens: number;
  /** OpenRouter attribution headers (optional, but recommended by the API). */
  appUrl: string;
  appTitle: string;
}

/** `openrouter` performs real network calls; anything else is the offline fixture. */
export function usesRealProvider(provider: string): boolean {
  return provider === "openrouter";
}

export function readAIConfig(): AIConfig {
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
    throw new AIError(
      "missing_api_key",
      `OPENROUTER_API_KEY is missing. Set AI_PROVIDER=${config.provider} and add ` +
        `OPENROUTER_API_KEY=<your key> to the repository-root .env, then restart the server. ` +
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
    baseUrl: config.baseUrl,
    apiKeyPresent: config.apiKey.length > 0,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
  if (usesRealProvider(config.provider) && !config.apiKey) {
    console.error(
      "[AI] OPENROUTER_API_KEY is missing - website generation will return a 503 " +
        "until it is set in the repository-root .env.",
    );
  }
}
