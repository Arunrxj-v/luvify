/**
 * The real OpenRouter provider.
 *
 * Contributes OpenRouter's identity to the shared OpenAI-compatible transport
 * in `openaiCompatible.ts`: the bearer key, the attribution headers, the
 * OpenRouter-specific failure messages and the required-key pre-flight check.
 * The request, retry, timeout and envelope logic is shared with the Ollama
 * provider so the two can never drift apart.
 */

import { assertAIConfig } from "./config";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class OpenRouterProvider extends OpenAICompatibleProvider {
  readonly name = "openrouter";

  protected override get label(): string {
    return "OpenRouter";
  }

  /** Throws a clear `missing_api_key` error rather than sending a bad header. */
  protected override prepare(): void {
    assertAIConfig(this.config);
  }

  protected override headers(): Record<string, string> {
    return {
      // The key lives only in this header, on this request.
      authorization: `Bearer ${this.config.apiKey}`,
      "content-type": "application/json",
      "HTTP-Referer": this.config.appUrl,
      "X-Title": this.config.appTitle,
    };
  }
}
