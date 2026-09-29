/**
 * The local Ollama provider.
 *
 * Talks to Ollama's OpenAI-compatible endpoint (`{base}/chat/completions`,
 * e.g. `http://localhost:11434/v1/chat/completions`) through the same shared
 * transport as OpenRouter, so every pipeline step - requirement extraction,
 * architecture, page copy, validation, chat - works unchanged once
 * `AI_PROVIDER=ollama`.
 *
 * Differences from the hosted provider, all localised here:
 *  - no API key is ever sent (Ollama needs none, and the OpenRouter key must
 *    never leave the OpenRouter request);
 *  - failures are phrased for a local server: "Ollama is not running", or
 *    "<model> is not installed in Ollama";
 *  - `reasoning_effort` is sent when configured, because qwen3.5:4b is a
 *    thinking model that otherwise spends its whole token budget reasoning.
 *
 * There is deliberately no fallback: if Ollama is unreachable or the model is
 * missing, the call fails loudly instead of returning fabricated content.
 */

import { assertAIConfig } from "./config";
import { AIError, classifyHttpFailure, extractProviderMessage } from "./errors";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import type { AICompletionRequest } from "./provider";

/** Values Ollama accepts for `reasoning_effort`; anything else is omitted. */
const REASONING_EFFORTS = new Set(["none", "low", "medium", "high"]);

export class OllamaProvider extends OpenAICompatibleProvider {
  readonly name = "ollama";

  protected override get label(): string {
    return "Ollama";
  }

  /**
   * Validates the local endpoint and model name. Never checks for an API key:
   * a local Ollama server does not use one.
   */
  protected override prepare(): void {
    assertAIConfig(this.config);
  }

  /** Only a content type - no Authorization header, no attribution headers. */
  protected override headers(): Record<string, string> {
    return { "content-type": "application/json" };
  }

  protected override body(request: AICompletionRequest): Record<string, unknown> {
    const body = super.body(request);
    // Explicit so the server never streams a partial reply into the pipeline.
    body.stream = false;

    const effort = (this.config.reasoningEffort ?? "").trim().toLowerCase();
    if (REASONING_EFFORTS.has(effort)) body.reasoning_effort = effort;
    return body;
  }

  protected override httpFailure(status: number, raw: string): AIError {
    const message = extractProviderMessage(raw);

    if (status === 404) {
      // Ollama answers 404 both for an unknown model and for a wrong path.
      const modelMissing = /model/i.test(message);
      return new AIError(
        "model_unavailable",
        modelMissing
          ? `${this.config.model} is not installed in Ollama. Run \`ollama pull ${this.config.model}\` and try again.`
          : `Ollama returned HTTP 404 from ${this.config.baseUrl}. Check OLLAMA_BASE_URL. ${message}`.trim(),
        { upstreamStatus: status, detail: { baseUrl: this.config.baseUrl, model: this.config.model } },
      );
    }

    if (status === 401 || status === 403) {
      return new AIError(
        "invalid_api_key",
        `Ollama rejected the request (HTTP ${status}). Local Ollama needs no API key - ` +
          `check that OLLAMA_BASE_URL (${this.config.baseUrl}) points at your local server.`,
        { upstreamStatus: status },
      );
    }

    return classifyHttpFailure(status, raw, this.label);
  }

  /** A refused connection means the daemon is not up - say exactly that. */
  protected override networkFailure(error: unknown): AIError {
    return new AIError("network_error", "Ollama is not running. Start Ollama and try again.", {
      retryable: true,
      detail: {
        baseUrl: this.config.baseUrl,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }

  protected override timeoutFailure(): AIError {
    return new AIError(
      "timeout",
      `Ollama did not respond within ${this.config.timeoutMs}ms. It may still be loading ` +
        `${this.config.model} - raise OLLAMA_TIMEOUT_MS, or wait for \`ollama list\` to show the model.`,
      { retryable: true, detail: { timeoutMs: this.config.timeoutMs, model: this.config.model } },
    );
  }

  /**
   * A thinking model can burn `max_tokens` on reasoning and answer with an
   * empty `content`. That is a real failure, never something to paper over, so
   * it names the knob to turn instead of pretending the call succeeded.
   */
  protected override emptyCompletionFailure(model: string, finishReason: string): AIError {
    const hint =
      finishReason === "length"
        ? ` The reply was cut off at the token limit - raise AI_MAX_TOKENS, or keep ` +
          `OLLAMA_REASONING_EFFORT=none so the model spends its budget on the answer.`
        : ` Retry, or confirm the model is installed with \`ollama list\`.`;
    return new AIError("invalid_output", `Ollama returned an empty completion from ${model}.${hint}`, {
      retryable: true,
      detail: { finishReason, model },
    });
  }
}
