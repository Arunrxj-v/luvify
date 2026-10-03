/**
 * Authentication middleware.
 *
 * `requireAuth` reads the session cookie, resolves it against the database and
 * attaches the resulting user to the request. It never throws a 500: an
 * expired, forged or absent session is always a plain 401, and the database
 * layer is the single source of truth for whether a session is still valid.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { User } from "@prisma/client";
import { ApiError } from "../errors";
import { clearSessionCookie, loadSession, readSessionToken } from "./session";

/** Everything a route is allowed to assume about an authenticated request. */
export interface AuthContext {
  user: User;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `optionalAuth` / `requireAuth`. Absent for anonymous requests. */
      auth?: AuthContext;
    }
  }
}

/** Narrow a request that already passed `requireAuth`. */
export function authed(req: Request): AuthContext {
  const context = req.auth;
  if (!context?.user) throw ApiError.unauthorized();
  return context;
}

/** The authenticated user's id - the only authority on project ownership. */
export function currentUserId(req: Request): string {
  return authed(req).user.id;
}

/**
 * Resolves the session when one is present but does not reject anonymous
 * callers. Used wherever the session only changes the response, never gates it.
 */
export const optionalAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = readSessionToken(req);
    if (!token) return next();
    const session = await loadSession(token);
    if (!session) {
      clearSessionCookie(res);
      return next();
    }
    req.auth = { user: session.user };
    return next();
  } catch (error) {
    return next(error);
  }
};

/** 401 unless a live session exists. Mounted once in front of every project route. */
export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = readSessionToken(req);
    if (!token) throw ApiError.unauthorized();
    const session = await loadSession(token);
    if (!session) {
      clearSessionCookie(res);
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }
    req.auth = { user: session.user };
    return next();
  } catch (error) {
    return next(error);
  }
};
