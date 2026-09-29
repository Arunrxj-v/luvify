/**
 * AI provider status - the backend's answer to "is the AI actually usable?".
 *
 * `/api/health` reports this instead of letting the browser guess: the server
 * is the only place that knows which provider is configured and whether it can
 * be reached, and no credential is ever part of the answer.
 *
 *  - ollama     -> real probe of `OLLAMA_BASE_URL/models`, including whether the
 *                  configured model is installed (cached briefly so a page load
 *                  cannot hammer the daemon);
 *  - openrouter -> key presence only: a reachable check would spend a request.
 *
 * Results are cached for `CACHE_MS` and invalidated when provider/model/URL
 * change, so an `.env` edit shows up immediately.
 */

import { readAIConfig, type AIConfig } from "./config";
import { logAI } from "./logger";

export interface AIStatus {
  status: "connected" | "disconnected";
  /** Short, UI-safe sentence. Empty when connected. Never contains a credential. */
  detail: string;
  checkedAt: string;
}

const CACHE_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;

let cache: { key: string; expiresAt: number; value: AIStatus } | null = null;

function connected(detail: string): AIStatus {
  return { status: "connected", detail, checkedAt: new Date().toISOString() };
}

function disconnected(detail: string): AIStatus {
  return { status: "disconnected", detail, checkedAt: new Date().toISOString() };
}

/** True when `id` is the configured model (`qwen3.5` matches `qwen3.5:4b`). */
function matchesModel(id: string, model: string): boolean {
  const wanted = model.trim().toLowerCase();
  const found = id.trim().toLowerCase();
  if (!wanted || !found) return false;
  if (found === wanted) return true;
  // A model without a tag resolves to any tag of that name.
  return !wanted.includes(":") && found.startsWith(`${wanted}:`);
}

async function probe(config: AIConfig): Promise<AIStatus> {
  if (config.provider === "ollama") {
    const url = `${config.baseUrl}/models`;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    } catch (error) {
      const timedOut =
        typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "TimeoutError";
      return disconnected(
        timedOut
          ? `Ollama did not respond within ${PROBE_TIMEOUT_MS}ms at ${url}.`
          : "Ollama is not running. Start Ollama and try again.",
      );
    }

    if (!response.ok) {
      return disconnected(`Ollama returned HTTP ${response.status} from ${url}. Check OLLAMA_BASE_URL.`);
    }

    let modelIds: string[] = [];
    try {
      const payload = (await response.json()) as { data?: Array<{ id?: string }> };
      modelIds = (payload.data ?? []).map((entry) => entry.id ?? "");
    } catch {
      return disconnected(`Ollama returned an unexpected response from ${url}. Check OLLAMA_BASE_URL.`);
    }

    if (!modelIds.some((id) => matchesModel(id, config.model))) {
      return disconnected(
        `${config.model} is not installed in Ollama. Run \`ollama pull ${config.model}\` and try again.`,
      );
    }
    return connected(`Ollama reachable, model ${config.model} available.`);
  }

  if (config.provider === "openrouter") {
    return config.apiKey
      ? connected(`OpenRouter key configured, model ${config.model}.`)
      : disconnected(
          "OPENROUTER_API_KEY is missing. Add it to the repository-root .env to use OpenRouter.",
        );
  }

  // Explicit offline fixture: functional by definition, no network involved.
  return connected(`Offline fixture (AI_PROVIDER=${config.provider}).`);
}

/** Current provider status, cached for `CACHE_MS`. */
export async function getAIStatus(): Promise<AIStatus> {
  const config = readAIConfig();
  const key = [config.provider, config.model, config.baseUrl, config.apiKey.length].join("|");
  const now = Date.now();
  if (cache && cache.key === key && now < cache.expiresAt) return cache.value;

  const value = await probe(config);
  cache = { key, expiresAt: now + CACHE_MS, value };
  return value;
}

/** Startup log line: proves reachability (or explains the failure) once. */
export async function logAIStatus(): Promise<void> {
  try {
    const status = await getAIStatus();
    logAI("status", {
      operation: "health",
      status: status.status,
      detail: status.detail,
    });
  } catch (error) {
    console.error(`[AI] status check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
