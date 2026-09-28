/**
 * Structured output: asks the model for a JSON object, validates it against a
 * Zod schema and repairs once when the model returns something unusable.
 *
 * Schemas are the contract between the model and the database/renderer. The AI
 * never returns free prose into the pipeline: it must satisfy one of the
 * schemas in `schemas.ts` or the request fails with `invalid_output`.
 */

import type { ZodTypeAny, z } from "zod";
import { AIError } from "./errors";
import { logAI } from "./logger";
import type { AIChatMessage, AIProvider } from "./provider";

export interface StructuredRequest<S extends ZodTypeAny> {
  operation: string;
  projectId?: string | undefined;
  /** Role instruction: who the model is and the rules it must obey. */
  system: string;
  /** The project-scoped task, including the JSON contract to satisfy. */
  user: string;
  schema: S;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  /** Extra validation applied after the schema (e.g. project relevance). */
  refine?: ((value: z.infer<S>) => string | null) | undefined;
}

export interface StructuredResult<S extends ZodTypeAny> {
  data: z.infer<S>;
  model: string;
}

/**
 * Pulls the first JSON object out of a completion. Models frequently wrap JSON
 * in ``` fences or add a sentence before it; both are tolerated.
 */
export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return candidate;
  return candidate.slice(start, end + 1);
}

/** One structured completion, with a single repair attempt on invalid output. */
export async function completeStructured<S extends ZodTypeAny>(
  provider: AIProvider,
  request: StructuredRequest<S>,
): Promise<StructuredResult<S>> {
  const messages: AIChatMessage[] = [
    {
      role: "system",
      content: `${request.system}\n\nRespond with a single JSON object and nothing else - no prose, no markdown fences.`,
    },
    { role: "user", content: request.user },
  ];

  let lastProblem = "";
  let previousText = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const completion = await provider.complete({
      operation: request.operation,
      projectId: request.projectId,
      messages,
      json: true,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
    });

    previousText = completion.text;
    const parsed = parseWithSchema(request.schema, extractJsonObject(completion.text));
    if (parsed.ok) {
      const refineProblem = request.refine ? request.refine(parsed.data) : null;
      if (!refineProblem) {
        return { data: parsed.data, model: completion.model };
      }
      lastProblem = refineProblem;
    } else {
      lastProblem = parsed.problem;
    }

    logAI("structured_repair", {
      operation: request.operation,
      projectId: request.projectId,
      provider: provider.name,
      model: completion.model,
      attempt,
      problem: lastProblem,
    });

    if (attempt === 2) break;

    // Give the model its own output plus the exact contract it missed.
    messages.push({ role: "assistant", content: previousText.slice(0, 4_000) });
    messages.push({
      role: "user",
      content:
        `That response was rejected: ${lastProblem}\n` +
        `Return ONLY a corrected JSON object matching the requested contract exactly.`,
    });
  }

  throw new AIError(
    "invalid_output",
    `The model did not return valid structured output for "${request.operation}": ${lastProblem}`,
    { retryable: true, detail: { operation: request.operation, problem: lastProblem } },
  );
}

type ParseOutcome<T> = { ok: true; data: T } | { ok: false; problem: string };

function parseWithSchema<S extends ZodTypeAny>(schema: S, json: string): ParseOutcome<z.infer<S>> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    return { ok: false, problem: `response was not parseable JSON (${String(error)})` };
  }
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };

  const issues = result.error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return { ok: false, problem: `schema validation failed - ${issues}` };
}
