import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/shared/manifest";
import {
  assertNewerThanPublished,
  assertStoreManifest,
  compareChromeVersions,
  credentialsFromEnv,
  publishExtension,
  readManifestFromZip,
  redactSecrets,
  type WebStoreCredentials,
  type WebStoreFetch,
  type WebStoreResponse,
} from "../src/webstore/publish";

const credentials: WebStoreCredentials = {
  clientId: "client-id-value",
  clientSecret: "client-secret-value",
  refreshToken: "refresh-token-value",
  extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  publisherId: "123456789012",
};

function jsonResponse(status: number, body: unknown): WebStoreResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function manifest(version = "2.0.0") {
  return { version };
}

describe("Chrome versions", () => {
  it("compares the numeric components and treats missing ones as zero", () => {
    expect(compareChromeVersions("2.0.0", "1.1.1")).toBe(1);
    expect(compareChromeVersions("1.1.1", "2.0.0")).toBe(-1);
    expect(compareChromeVersions("2.0.0", "2.0.0.0")).toBe(0);
    expect(compareChromeVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareChromeVersions("2.0.10", "2.0.9")).toBe(1);
  });

  it("rejects a store manifest at or below 1.1.1 and one that still has the key", () => {
    expect(() => assertStoreManifest({ version: "1.1.1" })).toThrow(/higher than 1.1.1/);
    expect(() => assertStoreManifest({ version: "1.0.0" })).toThrow(/higher than 1.1.1/);
    expect(() => assertStoreManifest({ version: "2.0.0", key: "public-key" })).toThrow(/must not include the manifest key/);
    expect(() => assertStoreManifest({ version: "2.0.0" })).not.toThrow();
    const storeManifest = buildManifest({
      version: "2.0.0",
      store: true,
      supabaseUrl: "https://wbxzevwfxizfjtxrarjq.supabase.co",
      florOrigin: "https://florcns.com",
      sidePanelPath: "src/ui/sidepanel.html",
    });
    expect(storeManifest.key).toBeUndefined();
    expect(() => assertStoreManifest(storeManifest)).not.toThrow();
  });

  it("fails when the package is not newer than a version already on the item", () => {
    expect(() => assertNewerThanPublished("2.0.0", ["1.1.1"])).not.toThrow();
    expect(() => assertNewerThanPublished("2.0.0", ["1.1.1", "2.0.0"])).toThrow(/higher than 2.0.0/);
    expect(() => assertNewerThanPublished("2.0.1", ["2.0.0"])).not.toThrow();
  });
});

describe("publishExtension", () => {
  it("does not call Google when the version is not newer than 1.1.1", async () => {
    const fetchImpl: WebStoreFetch = async () => {
      throw new Error("should not be called");
    };
    await expect(
      publishExtension({
        manifest: manifest("1.1.1"),
        zip: new Uint8Array([1, 2, 3]),
        target: "default",
        credentials,
        fetch: fetchImpl,
      }),
    ).rejects.toThrow(/higher than 1.1.1/);
  });

  it("uploads a draft and does not publish", async () => {
    const calls: string[] = [];
    const logs: string[] = [];
    const fetchImpl: WebStoreFetch = async (url) => {
      calls.push(url);
      if (url.includes("oauth2.googleapis.com")) return jsonResponse(200, { access_token: "ya29.super-secret-access" });
      if (url.endsWith(":fetchStatus")) {
        return jsonResponse(200, {
          publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "1.1.1" }] },
        });
      }
      if (url.endsWith(":upload")) return jsonResponse(200, { uploadState: "SUCCEEDED", crxVersion: "2.0.0" });
      if (url.endsWith(":publish")) return jsonResponse(200, { state: "PUBLISHED" });
      return jsonResponse(500, { error: "unexpected" });
    };
    const result = await publishExtension({
      manifest: manifest(),
      zip: new Uint8Array([1]),
      target: "draft-only",
      credentials,
      fetch: fetchImpl,
      log: (line) => logs.push(line),
    });
    expect(result).toEqual({ uploadedVersion: "2.0.0", published: false });
    expect(calls.some((url) => url.endsWith(":upload"))).toBe(true);
    expect(calls.some((url) => url.endsWith(":publish"))).toBe(false);
    expect(logs.join("\n")).not.toContain("refresh-token-value");
    expect(logs.join("\n")).not.toContain("ya29.super-secret-access");
  });

  it("publishes only after a newer upload when the target is not draft-only", async () => {
    const published: string[] = [];
    const fetchImpl: WebStoreFetch = async (url, init) => {
      if (url.endsWith(":publish")) published.push(String(init?.body ?? ""));
      if (url.includes("oauth2.googleapis.com")) return jsonResponse(200, { access_token: "ya29.token" });
      if (url.endsWith(":fetchStatus")) {
        return jsonResponse(200, {
          publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "1.1.1" }] },
        });
      }
      if (url.endsWith(":upload")) return jsonResponse(200, { uploadState: "UPLOAD_IN_PROGRESS" });
      return jsonResponse(200, {});
    };
    let polls = 0;
    const fetching: WebStoreFetch = async (url, init) => {
      if (url.endsWith(":fetchStatus")) {
        polls += 1;
        if (polls > 1) return jsonResponse(200, { lastAsyncUploadState: "SUCCEEDED" });
      }
      return fetchImpl(url, init);
    };
    const trusted = await publishExtension({
      manifest: manifest(),
      zip: new Uint8Array([1]),
      target: "trustedTesters",
      credentials,
      fetch: fetching,
      sleep: async () => undefined,
      pollMs: 0,
    });
    expect(trusted.published).toBe(true);
    expect(published).toEqual([JSON.stringify({ publishType: "DEFAULT_PUBLISH" })]);
    expect(polls).toBeGreaterThan(1);
  });

  it("stops before upload when the item already has this version", async () => {
    const calls: string[] = [];
    const fetchImpl: WebStoreFetch = async (url) => {
      calls.push(url);
      if (url.includes("oauth2.googleapis.com")) return jsonResponse(200, { access_token: "ya29.token" });
      return jsonResponse(200, {
        publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "2.0.0" }] },
      });
    };
    await expect(
      publishExtension({
        manifest: manifest(),
        zip: new Uint8Array([1]),
        target: "default",
        credentials,
        fetch: fetchImpl,
      }),
    ).rejects.toThrow(/higher than 2.0.0/);
    expect(calls.some((url) => url.endsWith(":upload"))).toBe(false);
  });

  it("redacts secrets when Google echoes them in an error", async () => {
    const fetchImpl: WebStoreFetch = async () =>
      jsonResponse(400, { error: "invalid_grant", refresh_token: "refresh-token-value", access_token: "ya29.super-secret-access" });
    await expect(
      publishExtension({
        manifest: manifest(),
        zip: new Uint8Array([1]),
        target: "default",
        credentials,
        fetch: fetchImpl,
      }),
    ).rejects.toThrow(/invalid_grant/);
    try {
      await publishExtension({
        manifest: manifest(),
        zip: new Uint8Array([1]),
        target: "default",
        credentials,
        fetch: fetchImpl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).not.toContain("refresh-token-value");
      expect(message).not.toContain("client-secret-value");
      expect(message).not.toContain("ya29.super-secret-access");
      expect(message).toContain("[redacted]");
    }
  });
});

describe("credentials and the zip checker", () => {
  it("names a missing secret and does not accept a bad extension id", () => {
    expect(() => credentialsFromEnv({})).toThrow(/Missing CWS_CLIENT_ID/);
    expect(() =>
      credentialsFromEnv({
        CWS_CLIENT_ID: "id",
        CWS_CLIENT_SECRET: "secret",
        CWS_REFRESH_TOKEN: "refresh",
        CWS_EXTENSION_ID: "not-an-id",
        CWS_PUBLISHER_ID: "123456789012",
      }),
    ).toThrow(/32-character/);
  });

  it("reads a store manifest from a zip and the checker rejects a key", () => {
    const directory = mkdtempSync(join(tmpdir(), "flor-store-"));
    const good = join(directory, "good.zip");
    const bad = join(directory, "bad.zip");
    writeFileSync(join(directory, "manifest.json"), JSON.stringify({ version: "2.0.0", name: "FLOR Connect" }));
    execFileSync("zip", ["-q", "-j", good, join(directory, "manifest.json")]);
    expect(readManifestFromZip(good)).toMatchObject({ version: "2.0.0" });
    const check = (zipPath: string) => {
      try {
        const output = execFileSync("node", ["--experimental-strip-types", "scripts/webstore-cli.ts", "--check", zipPath], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        return { ok: true, output };
      } catch (error) {
        const failed = error as { stdout?: string; stderr?: string };
        return { ok: false, output: `${failed.stdout ?? ""}\n${failed.stderr ?? ""}` };
      }
    };
    const passed = check(good);
    expect(passed.ok).toBe(true);
    expect(passed.output).toMatch(/2\.0\.0/);

    writeFileSync(join(directory, "manifest.json"), JSON.stringify({ version: "2.0.0", key: "should-not-ship" }));
    execFileSync("zip", ["-q", "-j", bad, join(directory, "manifest.json")]);
    const failed = check(bad);
    expect(failed.ok).toBe(false);
    expect(failed.output).toMatch(/must not include the manifest key/);
  });
});

describe("redactSecrets", () => {
  it("removes long secrets and bearer tokens", () => {
    const text = "Bearer ya29.super-secret-access used refresh-token-value";
    const redacted = redactSecrets(text, ["refresh-token-value", "ya29.super-secret-access"]);
    expect(redacted).not.toContain("refresh-token-value");
    expect(redacted).not.toContain("ya29.super-secret-access");
  });
});
