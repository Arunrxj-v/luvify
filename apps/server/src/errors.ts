/**
 * HTTP error plumbing: a small `ApiError`, an async route wrapper (Express 4
 * does not catch rejected promises), request validation helpers and the final
 * error middleware that renders every failure as `ApiErrorDto`.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "bad_request", message, details);
  }

  /** Required authentication is missing, expired or invalid (401). */
  static unauthorized(message = "Authentication required", code = "unauthorized"): ApiError {
    return new ApiError(401, code, message);
  }

  /**
   * Authenticated, but not allowed to act on this resource (403).
   *
   * Project routes deliberately prefer `notFound` instead: a 403 confirms that
   * an id exists, which is exactly the enumeration this API must not provide.
   */
  static forbidden(message = "You do not have access to this resource"): ApiError {
    return new ApiError(403, "forbidden", message);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, "not_found", message);
  }

  static conflict(message: string, code = "conflict"): ApiError {
    return new ApiError(409, code, message);
  }

  /** Configuration problem on the server (503) - e.g. OAuth not set up. */
  static unavailable(message: string, code = "not_configured"): ApiError {
    return new ApiError(503, code, message);
  }
}

type RouteHandler = (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>;

/** Wraps a handler so rejections reach the error middleware (Express 4). */
export function apiHandler(handler: RouteHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Parses `value` with `schema`, converting failures into a 400 response. */
export function parseWith<S extends ZodTypeAny>(schema: S, value: unknown, what = "Request body"): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ApiError.badRequest(`${what} failed validation`, result.error.flatten());
  }
  return result.data;
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route for ${req.method} ${req.path}`));
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: "validation_error", message: "Payload failed validation", details: error.flatten() },
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: { code: "invalid_json", message: "Request body is not valid JSON" } });
    return;
  }

  console.error("[api] unhandled error:", error);
  res.status(500).json({ error: { code: "internal_error", message: "Internal server error" } });
}
