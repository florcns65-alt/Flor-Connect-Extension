import { execFileSync } from "node:child_process";

/** The live placeholder on item lkjfhjkgfbonfnlchglghoialgiipbid. A store build must be newer. */
export const STORE_VERSION_FLOOR = "1.1.1";

export const PUBLISH_TARGETS = ["draft-only", "trustedTesters", "default"] as const;
export type PublishTarget = (typeof PUBLISH_TARGETS)[number];

const CHROME_VERSION = /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_POLLS = 12;
const DEFAULT_POLL_MS = 5_000;

export interface StoreManifest {
  version?: string;
  key?: unknown;
}

export interface WebStoreCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  extensionId: string;
  publisherId: string;
}

export interface WebStoreResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export type WebStoreFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string | URLSearchParams | Uint8Array },
) => Promise<WebStoreResponse>;

interface RevisionStatus {
  distributionChannels?: Array<{ crxVersion?: string }>;
}

interface StatusPayload {
  publishedItemRevisionStatus?: RevisionStatus;
  submittedItemRevisionStatus?: RevisionStatus;
  lastAsyncUploadState?: string;
}

export function parseChromeVersion(version: string): [number, number, number, number] {
  if (!CHROME_VERSION.test(version)) {
    throw new Error(`Version "${version}" is not a Chrome version. Use up to four numbers, such as 2.0.0.`);
  }
  const parts = version.split(".").map((part) => Number(part));
  if (parts.some((part) => part > 65535)) {
    throw new Error(`Version "${version}" has a component above 65535.`);
  }
  while (parts.length < 4) parts.push(0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

export function compareChromeVersions(left: string, right: string): number {
  const a = parseChromeVersion(left);
  const b = parseChromeVersion(right);
  for (let index = 0; index < 4; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function assertStoreManifest(manifest: StoreManifest, floor = STORE_VERSION_FLOOR): void {
  if (manifest.key) {
    throw new Error("Store package must not include the manifest key. Build it with npm run build:store.");
  }
  if (!manifest.version) throw new Error("Store package is missing manifest.version.");
  if (compareChromeVersions(manifest.version, floor) <= 0) {
    throw new Error(
      `Version ${manifest.version} must be higher than ${floor}, the version already published on the Chrome Web Store item.`,
    );
  }
}

export function versionsFromStatus(status: StatusPayload): string[] {
  return [status.publishedItemRevisionStatus, status.submittedItemRevisionStatus]
    .flatMap((revision) => revision?.distributionChannels ?? [])
    .map((channel) => channel.crxVersion?.trim() ?? "")
    .filter((version) => version.length > 0);
}

export function assertNewerThanPublished(local: string, alreadyThere: string[], floor = STORE_VERSION_FLOOR): void {
  assertStoreManifest({ version: local }, floor);
  if (alreadyThere.length === 0) return;
  const highest = alreadyThere.reduce((best, version) => (compareChromeVersions(version, best) > 0 ? version : best));
  if (compareChromeVersions(local, highest) <= 0) {
    throw new Error(
      `Version ${local} must be higher than ${highest}, which is already published or submitted for this item.`,
    );
  }
}

export function parsePublishTarget(value: string | undefined): PublishTarget {
  const target = value?.trim() || "draft-only";
  if ((PUBLISH_TARGETS as readonly string[]).includes(target)) return target as PublishTarget;
  throw new Error("publish_target must be draft-only, trustedTesters, or default.");
}

export function credentialsFromEnv(env: Record<string, string | undefined>): WebStoreCredentials {
  const names = {
    clientId: "CWS_CLIENT_ID",
    clientSecret: "CWS_CLIENT_SECRET",
    refreshToken: "CWS_REFRESH_TOKEN",
    extensionId: "CWS_EXTENSION_ID",
    publisherId: "CWS_PUBLISHER_ID",
  } as const;
  const credentials = {} as WebStoreCredentials;
  for (const [field, name] of Object.entries(names) as Array<[keyof WebStoreCredentials, string]>) {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}.`);
    credentials[field] = value;
  }
  if (!/^[a-p]{32}$/.test(credentials.extensionId)) {
    throw new Error("CWS_EXTENSION_ID must be the 32-character store item id.");
  }
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(credentials.publisherId)) {
    throw new Error("CWS_PUBLISHER_ID does not look like a publisher id.");
  }
  return credentials;
}

export function redactSecrets(text: string, secrets: string[]): string {
  let output = text;
  const unique = [...new Set(secrets.filter((secret) => secret.length >= 6))].sort((a, b) => b.length - a.length);
  for (const secret of unique) output = output.split(secret).join("[redacted]");
  output = output.replace(/ya29\.[0-9A-Za-z_-]+/g, "[redacted-token]");
  output = output.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return output.slice(0, 400);
}

export function readManifestFromZip(zipPath: string): StoreManifest {
  let json = "";
  try {
    json = execFileSync("unzip", ["-p", zipPath, "manifest.json"], { encoding: "utf8" });
  } catch {
    throw new Error("Could not read manifest.json from the zip. Package the store build first.");
  }
  try {
    return JSON.parse(json) as StoreManifest;
  } catch {
    throw new Error("manifest.json in the zip is not valid JSON.");
  }
}

function itemPath(credentials: WebStoreCredentials): string {
  return `publishers/${encodeURIComponent(credentials.publisherId)}/items/${encodeURIComponent(credentials.extensionId)}`;
}

function secretValues(credentials: WebStoreCredentials, accessToken = ""): string[] {
  return [credentials.clientId, credentials.clientSecret, credentials.refreshToken, accessToken];
}

async function call(
  fetchImpl: WebStoreFetch,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | URLSearchParams | Uint8Array },
  secrets: string[],
): Promise<unknown> {
  let response: WebStoreResponse;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    throw new Error(`Could not reach Google. ${redactSecrets(message, secrets)}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Chrome Web Store request failed (${response.status}). ${redactSecrets(text, secrets)}`);
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Chrome Web Store returned a response that was not JSON (${response.status}).`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function uploadStateOf(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const state = payload.uploadState ?? payload.lastAsyncUploadState;
  return typeof state === "string" ? state : "";
}

function isInProgress(state: string): boolean {
  const normalized = state.toUpperCase();
  return normalized.includes("IN_PROGRESS");
}

function isFailure(state: string): boolean {
  return state.toUpperCase().includes("FAIL");
}

async function accessToken(credentials: WebStoreCredentials, fetchImpl: WebStoreFetch): Promise<string> {
  const secrets = secretValues(credentials);
  const payload = await call(
    fetchImpl,
    TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: "refresh_token",
      }),
    },
    secrets,
  );
  const token = isRecord(payload) && typeof payload.access_token === "string" ? payload.access_token : "";
  if (!token) throw new Error("Google did not return an access token. Check the OAuth client and refresh token.");
  return token;
}

async function fetchStatus(
  credentials: WebStoreCredentials,
  token: string,
  fetchImpl: WebStoreFetch,
): Promise<StatusPayload> {
  const payload = await call(
    fetchImpl,
    `https://chromewebstore.googleapis.com/v2/${itemPath(credentials)}:fetchStatus`,
    { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
    secretValues(credentials, token),
  );
  return isRecord(payload) ? (payload as StatusPayload) : {};
}

export async function publishExtension(options: {
  manifest: StoreManifest;
  zip: Uint8Array;
  target: PublishTarget;
  credentials: WebStoreCredentials;
  fetch: WebStoreFetch;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
}): Promise<{ uploadedVersion: string; published: boolean }> {
  const log = options.log ?? (() => undefined);
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const version = options.manifest.version ?? "";
  assertStoreManifest(options.manifest);

  log("Refreshing an access token.");
  const token = await accessToken(options.credentials, options.fetch);
  const secrets = secretValues(options.credentials, token);
  const status = await fetchStatus(options.credentials, token, options.fetch);
  const existing = versionsFromStatus(status);
  assertNewerThanPublished(version, existing);
  log(
    existing.length === 0
      ? `No published version was returned. ${version} is newer than ${STORE_VERSION_FLOOR}.`
      : `Highest version already on the item is ${existing.reduce((best, item) => (compareChromeVersions(item, best) > 0 ? item : best))}. Uploading ${version}.`,
  );

  log("Uploading the store package.");
  let uploaded = await call(
    options.fetch,
    `https://chromewebstore.googleapis.com/upload/v2/${itemPath(options.credentials)}:upload`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/zip",
        accept: "application/json",
      },
      body: options.zip,
    },
    secrets,
  );

  for (let attempt = 0; attempt < MAX_POLLS && isInProgress(uploadStateOf(uploaded)); attempt += 1) {
    log("Upload is still processing.");
    await sleep(pollMs);
    uploaded = await fetchStatus(options.credentials, token, options.fetch);
  }

  const state = uploadStateOf(uploaded);
  if (isInProgress(state)) throw new Error("The upload did not finish in time. Check the developer dashboard before trying again.");
  if (isFailure(state)) throw new Error(`The upload failed (${state}). Nothing was published.`);

  if (options.target === "draft-only") {
    log(`Uploaded ${version} and left it as a draft. Publish was not called.`);
    return { uploadedVersion: version, published: false };
  }

  log(
    options.target === "trustedTesters"
      ? "Submitting the draft. API v2 publishes to the visibility saved on the item. Trusted testers must already be that visibility."
      : "Submitting the draft for review. API v2 publishes to the visibility saved on the item.",
  );
  await call(
    options.fetch,
    `https://chromewebstore.googleapis.com/v2/${itemPath(options.credentials)}:publish`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
    },
    secrets,
  );
  log(`Submitted ${version} for ${options.target}.`);
  return { uploadedVersion: version, published: true };
}
