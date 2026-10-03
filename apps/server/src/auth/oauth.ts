/**
 * Google OAuth 2.0 / OpenID Connect - the *server-side* authorization-code flow.
 *
 * The browser never sees the client secret: it is handed to Google's auth
 * endpoint, exchanged by this process for tokens, and the resulting identity is
 * read from Google's `userinfo` endpoint. No frontend-supplied profile data is
 * ever trusted, so a caller cannot "sign in as" anyone by posting a fake
 * Google id to the API.
 *
 * The `state` parameter is bound to the browser twice over:
 *   1. it is stored in an httpOnly, SameSite=Lax cookie, so a forged callback
 *      cannot complete without the original browser, and
 *   2. it carries an HMAC over its own payload (signed with `JWT_SECRET`, the
 *      same secret the Phase 2 demo token helper used) plus an expiry, so a
 *      mutated state is rejected before it is even compared.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../env";
import { appendCookie, clearCookie, parseCookies, serializeCookie } from "./cookies";

export interface GoogleIdentity {
  /** Google's immutable per-account subject. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

export class OAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", env.jwtSecret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Parsed contents of a verified state blob. */
export interface OAuthState {
  /** Where to drop the user off after a successful callback. */
  redirect: string;
}

/** `base64url(json).hmac`, with a hard expiry baked into the payload. */
function createSignedState(redirect: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      nonce: randomBytes(16).toString("base64url"),
      exp: Date.now() + env.auth.oauthStateSeconds * 1000,
      redirect,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readSignedState(state: string): OAuthState | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(sign(payload), signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
      redirect?: unknown;
    };
    if (typeof parsed.exp !== "number" || parsed.exp <= Date.now()) return null;
    return { redirect: safeRedirectPath(parsed.redirect) };
  } catch {
    return null;
  }
}

/** Issues the state blob and pins it to this browser in an httpOnly cookie. */
export function beginState(res: Response, redirect: string): string {
  const state = createSignedState(redirect);
  appendCookie(
    res,
    serializeCookie(env.auth.oauthCookieName, state, {
      httpOnly: true,
      secure: env.auth.cookieSecure,
      sameSite: "Lax",
      path: "/",
      maxAge: env.auth.oauthStateSeconds,
    }),
  );
  return state;
}

/**
 * Callback-side check: the returned `state` must be untampered, unexpired and
 * match the value this browser was issued. Returns where to send the user, or
 * null when the state cannot be trusted - the caller must abort.
 *
 * The state cookie is cleared either way; it is single-use.
 */
export function consumeState(req: Request, res: Response, returned: string | null | undefined): OAuthState | null {
  clearCookie(res, env.auth.oauthCookieName, {
    httpOnly: true,
    secure: env.auth.cookieSecure,
    sameSite: "Lax",
    path: "/",
  });
  if (!returned) return null;
  const parsed = readSignedState(returned);
  if (!parsed) return null;
  const issued = parseCookies(req.headers.cookie)[env.auth.oauthCookieName];
  if (!issued || !safeEqual(issued, returned)) return null;
  return parsed;
}

/** Builds the Google authorization endpoint URL. */
export function authorizationUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env.auth.google.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // `openid` makes this an OpenID Connect request, which is what guarantees
    // an `id_token`/verified identity rather than a bare OAuth profile.
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${env.auth.google.authorizationEndpoint}?${params.toString()}`;
}

/** Server-to-server code exchange. Never called from the browser. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string }> {
  const response = await fetch(env.auth.google.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.auth.google.clientId,
      client_secret: env.auth.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    throw new OAuthError(
      "oauth_exchange_failed",
      payload?.error_description || payload?.error || "Google rejected the authorization code.",
    );
  }
  return { accessToken: payload.access_token };
}

/**
 * Reads the verified identity from Google. `email_verified` is mandatory: an
 * unverified address must never be used to create or claim a local account.
 */
export async function fetchIdentity(accessToken: string): Promise<GoogleIdentity> {
  const response = await fetch(env.auth.google.userinfoEndpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const profile = (await response.json().catch(() => null)) as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
    picture?: unknown;
  } | null;

  if (!response.ok || !profile) throw new OAuthError("oauth_identity_failed", "Google did not return an identity.");

  const sub = typeof profile.sub === "string" ? profile.sub.trim() : "";
  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  const emailVerified = profile.email_verified === true;

  if (!sub) throw new OAuthError("oauth_identity_failed", "Google returned an account without a subject.");
  if (!email) throw new OAuthError("oauth_identity_failed", "Google returned an account without an email address.");
  if (!emailVerified) {
    throw new OAuthError("oauth_unverified_email", "That Google account's email address is not verified.");
  }

  return {
    sub,
    email,
    emailVerified,
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : null,
    avatarUrl: typeof profile.picture === "string" && profile.picture.trim() ? profile.picture.trim() : null,
  };
}

/**
 * Where the OAuth flow drops the user afterwards.
 *
 * Only same-site *paths* are accepted (never an absolute URL and never a
 * protocol-relative `//evil.com`), so the callback cannot be turned into an
 * open redirect that bounces a freshly-authenticated user off-site.
 */
export function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.includes("\\") || raw.includes("#")) return "/";
  // Reject anything that could be re-interpreted as a scheme by the browser.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(raw)) return "/";
  // Control characters would make Node's header validation throw (a 500) or
  // let a raw newline reach `Location`.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(raw)) return "/";
  return raw;
}
