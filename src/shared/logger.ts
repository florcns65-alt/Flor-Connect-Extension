const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const PHI_FIELD = /name|dob|date_of_birth|mrn|phone|address|email|postal|insurance|birth/i;

function redactString(value: string): string {
  return value
    .replace(BEARER, "Bearer [redacted]")
    .replace(JWT, "[redacted-jwt]")
    .replace(EMAIL, "[redacted-email]");
}

export function isSensitiveField(key: string): boolean {
  return PHI_FIELD.test(key);
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (typeof value !== "object") return "[redacted]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = isSensitiveField(key) ? "[redacted]" : redact(entry, seen);
  }
  return output;
}

function write(method: "debug" | "info" | "warn" | "error", message: string, extra?: unknown): void {
  const safeMessage = redactString(message);
  if (extra === undefined) console[method](safeMessage);
  else console[method](safeMessage, redact(extra));
}

export const logger = {
  debug(message: string, extra?: unknown) {
    write("debug", message, extra);
  },
  info(message: string, extra?: unknown) {
    write("info", message, extra);
  },
  warn(message: string, extra?: unknown) {
    write("warn", message, extra);
  },
  error(message: string, extra?: unknown) {
    write("error", message, extra);
  },
};
