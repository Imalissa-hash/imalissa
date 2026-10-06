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

/**
 * Known database failures → an honest, actionable message.
 *
 * Prisma throws plain Error subclasses (code/meta, no import needed here so
 * this file stays bundle-safe). Without this mapping every DB failure fell
 * through to the generic 500 below — e.g. a lost race on a unique column
 * (P2002) showed "Something went wrong" instead of "already exists".
 * Internals (codes, SQL, stack) are never sent to the client.
 */
function databaseMessage(err: unknown): { status: number; message: string } | null {
  if (!(err instanceof Error)) return null;

  const code = (err as { code?: unknown }).code;
  // Only Prisma request codes (P2002, P2024, P1001, …) — never ENOENT etc.
  if (typeof code !== "string" || !/^P\d{3,4}$/.test(code)) {
    // Engine never started / cannot connect.
    return err.name === "PrismaClientInitializationError"
      ? {
          status: 503,
          message: "Could not reach the database just now. Please try again in a few seconds.",
        }
      : null;
  }

  switch (code) {
    // Unique constraint — the pre-flight check lost a race (double submit).
    case "P2002":
      return {
        status: 409,
        message:
          "That SKU or slug already exists — it may have just been saved. Refresh the page and try again.",
      };
    // Foreign key missing (selected category/brand was removed meanwhile).
    case "P2003":
      return {
        status: 400,
        message: "A selected item no longer exists. Refresh the page and try again.",
      };
    // Value out of range / data validation failed at the database.
    case "P2004":
    case "P2005":
    case "P2006":
    case "P2007":
    case "P2008":
    case "P2009":
    case "P2016":
    case "P2019":
      return { status: 400, message: "Some of the data sent was invalid. Check the form and try again." };
    // Record was deleted while the form was open.
    case "P2018":
    case "P2025":
      return {
        status: 404,
        message: "The record you were working on no longer exists. Refresh the page.",
      };
    // Table/column missing — configuration problem, not the user's fault.
    case "P2021":
    case "P2022":
      return {
        status: 503,
        message: "This action is temporarily unavailable. Please try again later.",
      };
    // Connection pool exhausted (busy instance).
    case "P2024":
      return {
        status: 503,
        message: "The server is busy right now. Please try again in a few seconds.",
      };
    // Cannot reach the database / request timed out.
    case "P1001":
    case "P1002":
    case "P1008":
    case "P1017":
      return {
        status: 503,
        message: "Could not reach the database just now. Please try again in a few seconds.",
      };
    default:
      return null; // unknown code → generic message, full error stays in the server log
  }
}

/** Never leak internals to clients. */
export function publicMessage(err: unknown): { status: number; message: string } {
  if (err instanceof ApiError) return { status: err.status, message: err.message };

  const db = databaseMessage(err);
  console.error("[api] unhandled error:", err);
  if (db) return db;

  return { status: 500, message: "Something went wrong. Please try again." };
}
