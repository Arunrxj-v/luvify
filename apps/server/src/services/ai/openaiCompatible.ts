/**
 * Shared transport for OpenAI-compatible `POST {baseUrl}/chat/completions`
 * endpoints.
 *
 * OpenRouter and Ollama expose the same wire format, so the retry loop, the
 * timeout, the envelope parsing and the logging live here exactly once. A
 * concrete provider only contributes its identity: headers, model/base URL,
 * and how a failure is phrased and classified.
 *
 * Implemented with the platform `fetch` - neither endpoint needs an SDK.
 */

import type { AIConfig } from "./config";
import { AIError, classifyHttpFailure } from "./errors";
import { logAI } from "./logger";
import type { AIChatMessage, AICompletionRequest, AICompletionResult, AIProvider } from "./provider";

interface ChatChoice {
  message?: { content?: string | null } | undefined;
  finish_reason?: string | undefined;
}

interface ChatEnvelope {
  model?: string | undefined;
  choices?: ChatChoice[] | undefined;
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

export abstract class OpenAICompatibleProvider implements AIProvider {
  /** Provider id, e.g. `openrouter` or `ollama`. */
  abstract readonly name: string;
  readonly model: string;

  protected readonly config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
    this.model = config.model;
  }

  /** Name used in human-readable error messages. Defaults to `name`. */
  protected get label(): string {
    return this.name;
  }

  /** Request headers. Only a provider that needs a key adds an Authorization. */
  protected headers(): Record<string, string> {
    return { "content-type": "application/json" };
  }

  /** Pre-flight validation, run once per `complete()` before anything is sent. */
  protected prepare(_request: AICompletionRequest): void {}

  /** The JSON payload. Providers add their own optional parameters here. */
  protected body(request: AICompletionRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
    };
    if (request.json) body.response_format = { type: "json_object" };
    return body;
  }

  // --- Failure phrasing/classification, overridable per provider -------------

  protected httpFailure(status: number, raw: string): AIError {
    return classifyHttpFailure(status, raw, this.label);
  }

  protected networkFailure(error: unknown): AIError {
    return new AIError(
      "network_error",
      `Could not reach ${this.label} at ${this.config.baseUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { retryable: true },
    );
  }

  protected timeoutFailure(): AIError {
    return new AIError("timeout", `${this.label} did not respond within ${this.config.timeoutMs}ms.`, {
      retryable: true,
    });
  }

  protected envelopeFailure(request: AICompletionRequest): AIError {
    return new AIError("malformed_json", `${this.label} returned a response that is not valid JSON.`, {
      retryable: true,
      detail: { operation: request.operation },
    });
  }

  protected emptyCompletionFailure(model: string, finishReason: string): AIError {
    return new AIError("invalid_output", `${this.label} returned an empty completion.`, {
      retryable: true,
      detail: { finishReason, model },
    });
  }

  // --- Transport -------------------------------------------------------------

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    this.prepare(request);

    const maxAttempts = this.config.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.send(request, attempt);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof AIError && error.retryable;
        if (!retryable || attempt === maxAttempts) {
          // Final failure is logged here: the HTTP layer translates AIError
          // into a response without logging, so this is the only trace a
          // caller that already disconnected would otherwise never produce.
          logAI("failure", {
            operation: request.operation,
            projectId: request.projectId,
            provider: this.name,
            model: this.model,
            attempt,
            retryable,
            kind: error instanceof AIError ? error.kind : "unknown",
            error: error instanceof Error ? error.message : String(error),
            // Provider detail (connection reason, timeout, upstream status) -
            // the user-facing message alone hides why a call actually failed.
            detail: error instanceof AIError && error.detail ? error.detail : undefined,
          });
          throw error;
        }

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

  protected async send(request: AICompletionRequest, attempt: number): Promise<AICompletionResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const body = this.body(request);

    logAI("request", {
      operation: request.operation,
      projectId: request.projectId,
      provider: this.name,
      model: this.config.model,
      attempt,
      messages: request.messages.length,
      json: request.json === true,
    });

    try {
      let response: Response;
      try {
        response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        if (isAbortError(error)) throw this.timeoutFailure();
        throw this.networkFailure(error);
      }

      // The timer stays armed while the body streams: clearing it after the
      // headers arrive would let a stalled response body hang forever.
      return await this.readResponse(response, request, attempt, started);
    } catch (error) {
      if (isAbortError(error)) throw this.timeoutFailure();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Validates the HTTP status, extracts the completion and logs usage. */
  protected async readResponse(
    response: Response,
    request: AICompletionRequest,
    attempt: number,
    started: number,
  ): Promise<AICompletionResult> {
    // A body that dies mid-stream (model unloaded, Ollama restarted) surfaces
    // as a plain fetch error here - map it so it is retryable like a connect
    // failure instead of escaping as an opaque 500.
    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      if (isAbortError(error)) throw this.timeoutFailure();
      throw this.networkFailure(error);
    }
    if (!response.ok) throw this.httpFailure(response.status, raw);

    const payload = this.parseEnvelope(raw, request);
    const choice = payload.choices?.[0];
    const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
    if (!content.trim()) {
      throw this.emptyCompletionFailure(payload.model ?? this.config.model, choice?.finish_reason ?? "unknown");
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
  private parseEnvelope(raw: string, request: AICompletionRequest): ChatEnvelope {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw this.envelopeFailure(request);
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw this.envelopeFailure(request);
    }
    return parsed as ChatEnvelope;
  }
}
