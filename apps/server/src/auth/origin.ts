/**
 * Cross-site request (CSRF) guard.
 *
 * The session cookie is `SameSite=Lax`, which already stops cross-site POSTs
 * from carrying it. This adds defence in depth on top: any state-changing API
 * request that arrives with an `Origin` header must come from a browser origin
 * the server recognises.
 *
 * Requests without an `Origin` header are allowed - browsers always attach one
 * to cross-origin and same-origin state-changing fetches, while server-to-server
 * callers (the e2e script, curl, tests) never send one.
 *
 * This is deliberately NOT a token-based scheme: SameSite + origin comparison
 * covers the browser threat model without a second secret the client must
 * store and echo back.
 */

import type { RequestHandler } from "express";
import { env } from "../env";
import { ApiError } from "../errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** `http://host[:port]` for the request as the client reached it. */
function requestOrigin(req: Parameters<RequestHandler>[0]): string {
  const host = req.get("host");
  if (!host) return "";
  return `${req.protocol}://${host}`;
}

export const sameOriginGuard: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  // No Origin: non-browser caller (or an ancient browser). SameSite still
  // applies to any cookie it would have attached.
  if (!origin) return next();

  const allowed = new Set<string>([
    ...env.corsOrigins,
    env.publicBaseUrl,
    env.auth.appBaseUrl,
    requestOrigin(req),
  ]);

  if (allowed.has(origin)) return next();

  next(
    ApiError.forbidden("This request originated from an untrusted origin and was rejected."),
  );
};
