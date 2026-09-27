/**
 * Thin typed fetch wrapper around the API. The Vite dev server proxies
 * `/api` (and `/sites`) to the Express server, so no origin is needed unless
 * `VITE_API_BASE_URL` is set for a deployed build.
 */

const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiClientError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { message?: string; details?: unknown } } | null)?.error;
    throw new ApiClientError(response.status, error?.message ?? `Request failed (${response.status})`, error?.details);
  }

  return payload as T;
}

export const apiUrl = (path: string): string => `${base}${path}`;
