/**
 * Authentication routes: email/password sign up, sign in, sign out, the
 * current session, and the Google OAuth hand-off.
 *
 * Everything here issues the *same* session (one cookie, one `Session` row), so
 * email/password and Google users are indistinguishable to every protected
 * route downstream.
 *
 * Responses never contain a password hash, an OAuth secret, a session token or
 * a bearer credential of any kind - the credential lives only in an httpOnly
 * cookie.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import {
  DemoLoginRequestSchema,
  LoginRequestSchema,
  SignupRequestSchema,
  type AuthResponseDto,
  type LogoutResponseDto,
  type MeResponseDto,
} from "@luvify/shared";
import type { User } from "@prisma/client";
import {
  authorizationUrl,
  beginState,
  consumeState,
  exchangeCode,
  fetchIdentity,
  OAuthError,
  safeRedirectPath,
} from "../auth/oauth";
import { burnPasswordTime, hashPassword, needsRehash, verifyPassword } from "../auth/passwords";
import {
  clearSessionCookie,
  loadSession,
  readSessionToken,
  revokeSession,
  setSessionCookie,
  startSession,
} from "../auth/session";
import { env } from "../env";
import { ApiError, apiHandler, parseWith } from "../errors";
import { prisma } from "../prisma";
import { ensureDemoUser, toUserDto } from "../store";

export const authRouter = Router();

/**
 * Stricter budget than the general API limiter: credential endpoints are the
 * only place a caller can spend server CPU on purpose (scrypt) and the only
 * place worth brute-forcing. Configurable so CI can raise it instead of
 * working around it.
 *
 * Only the two read endpoints are exempt - `/providers` and `/me` are read on
 * every app boot, and letting a handful of reloads from one shared office IP
 * exhaust the budget would lock everyone behind it out of signing in. Every
 * other request (including `GET /google` and its callback, which spend a
 * server-side token exchange) keeps counting towards the budget.
 */
authRouter.use(
  rateLimit({
    windowMs: 5 * 60_000,
    max: env.auth.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      if (req.method !== "GET" && req.method !== "HEAD") return false;
      const path = (req.originalUrl.split("?")[0] ?? "").replace(/\/$/, "");
      return path.endsWith("/api/auth/me") || path.endsWith("/api/auth/providers");
    },
    message: {
      error: {
        code: "rate_limited",
        message: "Too many attempts. Please wait a few minutes and try again.",
      },
    },
  }),
);

/** Which sign-in methods this deployment offers - presence only, no secrets. */
authRouter.get(
  "/providers",
  apiHandler(async (_req, res) => {
    res.json({ google: env.auth.google.enabled, password: true });
  }),
);

function authResponse(user: User, expiresAt: Date): AuthResponseDto {
  return { user: toUserDto(user), expiresAt: expiresAt.toISOString() };
}

async function issueSession(req: Request, res: Response, user: User) {
  const session = await startSession(user, req);
  setSessionCookie(res, session.token, session.expiresAt);
  return session;
}

/** Prisma unique-constraint violation, detected without importing its class. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** How the account can be signed into - never the credentials themselves. */
function providerOf(user: User): MeResponseDto["provider"] {
  const password = Boolean(user.passwordHash);
  const google = Boolean(user.googleId);
  if (password && google) return "password+google";
  if (google) return "google";
  return "password";
}

// --- POST /api/auth/signup --------------------------------------------------

authRouter.post(
  "/signup",
  apiHandler(async (req, res) => {
    const input = parseWith(SignupRequestSchema, req.body);
    // `SignupRequestSchema` already trimmed + lower-cased, so this lookup and
    // the row written below use the exact same normalized form.
    const email = input.email;

    const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (clash) {
      // Spend the same scrypt work as a successful signup before answering, so
      // a taken address is not measurably faster to probe than a free one. The
      // message is deliberately generic; the 409 status itself is unavoidable
      // because duplicates must be rejected outright.
      await burnPasswordTime(input.password);
      throw ApiError.conflict(
        "That email address cannot be used to create an account. If you already have one, sign in instead.",
        "email_unavailable",
      );
    }

    const passwordHash = await hashPassword(input.password);
    let user: User;
    try {
      user = await prisma.user.create({
        data: { email, name: input.name, passwordHash, role: "OWNER" },
      });
    } catch (error) {
      // Unique constraint race: two concurrent signups for the same address.
      if (isUniqueViolation(error)) {
        throw ApiError.conflict(
          "That email address cannot be used to create an account. If you already have one, sign in instead.",
          "email_unavailable",
        );
      }
      throw error;
    }

    const session = await issueSession(req, res, user);
    res.status(201).json(authResponse(user, session.expiresAt));
  }),
);

// --- POST /api/auth/login ---------------------------------------------------

authRouter.post(
  "/login",
  apiHandler(async (req, res) => {
    const input = parseWith(LoginRequestSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    // One code path for "no such account", "Google-only account" and "wrong
    // password": all three cost the same scrypt work and answer identically,
    // so neither the response nor its timing reveals whether the email exists.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? null);
    if (!user || !user.passwordHash || !valid) {
      throw ApiError.unauthorized("Invalid email or password", "invalid_credentials");
    }

    if (needsRehash(user.passwordHash)) {
      // Transparent upgrade if the cost parameters ever move.
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.password) },
      });
    }

    const session = await issueSession(req, res, user);
    res.json(authResponse(user, session.expiresAt));
  }),
);

// --- POST /api/auth/logout --------------------------------------------------

authRouter.post(
  "/logout",
  apiHandler(async (req, res) => {
    const token = readSessionToken(req);
    // Revoke first: even if the browser ignores the clearing Set-Cookie, the
    // row is already gone and the cookie no longer resolves.
    if (token) await revokeSession(token);
    clearSessionCookie(res);
    const body: LogoutResponseDto = { ok: true };
    res.json(body);
  }),
);

// --- GET /api/auth/me -------------------------------------------------------

authRouter.get(
  "/me",
  apiHandler(async (req, res) => {
    const token = readSessionToken(req);
    if (!token) throw ApiError.unauthorized();
    const session = await loadSession(token);
    if (!session) throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    const body: MeResponseDto = { user: toUserDto(session.user), provider: providerOf(session.user) };
    res.json(body);
  }),
);

// --- GET /api/auth/google ---------------------------------------------------

authRouter.get(
  "/google",
  apiHandler(async (req, res) => {
    if (!env.auth.google.enabled) {
      throw ApiError.unavailable("Google sign-in is not configured on this server.", "google_not_configured");
    }
    // The destination rides inside the signed state, so it is verified by the
    // time the callback reads it back - never taken from a query parameter.
    const state = beginState(res, safeRedirectPath(req.query.redirect));
    res.redirect(302, authorizationUrl(state, env.auth.google.redirectUri));
  }),
);

// --- GET /api/auth/google/callback ------------------------------------------

/** Failures land back on the app so the login screen can explain them. */
function oauthFailure(res: Response, code: string): void {
  res.redirect(302, `${env.auth.appBaseUrl}/?auth_error=${encodeURIComponent(code)}`);
}

authRouter.get(
  "/google/callback",
  apiHandler(async (req, res) => {
    if (!env.auth.google.enabled) return oauthFailure(res, "google_not_configured");

    const failure = typeof req.query.error === "string" ? req.query.error : null;
    if (failure) return oauthFailure(res, failure === "access_denied" ? "cancelled" : "oauth_failed");

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const stateParam = typeof req.query.state === "string" ? req.query.state : null;
    // Order matters: verify the state *before* spending a token exchange on it.
    const state = code ? consumeState(req, res, stateParam) : null;
    if (!code || !state) return oauthFailure(res, "invalid_state");

    try {
      const { accessToken } = await exchangeCode(code, env.auth.google.redirectUri);
      const identity = await fetchIdentity(accessToken);

      const user = await upsertGoogleUser(identity);
      const session = await startSession(user, req);
      setSessionCookie(res, session.token, session.expiresAt);
      res.redirect(302, `${env.auth.appBaseUrl}${state.redirect}`);
      return;
    } catch (error) {
      if (error instanceof OAuthError) return oauthFailure(res, error.code);
      console.error("[auth] google callback failed:", error instanceof Error ? error.message : error);
      return oauthFailure(res, "oauth_failed");
    }
  }),
);

/**
 * Creates or reuses the local account for a *Google-verified* identity.
 *
 * Resolution order:
 *   1. existing row with this `googleId`  -> sign in
 *   2. existing row with this email but no Google link and no password
 *      -> link Google to it, then sign in
 *   3. otherwise create the account
 *
 * Step 2 deliberately does *not* cover password accounts. `POST /signup` never
 * verifies the address, so an attacker can pre-register a victim's email; if
 * Google were then merged into that row, the victim would be signed into the
 * attacker's account (account pre-hijacking) and the attacker could afterwards
 * read everything the victim created there. Google's `email_verified` proves
 * control of the address *now* - not that this local row belongs to it - so the
 * merge is refused and the user is told to sign in with their password.
 */
async function upsertGoogleUser(identity: {
  sub: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}): Promise<User> {
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: identity.sub } });
  if (byGoogleId) {
    // Refresh the profile picture / display name from the authoritative source.
    return prisma.user.update({
      where: { id: byGoogleId.id },
      data: {
        ...(identity.avatarUrl && byGoogleId.avatarUrl !== identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
        ...(identity.name && byGoogleId.name !== identity.name ? { name: identity.name } : {}),
      },
    });
  }

  const byEmail = await prisma.user.findUnique({ where: { email: identity.email } });
  if (byEmail) {
    if (byEmail.googleId && byEmail.googleId !== identity.sub) {
      throw new OAuthError("account_conflict", "That email address is linked to a different Google account.");
    }
    if (byEmail.passwordHash && !byEmail.googleId) {
      throw new OAuthError(
        "account_exists_password",
        "An account with this email address already uses a password. Sign in with your email and password instead.",
      );
    }
    return prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: identity.sub,
        ...(byEmail.avatarUrl ? {} : identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
      },
    });
  }

  return prisma.user.create({
    data: {
      email: identity.email,
      name: identity.name ?? identity.email.split("@")[0] ?? identity.email,
      googleId: identity.sub,
      avatarUrl: identity.avatarUrl,
      role: "OWNER",
    },
  });
}

// --- POST /api/auth/demo-login (development convenience) --------------------

/**
 * Phase 2 leftover, preserved but locked down.
 *
 * It used to hand out a bearer token for the shared demo account to anyone who
 * asked - which, once projects are owned, would hand them every demo project.
 * It now issues a normal session (same cookie, same revocation) and only exists
 * outside production/staging: the gate is an *allowlist* of NODE_ENV values, so
 * a misconfigured deployment answers 404 rather than falling through, and the
 * caller can no longer rewrite the shared account's email (a squatted address
 * there would otherwise feed the Google account-linking rules above).
 */
authRouter.post(
  "/demo-login",
  apiHandler(async (req, res) => {
    if (env.nodeEnv !== "development" && env.nodeEnv !== "test") throw ApiError.notFound();
    const input = parseWith(DemoLoginRequestSchema, req.body);
    const base = await ensureDemoUser();
    const user =
      input.name && input.name !== base.name
        ? await prisma.user.update({ where: { id: base.id }, data: { name: input.name } })
        : base;
    const session = await issueSession(req, res, user);
    res.json(authResponse(user, session.expiresAt));
  }),
);
