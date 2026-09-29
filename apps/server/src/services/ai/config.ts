/**
 * AI configuration - the single place the rest of the server reads provider
 * settings from.
 *
 * The active provider is chosen by `AI_PROVIDER` and is resolved here, once:
 * `readAIConfig()` returns the credentials/base URL/model of that provider, and
 * the factory in `index.ts` wraps them in the matching provider object. Nothing
 * else in the server branches on the provider name.
 *
 * The OpenRouter key is read from `process.env` here and handed straight to the
 * provider's `Authorization` header. It is never returned by an API route,
 * never embedded in a generated site and never prefixed with `VITE_`, so the
 * web bundle cannot contain it. It is never sent to Ollama, which needs no key.
 */

import { env } from "../../env";
import { AIError } from "./errors";
import { logAIConfig } from "./logger";

export interface AIConfig {
  provider: string;
  /** OpenRouter only. Always empty for Ollama - local Ollama needs no key. */
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
  /** Ollama only: `none | low | medium | high`, or `auto` to omit the field. */
  reasoningEffort?: string | undefined;
}

/** Providers that perform real network calls; everything else is the offline fixture. */
export function usesRealProvider(provider: string): boolean {
  return provider === "openrouter" || provider === "ollama";
}

export function readAIConfig(): AIConfig {
  const shared = {
    provider: env.aiProvider,
    temperature: env.aiTemperature,
    maxTokens: env.aiMaxTokens,
    appUrl: env.publicBaseUrl,
    appTitle: env.openrouterAppTitle,
  };

  // Local Ollama: no key, its own base URL/model/timeout. The OpenRouter
  // credentials are deliberately not carried over to this config object.
  if (shared.provider === "ollama") {
    return {
      ...shared,
      apiKey: "",
      model: env.ollamaModel,
      baseUrl: env.ollamaBaseUrl,
      timeoutMs: env.ollamaTimeoutMs,
      maxRetries: env.ollamaMaxRetries,
      reasoningEffort: env.ollamaReasoningEffort,
    };
  }

  return {
    ...shared,
    apiKey: env.openrouterApiKey,
    model: env.openrouterModel,
    baseUrl: env.openrouterBaseUrl,
    timeoutMs: env.openrouterTimeoutMs,
    maxRetries: env.openrouterMaxRetries,
  };
}

/**
 * Fails fast with an actionable message when the active provider cannot run.
 * Mirrors the required startup check: it names the missing variable but never
 * prints any part of its value.
 */
export function assertAIConfig(config: AIConfig = readAIConfig()): AIConfig {
  if (config.provider === "openrouter" && !config.apiKey) {
    throw new AIError(
      "missing_api_key",
      `OPENROUTER_API_KEY is missing. Set AI_PROVIDER=${config.provider} and add ` +
        `OPENROUTER_API_KEY=<your key> to the repository-root .env, then restart the server. ` +
        `The key is read server-side only and is never exposed to the browser.`,
    );
  }

  // Local Ollama needs no key - only an endpoint and a model to run.
  if (config.provider === "ollama") {
    if (!config.baseUrl) {
      throw new AIError(
        "not_configured",
        `OLLAMA_BASE_URL is missing. Add OLLAMA_BASE_URL=http://localhost:11434/v1 to the ` +
          `repository-root .env, then restart the server.`,
      );
    }
    if (!config.model) {
      throw new AIError(
        "not_configured",
        `OLLAMA_MODEL is missing. Add OLLAMA_MODEL=<model> to the repository-root .env ` +
          `(see \`ollama list\` for installed models), then restart the server.`,
      );
    }
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
  if (config.provider === "openrouter" && !config.apiKey) {
    console.error(
      "[AI] OPENROUTER_API_KEY is missing - website generation will return a 503 " +
        "until it is set in the repository-root .env.",
    );
  }
}
