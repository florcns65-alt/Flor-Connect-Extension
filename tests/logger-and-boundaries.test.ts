import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeGoogleSignIn } from "../src/auth/sign-in";
import { mapPostgrestError } from "../src/api/map-error";
import { parseWithSchema, PersonRowSchema } from "../src/api/schemas";
import { logger } from "../src/shared/logger";

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqYW5lIn0.c2lnbmF0dXJl";
const EMAIL = "jane.doe@example.com";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("logger redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts JWTs, emails, and patient-like fields", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logger.info(`session ${TOKEN} for ${EMAIL}`, {
      first_name: "Jane",
      last_name: "Doe",
      date_of_birth: "1984-03-12",
      mrn: "10428",
      phone: "555-0100",
      address_line1: "1 Main",
      email: EMAIL,
      nested: { name: "Jane Doe" },
      count: 1,
    });
    const printed = JSON.stringify(spy.mock.calls);
    expect(printed).not.toContain(TOKEN);
    expect(printed).not.toContain(EMAIL);
    expect(printed).not.toContain("Jane");
    expect(printed).not.toContain("10428");
    expect(printed).not.toContain("555-0100");
    expect(printed).not.toContain("1984-03-12");
    expect(printed).toContain("[redacted-jwt]");
    expect(printed).toContain("[redacted-email]");
    expect(printed).toContain("[redacted]");
    expect(printed).toContain("1");
  });
});

describe("auth and api consoles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not print tokens or patient fields from auth and api paths", async () => {
    const calls: unknown[][] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });
    }
    mapPostgrestError({ status: 401, message: `bad ${TOKEN}` });
    expect(() => parseWithSchema(PersonRowSchema, { first_name: "Jane Doe", mrn: "10428", email: EMAIL })).toThrow();
    await expect(
      completeGoogleSignIn({
        getRedirectURL: () => "https://bmjkikhmfmaieahonelaljfkeapiflah.chromiumapp.org/auth",
        signInWithOAuth: async () => ({ data: { url: `https://example.test/?token=${TOKEN}` }, error: null }),
        launchWebAuthFlow: async () => {
          throw new Error(`The user did not approve access. ${TOKEN} ${EMAIL}`);
        },
        exchangeCodeForSession: async () => {
          throw new Error("should not exchange");
        },
      }),
    ).rejects.toThrow();
    const printed = JSON.stringify(calls);
    expect(printed).not.toContain(TOKEN);
    expect(printed).not.toContain(EMAIL);
    expect(printed).not.toContain("Jane Doe");
    expect(printed).not.toContain("10428");
  });

  it("keeps console calls out of the extension source except the redacting logger", () => {
    const offenders = walk("src").filter((path) => {
      if (path.endsWith("src/shared/logger.ts")) return false;
      const source = readFileSync(path, "utf8");
      return /console\.(log|info|warn|error|debug|trace)\s*\(/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});

describe("PHI boundaries", () => {
  it("does not persist patient fields or use web storage", () => {
    const files = walk("src");
    const storageMentions = files.filter((path) => readFileSync(path, "utf8").includes("chrome.storage"));
    expect(storageMentions.map((path) => path.replaceAll("\\", "/"))).toEqual(["src/auth/storage.ts"]);
    const storageSource = readFileSync("src/auth/storage.ts", "utf8");
    expect(storageSource).not.toMatch(/first_name|date_of_birth|mrn|phone|address_line1/);
    const webStorage = files.filter((path) => /localStorage|sessionStorage/.test(readFileSync(path, "utf8")));
    expect(webStorage).toEqual([]);
    expect(readFileSync("src/ui/store.ts", "utf8")).not.toContain("persist");
  });

  it("keeps the publishable key as a placeholder in config", () => {
    for (const name of ["config/preview.json", "config/prod.json"]) {
      const config = JSON.parse(readFileSync(name, "utf8")) as { supabasePublishableKey: string };
      expect(config.supabasePublishableKey).toBe("__SUPABASE_PUBLISHABLE_KEY__");
      expect(JSON.stringify(config)).not.toContain("service_role");
    }
  });
});
