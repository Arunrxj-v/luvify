/**
 * The AI provider contract.
 *
 * Everything above this interface (prompts, schemas, pipeline steps) is
 * provider-agnostic; only `openaiCompatible.ts` and its two subclasses know
 * about HTTP. That keeps the network call in exactly one place instead of
 * scattered across routes, and lets `AI_PROVIDER` swap OpenRouter for local
 * Ollama without touching any caller.
 */

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  /** Traceable step name, used in logs (e.g. `page_content`). */
  operation: string;
  /** The single project this request is scoped to. Never a global context. */
  projectId?: string | undefined;
  messages: AIChatMessage[];
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  /** Ask the provider to constrain the reply to a JSON object. */
  json?: boolean | undefined;
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AICompletionResult {
  text: string;
  /** Model the provider actually served (may differ from the requested alias). */
  model: string;
  usage: AIUsage;
  latencyMs: number;
  attempts: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** Performs one completion, retrying transient failures internally. */
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
}
