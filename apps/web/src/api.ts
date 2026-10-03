/**
 * Thin typed fetch wrapper around the API. The Vite dev server proxies
 * `/api` (and `/sites`) to the Express server, so no origin is needed unless
 * `VITE_API_BASE_URL` is set for a deployed build.
 *
 * `credentials: "include"` is what makes the httpOnly session cookie travel
 * with every request. It is a no-op for same-origin calls (the default) and
 * mandatory the moment the API is served from another origin - without it the
 * browser silently drops the cookie and every request looks anonymous.
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

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Notified whenever a *protected* request answers 401, i.e. the session
 * expired or was revoked while the app was open. The auth store uses it to
 * drop back to the sign-in screen instead of leaving a dead UI behind.
 *
 * `/api/auth/*` is excluded: those 401s are an expected part of the sign-in
 * flow (wrong password, `/me` while logged out) and are handled in place.
 */
export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
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
    if (response.status === 401 && !path.startsWith("/api/auth/")) unauthorizedHandler?.();
    const error = (payload as { error?: { message?: string; details?: unknown } } | null)?.error;
    throw new ApiClientError(response.status, error?.message ?? `Request failed (${response.status})`, error?.details);
  }

  return payload as T;
}

export const apiUrl = (path: string): string => `${base}${path}`;
