export const ERROR_CODES = [
  "signed_out",
  "legal_required",
  "not_member",
  "feature_off",
  "site_blocked",
  "stale_revision",
  "network",
  "server",
  "cancelled",
  "validation",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class FlorError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "FlorError";
    this.code = code;
  }
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return error.name === "AbortError" || /failed to fetch|network|offline|aborted/i.test(error.message);
  }
  return false;
}

export function mapUnknownError(error: unknown): FlorError {
  if (error instanceof FlorError) return error;
  if (isNetworkError(error)) {
    return new FlorError("network", "You're offline, or FLOR couldn't be reached.");
  }
  return new FlorError("server", "Something went wrong. Please try again.");
}
