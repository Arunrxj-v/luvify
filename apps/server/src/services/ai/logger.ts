/**
 * Structured logging for the AI layer.
 *
 * Every call emits one traceable line so a generation can be followed from the
 * HTTP route through the provider to the model:
 *
 *   [AI] provider=openrouter model=... projectId=... operation=page_content durationMs=812
 *
 * The API key, `Authorization` header and full prompt bodies are NEVER logged.
 * Field names that look like credentials are dropped defensively, so a caller
 * cannot leak a secret by adding it to the log fields.
 */

export type AIOperation =
  | "requirement_extraction"
  | "architecture_plan"
  | "specification"
  | "page_content"
  | "content_validation"
  | "chat_reply"
  | "website_modification";

export interface AILogFields {
  operation: AIOperation | string;
  projectId?: string | undefined;
  [name: string]: unknown;
}

/** Field names that must never reach the log, whatever the caller passes. */
const SECRET_NAME = /(api[-_]?key|authorization|bearer|token|secret|password)/i;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 300);
  try {
    return JSON.stringify(value).replace(/\s+/g, " ").slice(0, 300);
  } catch {
    return "[unserializable]";
  }
}

/** Emits `[AI] event=... key=value ...`, skipping empty and credential fields. */
export function logAI(event: string, fields: AILogFields): void {
  const parts: string[] = [`[AI] event=${event}`];
  for (const [name, value] of Object.entries(fields)) {
    if (SECRET_NAME.test(name)) continue;
    const formatted = formatValue(value);
    if (!formatted) continue;
    parts.push(`${name}=${formatted}`);
  }
  console.log(parts.join(" "));
}

/**
 * Logs a startup/config summary.
 *
 * Never includes the key itself - only whether one is configured - so a
 * misconfigured deploy is obvious from the logs without ever leaking a secret.
 */
export function logAIConfig(input: {
  provider: string;
  model: string;
  fallbackModel?: string | undefined;
  baseUrl: string;
  apiKeyPresent: boolean;
  timeoutMs: number;
  maxRetries: number;
}): void {
  console.log(`[AI] provider=${input.provider}`);
  console.log(`[AI] api key configured=${input.apiKeyPresent}`);
  console.log(`[AI] model=${input.model}`);
  if (input.fallbackModel) console.log(`[AI] fallback model=${input.fallbackModel}`);
  console.log(`[AI] baseUrl=${input.baseUrl} timeoutMs=${input.timeoutMs} maxRetries=${input.maxRetries}`);
}
