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
 * Pulls the first usable JSON object out of a completion. Models frequently
 * wrap JSON in ``` fences, prefix it with a sentence, or - like a local
 * thinking model - reason in-band before answering; all are tolerated.
 *
 * Never throws: if nothing parses, the best candidate is returned unchanged so
 * the caller reports "not parseable JSON" and the repair loop can react.
 */
export function extractJsonObject(text: string): string {
  const trimmed = text.trim();

  // Drop an in-band reasoning preamble ("... </think>" and friends): the answer
  // is whatever came after it. Only applied when a closing tag exists, so a
  // normal reply is never altered.
  const closed = trimmed.lastIndexOf("</think>");
  const answer =
    closed === -1
      ? trimmed
      : trimmed
          .slice(closed + "</think>".length)
          .trim() || trimmed;

  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1]?.trim(), answer].filter((entry): entry is string => Boolean(entry));

  for (const candidate of candidates) {
    const parsed = firstParseableObject(candidate);
    if (parsed !== null) return parsed;
  }

  // Historical contract: hand back the raw candidate rather than nothing.
  return candidates[0] ?? trimmed;
}

/** Balanced `{...}` slice for the first object in `text` that actually parses. */
function firstParseableObject(text: string): string | null {
  let from = 0;
  // Bounded so adversarial/pathological output cannot make this quadratic.
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const start = text.indexOf("{", from);
    if (start === -1) return null;
    const span = balancedSlice(text, start);
    if (span !== null) {
      try {
        JSON.parse(span);
        return span;
      } catch {
        // This brace opened something that is not valid JSON - keep scanning.
      }
    }
    from = start + 1;
  }
  return null;
}

/** From `start`, walk to the matching `}` respecting strings and escapes. */
function balancedSlice(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
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
