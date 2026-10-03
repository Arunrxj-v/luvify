/**
 * Server-side sessions.
 *
 * The browser only ever holds an opaque 256-bit random token inside an
 * httpOnly cookie; the database stores its SHA-256. That split means:
 *
 *   * JavaScript (and therefore any XSS) can never read the token,
 *   * a dump of the `Session` table yields hashes, not usable cookies,
 *   * deleting the row logs the user out immediately - logout is a real
 *     invalidation, not just a client-side cookie drop.
 *
 * Sessions are shared by email/password and Google sign-in: there is exactly
 * one session mechanism, so every protected route treats them identically.
 */

import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { User } from "@prisma/client";
import { env } from "../env";
import { prisma } from "../prisma";
import { appendCookie, clearCookie, parseCookies, serializeCookie } from "./cookies";

const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + env.auth.sessionDays * 24 * 60 * 60 * 1000);
}

/** Issued on every successful login/signup/OAuth callback. */
export async function startSession(
  user: Pick<User, "id">,
  req: Request,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = sessionExpiry();
  const userAgent = req.get("user-agent");
  const ip = req.ip;

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      // Opportunistic housekeeping: drop this account's own expired rows so a
      // long-lived deployment does not accumulate them forever.
      ...(userAgent ? { userAgent: userAgent.slice(0, 300) } : {}),
      ...(ip ? { ip: ip.slice(0, 64) } : {}),
    },
  });
  // Runs after the insert so a failure here can never void a fresh login.
  await prisma.session.deleteMany({
    where: { userId: user.id, expiresAt: { lte: new Date() } },
  });
  return { token, expiresAt };
}

/** Resolves a cookie token to its live session, or null. Expired rows are deleted. */
export async function loadSession(
  token: string,
): Promise<{ user: User; expiresAt: Date } | null> {
  if (token.length < 20 || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return { user: session.user, expiresAt: session.expiresAt };
}

/** Logout: the row goes first, so the cookie alone can never resurrect it. */
export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export function readSessionToken(req: Request): string | null {
  const jar = parseCookies(req.headers.cookie);
  const token = jar[env.auth.sessionCookieName];
  return token && token.length > 0 ? token : null;
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.auth.cookieSecure,
    sameSite: "Lax" as const,
    path: "/",
  };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  appendCookie(res, serializeCookie(env.auth.sessionCookieName, token, { ...baseCookieOptions(), maxAge }));
}

export function clearSessionCookie(res: Response): void {
  clearCookie(res, env.auth.sessionCookieName, baseCookieOptions());
}
