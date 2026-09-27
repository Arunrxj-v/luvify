import type { ZodType, ZodTypeDef } from "zod";

/**
 * Structured data (requirements, specifications, site documents, message
 * payloads) is persisted as JSON strings so the schema stays portable and so we
 * never store unvalidated AI output. These helpers are the only sanctioned way
 * to cross that boundary - a Zod parse failure is always surfaced, never
 * silently swallowed.
 */

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

export class JsonDecodeError extends Error {
  constructor(
    message: string,
    readonly raw: string | null | undefined,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = "JsonDecodeError";
  }
}

/** Strict decode: throws JsonDecodeError when the value is missing/invalid. */
export function decodeJson<T>(raw: string | null | undefined, schema: ZodType<T, ZodTypeDef, unknown>, label = "value"): T {
  if (raw === null || raw === undefined || raw === "") {
    throw new JsonDecodeError(`Missing stored JSON for ${label}`, raw);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new JsonDecodeError(`Stored ${label} is not valid JSON`, raw);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new JsonDecodeError(`Stored ${label} failed validation`, raw, result.error.issues);
  }
  return result.data;
}

/** Lenient decode for optional columns: falls back (and reports) on failure. */
export function decodeJsonSafe<T>(
  raw: string | null | undefined,
  schema: ZodType<T, ZodTypeDef, unknown>,
  fallback: T,
  onError?: (error: JsonDecodeError) => void,
): T {
  try {
    return decodeJson(raw, schema, "value");
  } catch (error) {
    if (error instanceof JsonDecodeError) onError?.(error);
    return fallback;
  }
}

export function tryParseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
