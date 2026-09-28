/**
 * The real OpenRouter provider.
 *
 * Issues `POST {baseUrl}/chat/completions` with the configured key, model and
 * timeout, retries transient failures (429 / 5xx / network / timeout) with
 * exponential backoff, and classifies every failure into `AIError` so routes
 * can return an accurate status instead of a generic 500.
 *
 * Implemented with the platform `fetch` - OpenRouter's OpenAI-compatible
 * surface needs no SDK dependency.
 */

import type { AIConfig } from "./config";
import { assertAIConfig } from "./config";
import { AIError, classifyHttpFailure } from "./errors";
import { logAI } from "./logger";
import type { AICompletionRequest, AICompletionResult, AIProvider } from "./provider";

interface OpenRouterChoice {
  message?: { content?: string | null } | undefined;
  finish_reason?: string | undefined;
}

interface OpenRouterPayload {
  model?: string | undefined;
  choices?: OpenRouterChoice[] | undefined;
  usage?:
    | {
        prompt_tokens?: number | undefined;
        completion_tokens?: number | undefined;
        total_tokens?: number | undefined;
      }
    | undefined;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with jitter, capped so a retry never stalls a request. */
function backoffMs(attempt: number): number {
  const base = Math.min(250 * 2 ** (attempt - 1), 4_000);
  return base + Math.floor(Math.random() * 250);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter";
  readonly model: string;

  private readonly config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
    this.model = config.model;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    // Throws a clear `missing_api_key` error rather than sending a bad header.
    assertAIConfig(this.config);

    const maxAttempts = this.config.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.send(request, attempt);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof AIError && error.retryable;
        if (!retryable || attempt === maxAttempts) throw error;

        const delay = backoffMs(attempt);
        logAI("retry", {
          operation: request.operation,
          projectId: request.projectId,
          provider: this.name,
          model: this.model,
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay,
          kind: error.kind,
        });
        await sleep(delay);
      }
    }

    throw lastError;
  }

  private async send(request: AICompletionRequest, attempt: number): Promise<AICompletionResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const body = {
      model: this.config.model,
      messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      ...(request.json ? { response_format: { type: "json_object" as const } } : {}),
    };

    logAI("request", {
      operation: request.operation,
      projectId: request.projectId,
      provider: this.name,
      model: this.config.model,
      attempt,
      messages: request.messages.length,
      json: request.json === true,
    });

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          // The key lives only in this header, on this request.
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
          "HTTP-Referer": this.config.appUrl,
          "X-Title": this.config.appTitle,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AIError("timeout", `OpenRouter did not respond within ${this.config.timeoutMs}ms.`, {
          retryable: true,
        });
      }
      throw new AIError(
        "network_error",
        `Could not reach OpenRouter at ${this.config.baseUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    return this.readResponse(response, request, attempt, started);
  }

  /** Validates the HTTP status, extracts the completion and logs usage. */
  private async readResponse(
    response: Response,
    request: AICompletionRequest,
    attempt: number,
    started: number,
  ): Promise<AICompletionResult> {
    const raw = await response.text();
    if (!response.ok) throw classifyHttpFailure(response.status, raw);

    const payload = this.parseEnvelope(raw, request);
    const choice = payload.choices?.[0];
    const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
    if (!content.trim()) {
      throw new AIError("invalid_output", "OpenRouter returned an empty completion.", {
        retryable: true,
        detail: { finishReason: choice?.finish_reason ?? "unknown" },
      });
    }

    const usage = {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    };
    const latencyMs = Date.now() - started;
    const servedModel = payload.model ?? this.config.model;

    logAI("response", {
      operation: request.operation,
      projectId: request.projectId,
      provider: this.name,
      model: servedModel,
      attempt,
      durationMs: latencyMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      finishReason: choice?.finish_reason ?? "",
    });

    if (choice?.finish_reason === "length") {
      console.warn(
        `[AI] completion truncated by max_tokens operation=${request.operation} model=${servedModel} - consider raising AI_MAX_TOKENS`,
      );
    }

    return { text: content, model: servedModel, usage, latencyMs, attempts: attempt };
  }

  /** Parses the provider envelope, mapping anything unusable to `malformed_json`. */
  private parseEnvelope(raw: string, request: AICompletionRequest): OpenRouterPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AIError("malformed_json", "OpenRouter returned a response that is not valid JSON.", {
        retryable: true,
        detail: { operation: request.operation },
      });
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new AIError("malformed_json", "OpenRouter returned an unexpected response shape.", {
        retryable: true,
      });
    }
    return parsed as OpenRouterPayload;
  }
}
