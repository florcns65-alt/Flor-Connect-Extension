import { FlorError, isNetworkError } from "../shared/errors";
import { logger } from "../shared/logger";

export interface PostgrestErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

export function mapPostgrestError(error: PostgrestErrorLike): FlorError {
  const message = error.message ?? "";
  const status = error.status;
  if (status === 401 || error.code === "PGRST301" || /jwt|invalid claim|not authenticated/i.test(message)) {
    return new FlorError("signed_out", "Your session ended. Please sign in again.");
  }
  if (status === 403) {
    return new FlorError("not_member", "You don't have access to that workspace.");
  }
  if (error.code === "PGRST116") {
    return new FlorError("server", "That patient isn't available in this workspace.");
  }
  if (typeof status === "number" && status >= 500) {
    return new FlorError("server", "FLOR had a problem. Please try again.");
  }
  logger.warn("Data request failed", { code: error.code ?? "unknown", status: status ?? 0 });
  return new FlorError("server", "FLOR couldn't complete that request.");
}

export function mapDataError(error: unknown): FlorError {
  if (error instanceof FlorError) return error;
  if (isNetworkError(error)) {
    return new FlorError("network", "You're offline, or FLOR couldn't be reached.");
  }
  if (isPostgrestError(error)) return mapPostgrestError(error);
  return new FlorError("server", "FLOR couldn't complete that request.");
}

function isPostgrestError(error: unknown): error is PostgrestErrorLike {
  return Boolean(error && typeof error === "object" && "message" in error);
}
