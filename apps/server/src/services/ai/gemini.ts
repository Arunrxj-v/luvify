/**
 * The real Google Gemini provider, built on the official `@google/genai` SDK.
 *
 * Mirrors `openrouter.ts` exactly: the configured key, model and timeout are
 * applied per call, transient failures (429 / 5xx / network / timeout) are
 * retried with exponential backoff, and every SDK failure is classified into
 * `AIError` so routes can return an accurate status instead of a generic 500.
 *
 * Transient upstream failures (429, 408, 500, 502, 503, 504 - e.g. Gemini's
 * "high demand" 503) back off 2s -> 5s -> 10s -> 20s between attempts, honour
 * Gemini's `Retry-After` header when present, and - if every attempt fails -
 * surface a final error that says Gemini is temporarily unavailable.
 * Authentication and malformed-request failures are never retried. The number
 * of retries comes from AI_MAX_RETRIES (via the shared config).
 *
 * Fallback model: when the primary model (GEMINI_MODEL, Gemini 3.8 Flash) runs
 * out of retries on a TRANSIENT failure, one extra cycle with the same retry
 * budget re-sends the identical request (same prompts, JSON mode, temperature,
 * token limit) against GEMINI_FALLBACK_MODEL - only the model id changes, the
 * pipeline never sees which model answered. Non-transient failures (auth,
 * invalid request, missing key, unknown model) never use the fallback. Which
 * model was used, and whether a fallback happened, is logged per request.
 *
 * Structured output uses the SDK's own JSON mode (`responseMimeType:
 * "application/json"`) instead of relying on prompt wording alone, so the
 * pipeline stages that expect JSON get it from the API contract.
 *
 * The API key is passed to the SDK client here and nowhere else; it is never
 * logged, never returned by a route and never visible to the browser.
 */

import { ApiError, GoogleGenAI } from "@google/genai";
import type { Content, Fetch, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import type { AIConfig } from "./config";
import { assertAIConfig } from "./config";
import { AIError } from "./errors";
import { logAI } from "./logger";
import type { AIChatMessage, AICompletionRequest, AICompletionResult, AIProvider } from "./provider";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Backoff between retries for transient upstream failures
 * (429 / 408 / 5xx - "high demand", overload, gateway errors):
 * 2s -> 5s -> 10s -> 20s, then repeats at 20s for any further attempt.
 */
const TRANSIENT_BACKOFF_MS = [2_000, 5_000, 10_000, 20_000] as const;

/** Final step of the schedule, also used for any attempt beyond the list. */
const MAX_TRANSIENT_BACKOFF_MS =
  TRANSIENT_BACKOFF_MS[TRANSIENT_BACKOFF_MS.length - 1] ?? TRANSIENT_BACKOFF_MS[0] ?? 20_000;

/** Upper bound on any single wait, including a long `Retry-After`. */
const MAX_RETRY_DELAY_MS = 60_000;

/** Fast backoff for non-upstream retryable failures (network / malformed output). */
function backoffMs(attempt: number): number {
  const base = Math.min(250 * 2 ** (attempt - 1), 4_000);
  return base + Math.floor(Math.random() * 250);
}

/** True for statuses Gemini raises transiently and where retrying helps. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** True when an error came from a transient upstream status (429 / 5xx). */
function isTransientUpstreamError(error: AIError): boolean {
  return error.upstreamStatus !== undefined && isTransientStatus(error.upstreamStatus);
}

/**
 * Parses Gemini's `Retry-After` headers into milliseconds.
 *
 * Supports the `retry-after-ms` header, `Retry-After` in seconds and the
 * HTTP-date form. Returns `null` when neither header is usable, in which case
 * the exponential schedule applies instead.
 */
export function parseRetryAfterMs(retryAfter: string | null, retryAfterMs: string | null): number | null {
  if (retryAfterMs && retryAfterMs.trim()) {
    const ms = Number(retryAfterMs);
    if (Number.isFinite(ms) && ms >= 0) return ms;
  }
  const raw = retryAfter?.trim();
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isInteger(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

/**
 * Delay before the next attempt.
 *
 * Transient upstream failures wait for the exponential schedule, but never
 * less than what Gemini's `Retry-After` header asks for (never more than
 * `MAX_RETRY_DELAY_MS`). Other retryable failures keep the fast backoff.
 */
export function retryDelayFor(error: AIError, attempt: number, retryAfterMs: number | null): number {
  if (isTransientUpstreamError(error)) {
    const schedule =
      TRANSIENT_BACKOFF_MS[Math.min(attempt - 1, TRANSIENT_BACKOFF_MS.length - 1)] ?? MAX_TRANSIENT_BACKOFF_MS;
    const fromHeader = retryAfterMs !== null && retryAfterMs > 0 ? retryAfterMs : 0;
    return Math.min(Math.max(schedule, fromHeader), MAX_RETRY_DELAY_MS);
  }
  return backoffMs(attempt);
}

/**
 * The error surfaced to the frontend once every attempt failed on a transient
 * upstream status: names the outage in plain words while keeping the original
 * kind, status and upstream message the client already understands.
 *
 * `tried` is the [primary, fallback] pair when both models were exhausted, so
 * the message stays honest about what actually happened.
 */
function finalizeFailure(error: AIError, attempts: number, tried?: readonly [string, string]): AIError {
  if (!isTransientUpstreamError(error)) return error;
  const headline = tried
    ? `Gemini is temporarily unavailable: ${tried[0]} and fallback model ${tried[1]} both failed after ` +
      `${attempts} attempts each.`
    : `Gemini is temporarily unavailable after ${attempts} attempt${attempts === 1 ? "" : "s"}.`;
  return new AIError(error.kind, `${headline} ${error.message} Please try again in a few moments.`, {
    upstreamStatus: error.upstreamStatus,
    retryable: error.retryable,
    detail: error.detail,
  });
}

/** Pulls `error.message` out of a Gemini error body without throwing. */
function extractProviderMessage(body: string): string {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string };
    const value = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    return typeof value === "string" ? value.slice(0, 300) : "";
  } catch {
    return body.slice(0, 300);
  }
}

/** Shortens any message before it reaches logs or API responses. */
function clip(message: string): string {
  return message.replace(/\s+/g, " ").slice(0, 300);
}

/** Status code carried by the error, when the SDK attached one. */
function readStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

/** Human-facing message of an error, unwrapping one level of `cause`. */
function readMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  const causeText = cause instanceof Error ? `: ${clip(cause.message)}` : "";
  return `${clip(error.message)}${causeText}`;
}

/** Classifies a Gemini HTTP status into the shared failure taxonomy. */
function classifyGeminiStatus(status: number, message: string): AIError {
  const options = { upstreamStatus: status };
  const text = message.trim();
  if (status === 400) {
    // Gemini reports a missing/invalid/revoked key as HTTP 400 INVALID_ARGUMENT.
    if (/api key/i.test(text)) {
      return new AIError("invalid_api_key", `Gemini rejected the API key (HTTP 400). ${text}`.trim(), options);
    }
    return new AIError("provider_error", `Gemini rejected the request (HTTP 400). ${text}`.trim(), options);
  }
  if (status === 401 || status === 403) {
    return new AIError("invalid_api_key", `Gemini rejected the API key (HTTP ${status}). ${text}`.trim(), options);
  }
  if (status === 404) {
    return new AIError(
      "model_unavailable",
      `The configured model was not found on Gemini (HTTP 404). ${text}`.trim(),
      options,
    );
  }
  if (status === 408) {
    return new AIError("timeout", `Gemini timed out (HTTP 408). ${text}`.trim(), { ...options, retryable: true });
  }
  if (status === 429) {
    return new AIError("rate_limited", `Gemini rate limit reached (HTTP 429). ${text}`.trim(), {
      ...options,
      retryable: true,
    });
  }
  // 500 / 502 / 503 / 504 (and any other 5xx) are transient: Gemini's own
  // "high demand" overload response arrives as 503 and must be retried.
  if (status >= 500) {
    return new AIError("provider_error", `Gemini returned HTTP ${status}. ${text}`.trim(), {
      ...options,
      retryable: true,
    });
  }
  return new AIError("provider_error", `Gemini returned HTTP ${status}. ${text}`.trim(), options);
}

/**
 * Maps any failure thrown by the Gemini SDK (or the network underneath it)
 * onto `AIError`. Everything the pipeline sees stays in the existing taxonomy.
 */
function classifyGeminiFailure(error: unknown, timeoutMs: number): AIError {
  if (error instanceof AIError) return error;

  const name = error instanceof Error ? error.name : "";
  const message = readMessage(error);
  const raw = error instanceof Error ? error.message : String(error);

  // HTTP-level failure: `ApiError` (or anything carrying an HTTP status).
  const status = error instanceof ApiError ? error.status : readStatus(error);
  if (status !== null && status >= 100) {
    return classifyGeminiStatus(status, extractProviderMessage(raw) || message);
  }

  // Our own AbortController fired, or the SDK cancelled the request.
  if (name === "AbortError" || name === "RequestAbortedError") {
    return new AIError("timeout", `Gemini did not respond within ${timeoutMs}ms.`, { retryable: true });
  }
  // SDK / socket level timeout (`httpOptions.timeout`, headers/body timeouts).
  if (name === "RequestTimeoutError" || /\btimed?[- ]?out\b|timeout|ETIMEDOUT|UND_ERR_/i.test(message)) {
    return new AIError("timeout", `Gemini did not respond within ${timeoutMs}ms.`, { retryable: true });
  }
  // Could not reach generativelanguage.googleapis.com at all.
  if (
    name === "ConnectionError" ||
    /\bfetch failed\b|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|socket hang up/i.test(
      message,
    )
  ) {
    return new AIError("network_error", `Could not reach the Gemini API: ${message}`, { retryable: true });
  }
  // The SDK could not parse the response envelope - same as an unusable body.
  if (name === "SyntaxError" || /Unexpected (token|end of JSON)|not valid JSON|Unexpected character/i.test(message)) {
    return new AIError("malformed_json", "Gemini returned a response that is not valid JSON.", {
      retryable: true,
      detail: { cause: message },
    });
  }
  // A credential problem surfaced before an HTTP status was available.
  if (/api key|unauthenticated|permission denied/i.test(message)) {
    return new AIError("invalid_api_key", `Gemini rejected the request credentials. ${message}`.trim());
  }
  return new AIError("provider_error", `Gemini SDK error: ${message}`.trim(), { retryable: false });
}

/** Maps the chat messages onto Gemini's `contents` + `systemInstruction`. */
function toGeminiContents(messages: AIChatMessage[]): { systemInstruction?: string; contents: Content[] } {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();

  const contents: Content[] = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  // Gemini requires at least one content entry: a system-only request still
  // has to reach the model, so the instructions become the user turn.
  if (contents.length === 0 && systemText) {
    contents.push({ role: "user", parts: [{ text: systemText }] });
  }

  return { ...(systemText ? { systemInstruction: systemText } : {}), contents };
}

/** Outcome of one retry cycle: either a completion or the failure it ran out of attempts on. */
type CycleOutcome =
  | { ok: true; result: AICompletionResult }
  | { ok: false; error: AIError; attempts: number };

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly model: string;

  private readonly config: AIConfig;
  /** Built lazily so a missing key fails with `missing_api_key` before any client exists. */
  private client: GoogleGenAI | null = null;

  constructor(config: AIConfig) {
    this.config = config;
    this.model = config.model;
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({
        // Server-side only: handed to the SDK, never logged or exposed.
        apiKey: this.config.apiKey,
        httpOptions: {
          baseUrl: this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`,
          timeout: this.config.timeoutMs,
          // Our retry loop below owns retries exactly like the OpenRouter
          // provider: SDK-internal retries would multiply AI_MAX_RETRIES.
          retryOptions: { attempts: 1 },
        },
      });
    }
    return this.client;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    // Throws a clear `missing_api_key` error rather than building a bad client.
    assertAIConfig(this.config);

    const primary = this.config.model;
    const primaryRun = await this.runCycle(primary, request);
    if (primaryRun.ok) return primaryRun.result;

    // Fallback is for TRANSIENT failures only (`retryable` is the transient
    // flag by contract): a bad key, a rejected request or a misconfigured
    // model must surface immediately instead of trying another model.
    const fallback = this.fallbackModelFor(primary);
    if (!fallback || !primaryRun.error.retryable) {
      throw finalizeFailure(primaryRun.error, primaryRun.attempts);
    }

    logAI("model_fallback", {
      operation: request.operation,
      projectId: request.projectId,
      provider: this.name,
      fromModel: primary,
      toModel: fallback,
      attempts: primaryRun.attempts,
      kind: primaryRun.error.kind,
    });

    // Same request, same prompts, same JSON mode, same temperature and limits:
    // only the model id differs, so the pipeline never changes.
    const fallbackRun = await this.runCycle(fallback, request);
    if (fallbackRun.ok) {
      logAI("model_fallback_result", {
        operation: request.operation,
        projectId: request.projectId,
        provider: this.name,
        model: fallback,
        attempts: fallbackRun.result.attempts,
        ok: true,
      });
      return fallbackRun.result;
    }

    logAI("model_fallback_result", {
      operation: request.operation,
      projectId: request.projectId,
      provider: this.name,
      model: fallback,
      attempts: fallbackRun.attempts,
      ok: false,
      kind: fallbackRun.error.kind,
    });
    throw finalizeFailure(fallbackRun.error, fallbackRun.attempts, [primary, fallback]);
  }

  /**
   * One retry cycle against a single model: attempts, backoff, Retry-After
   * handling and error classification are identical whichever model is tried,
   * so the fallback path shares this code and only swaps the model id.
   */
  private async runCycle(model: string, request: AICompletionRequest): Promise<CycleOutcome> {
    // Retry count comes from the shared config (AI_MAX_RETRIES / GEMINI_MAX_RETRIES).
    const maxAttempts = this.config.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // Per-attempt carrier for Gemini's Retry-After header, filled in by the
      // capturing fetch wrapper inside `send()`.
      const hint: { retryAfterMs: number | null } = { retryAfterMs: null };
      try {
        return { ok: true, result: await this.send(request, attempt, hint, model) };
      } catch (error) {
        if (!(error instanceof AIError)) throw error; // a real bug, not a provider failure
        // Non-retryable (auth / invalid request / config) or retries spent.
        if (!error.retryable || attempt === maxAttempts) {
          return { ok: false, error, attempts: attempt };
        }

        const delay = retryDelayFor(error, attempt, hint.retryAfterMs);
        logAI("retry", {
          operation: request.operation,
          projectId: request.projectId,
          provider: this.name,
          model,
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay,
          kind: error.kind,
          ...(hint.retryAfterMs !== null ? { retryAfterMs: hint.retryAfterMs } : {}),
        });
        await sleep(delay);
      }
    }

    // Unreachable - the loop always returns on its final attempt.
    return {
      ok: false,
      error: new AIError("provider_error", "Gemini retry cycle ended unexpectedly."),
      attempts: maxAttempts,
    };
  }

  /** The configured fallback model for this primary, or null when none applies. */
  private fallbackModelFor(primary: string): string | null {
    const fallback = this.config.fallbackModel?.trim();
    return fallback && fallback !== primary ? fallback : null;
  }

  private async send(
    request: AICompletionRequest,
    attempt: number,
    hint: { retryAfterMs: number | null },
    model: string,
  ): Promise<AICompletionResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const { systemInstruction, contents } = toGeminiContents(request.messages);

    // The SDK's ApiError does not carry response headers, so Retry-After is
    // read here - the SDK hands this fetch straight to its request path.
    const capturingFetch: Fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (!response.ok) {
        const captured = parseRetryAfterMs(
          response.headers.get("retry-after"),
          response.headers.get("retry-after-ms"),
        );
        if (captured !== null) hint.retryAfterMs = captured;
      }
      return response;
    };

    const params: GenerateContentParameters = {
      model,
      contents,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        temperature: request.temperature ?? this.config.temperature,
        maxOutputTokens: request.maxTokens ?? this.config.maxTokens,
        // Structured output: the API contract enforces JSON, prompts only
        // describe the shape. Used by every pipeline stage that expects JSON.
        ...(request.json ? { responseMimeType: "application/json" } : {}),
        abortSignal: controller.signal,
        // Per-request override; merged over the client's httpOptions by the SDK.
        httpOptions: { fetch: capturingFetch },
      },
    };

    logAI("request", {
      operation: request.operation,
      projectId: request.projectId,
      provider: this.name,
      model,
      attempt,
      messages: request.messages.length,
      json: request.json === true,
    });

    let response: GenerateContentResponse;
    try {
      response = await this.getClient().models.generateContent(params);
    } catch (error) {
      throw classifyGeminiFailure(error, this.config.timeoutMs);
    } finally {
      clearTimeout(timer);
    }

    return this.readResponse(response, request, attempt, started, model);
  }

  /** Validates the completion, extracts text and logs usage. */
  private readResponse(
    response: GenerateContentResponse,
    request: AICompletionRequest,
    attempt: number,
    started: number,
    model: string,
  ): AICompletionResult {
    const text = typeof response.text === "string" ? response.text : "";
    // Widened to `string` so it can be compared with plain literals in logs.
    const finishReason: string = response.candidates?.[0]?.finishReason ?? "";

    if (!text.trim()) {
      throw new AIError("invalid_output", "Gemini returned an empty completion.", {
        retryable: true,
        detail: { finishReason: finishReason || "unknown" },
      });
    }

    const meta = response.usageMetadata;
    const usage = {
      promptTokens: meta?.promptTokenCount ?? 0,
      completionTokens: meta?.candidatesTokenCount ?? 0,
      totalTokens: meta?.totalTokenCount ?? 0,
    };
    const latencyMs = Date.now() - started;
    // The model that actually answered (fallback included), as served by Gemini.
    const servedModel = response.modelVersion || model;

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
      finishReason,
    });

    if (finishReason === "MAX_TOKENS") {
      console.warn(
        `[AI] completion truncated by maxOutputTokens operation=${request.operation} model=${servedModel} - consider raising AI_MAX_TOKENS`,
      );
    }

    return { text, model: servedModel, usage, latencyMs, attempts: attempt };
  }
}
