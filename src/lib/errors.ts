/**
 * Central API error type + helpers for route handlers.
 */

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = "ApiError";
  }
}

export const badRequest = (msg = "Invalid request", details?: unknown) =>
  new ApiError(400, msg, details);
export const unauthorized = (msg = "Please log in to continue") => new ApiError(401, msg);
export const forbidden = (msg = "You do not have permission to do that") => new ApiError(403, msg);
export const notFound = (msg = "Not found") => new ApiError(404, msg);
export const conflict = (msg = "Conflict") => new ApiError(409, msg);
export const tooMany = (msg = "Too many requests. Please slow down.") => new ApiError(429, msg);
export const serverError = (msg = "Something went wrong. Please try again.") =>
  new ApiError(500, msg);
/** A real integration exists but its credentials are missing — never fake success. */
export const notConfigured = (msg = "This integration is not configured yet") =>
  new ApiError(503, msg);

/** Never leak internals to clients. */
export function publicMessage(err: unknown): { status: number; message: string } {
  if (err instanceof ApiError) return { status: err.status, message: err.message };
  console.error("[api] unhandled error:", err);
  return { status: 500, message: "Something went wrong. Please try again." };
}
