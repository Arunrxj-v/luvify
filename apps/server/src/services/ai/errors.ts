/**
 * AI failure taxonomy.
 *
 * Every way an AI call can fail is named here and mapped onto the existing
 * `ApiError` contract, so the web client shows a specific, actionable message
 * ("OpenRouter rate limit reached - retry in a moment") instead of a blank
 * screen. Failures are ALWAYS surfaced: there is deliberately no fallback that
 * would fabricate a website when the provider is unavailable.
 */

import { ApiError } from "../../errors";

export type AIErrorKind =
  | "not_configured"
  | "missing_api_key"
  | "invalid_api_key"
  | "insufficient_credits"
  | "rate_limited"
  | "model_unavailable"
  | "provider_error"
  | "timeout"
  | "network_error"
  | "malformed_json"
  | "invalid_output";

export interface AIErrorOptions {
  upstreamStatus?: number | undefined;
  retryable?: boolean | undefined;
  detail?: unknown;
}

/** Raised by the AI service. Carries a machine-readable `kind`. */
export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly upstreamStatus: number | undefined;
  readonly retryable: boolean;
  readonly detail: unknown;

  constructor(kind: AIErrorKind, message: string, options: AIErrorOptions = {}) {
    super(message);
    this.name = "AIError";
    this.kind = kind;
    this.upstreamStatus = options.upstreamStatus;
    this.retryable = options.retryable ?? false;
    this.detail = options.detail;
  }
}

interface Mapping {
  status: number;
  code: string;
  retryable: boolean;
}

const MAPPING: Record<AIErrorKind, Mapping> = {
  not_configured: { status: 503, code: "ai_not_configured", retryable: false },
  missing_api_key: { status: 503, code: "ai_not_configured", retryable: false },
  invalid_api_key: { status: 502, code: "ai_auth_failed", retryable: false },
  insufficient_credits: { status: 402, code: "ai_credits_exhausted", retryable: false },
  rate_limited: { status: 429, code: "ai_rate_limited", retryable: true },
  model_unavailable: { status: 502, code: "ai_model_unavailable", retryable: false },
  provider_error: { status: 502, code: "ai_provider_error", retryable: true },
  timeout: { status: 504, code: "ai_timeout", retryable: true },
  network_error: { status: 502, code: "ai_network_error", retryable: true },
  malformed_json: { status: 502, code: "ai_invalid_output", retryable: true },
  invalid_output: { status: 502, code: "ai_invalid_output", retryable: true },
};

/**
 * Converts an AI failure into the HTTP error the routes already know how to
 * render. Non-AI errors pass through unchanged so genuine bugs keep their 500.
 */
export function aiToApiError(error: unknown): ApiError {
  if (!(error instanceof AIError)) throw error;

  const mapping = MAPPING[error.kind];
  const details: Record<string, unknown> = { kind: error.kind };
  if (error.upstreamStatus !== undefined) details.upstreamStatus = error.upstreamStatus;
  if (error.detail !== undefined) details.detail = error.detail;

  return new ApiError(mapping.status, mapping.code, error.message, details);
}

export function isRetryable(error: unknown): boolean {
  return error instanceof AIError && error.retryable;
}

/**
 * Classifies an HTTP response from the provider into the failure taxonomy.
 * OpenRouter and OpenAI-compatible gateways both report `error.message`.
 */
export function classifyHttpFailure(status: number, body: string): AIError {
  const message = extractProviderMessage(body);

  if (status === 401 || status === 403) {
    return new AIError("invalid_api_key", `OpenRouter rejected the API key (HTTP ${status}). ${message}`.trim(), {
      upstreamStatus: status,
    });
  }
  if (status === 402) {
    return new AIError(
      "insufficient_credits",
      `OpenRouter account has insufficient credits (HTTP 402). ${message}`.trim(),
      { upstreamStatus: status },
    );
  }
  if (status === 429) {
    return new AIError("rate_limited", `OpenRouter rate limit reached (HTTP 429). ${message}`.trim(), {
      upstreamStatus: status,
      retryable: true,
    });
  }
  if (status === 404) {
    return new AIError(
      "model_unavailable",
      `The configured model was not found on OpenRouter (HTTP 404). ${message}`.trim(),
      { upstreamStatus: status },
    );
  }
  if (status >= 500) {
    return new AIError("provider_error", `OpenRouter returned HTTP ${status}. ${message}`.trim(), {
      upstreamStatus: status,
      retryable: true,
    });
  }
  return new AIError("provider_error", `OpenRouter returned HTTP ${status}. ${message}`.trim(), {
    upstreamStatus: status,
  });
}

/** Pulls `error.message` out of an OpenAI-compatible error body without throwing. */
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
