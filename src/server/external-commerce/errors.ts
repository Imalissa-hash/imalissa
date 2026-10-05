/**
 * Typed errors for the external commerce integration.
 *
 * The single most important property: `ambiguous`.
 *
 *   ambiguous = false → the external system definitely did NOT create the
 *                       order → a retry is safe.
 *   ambiguous = true  → we do NOT know (timeout, network drop, HTTP 5xx)
 *                       → the external system MAY have created the order.
 *                       A blind retry could create a duplicate, so the
 *                       order is parked in SYNC_TIMEOUT and requires
 *                       verification (lookupOrder) or manual admin action.
 */

export type ExternalErrorCode =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "NETWORK"
  | "AUTH"
  | "VALIDATION"
  | "RATE_LIMIT"
  | "SERVER"
  | "NOT_SUPPORTED"
  | "UNKNOWN";

export class ExternalCommerceError extends Error {
  code: ExternalErrorCode;
  ambiguous: boolean;
  status?: number;
  /** Sanitized response body (safe to persist). */
  body?: unknown;

  constructor(
    code: ExternalErrorCode,
    message: string,
    opts: { ambiguous?: boolean; status?: number; body?: unknown; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "ExternalCommerceError";
    this.code = code;
    this.ambiguous = opts.ambiguous ?? false;
    this.status = opts.status;
    this.body = opts.body;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export const notConfigured = (msg: string) => new ExternalCommerceError("NOT_CONFIGURED", msg);
export const notSupported = (msg: string) =>
  new ExternalCommerceError("NOT_SUPPORTED", msg, { ambiguous: false });

/** Which sync status an error maps to on the Order row. */
export function statusForError(err: ExternalCommerceError): "FAILED" | "SYNC_TIMEOUT" | "NOT_CONFIGURED" {
  if (err.code === "NOT_CONFIGURED" || err.code === "NOT_SUPPORTED") return "NOT_CONFIGURED";
  if (err.ambiguous) return "SYNC_TIMEOUT";
  return "FAILED";
}
