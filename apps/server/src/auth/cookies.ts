/**
 * Minimal cookie helpers.
 *
 * Express 4 ships no cookie parser and this project deliberately adds no extra
 * runtime dependency for a job that is a dozen lines: reading `Set-Cookie` /
 * `Cookie` by hand keeps the dependency surface (and therefore the audit
 * surface) exactly where Phase 2 left it.
 */

import type { Response } from "express";

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  /** Seconds from now. */
  maxAge?: number;
}

/** Parses a `Cookie` request header into a plain object (last value wins). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  if (!header) return jar;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      jar[name] = decodeURIComponent(raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw);
    } catch {
      jar[name] = raw;
    }
  }
  return jar;
}

/** Value for a single `Set-Cookie` header. */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

/**
 * Appends a `Set-Cookie` header without clobbering cookies already queued on
 * the response (the OAuth flow sets two at once).
 */
export function appendCookie(res: Response, cookie: string): void {
  const existing = res.getHeader("Set-Cookie");
  if (existing === undefined) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  const list = Array.isArray(existing) ? existing.slice() : [String(existing)];
  list.push(cookie);
  res.setHeader("Set-Cookie", list);
}

/** Session cookies are cleared with an expired `Max-Age=0` twin. */
export function clearCookie(res: Response, name: string, options: CookieOptions = {}): void {
  appendCookie(res, serializeCookie(name, "", { ...options, maxAge: 0 }));
}
