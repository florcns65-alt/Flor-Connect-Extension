import { readFileSync } from "node:fs";
import {
  assertStoreManifest,
  credentialsFromEnv,
  parsePublishTarget,
  publishExtension,
  readManifestFromZip,
} from "../src/webstore/publish.ts";

function zipPathFrom(args: string[]): string {
  const zipPath = args[0] === "--check" ? args[1] : args[0];
  if (!zipPath) {
    throw new Error("Usage: webstore-cli.ts [--check] dist-zip/flor-connect-2.0.0.zip");
  }
  return zipPath;
}

export async function runCli(args: string[], env: Record<string, string | undefined> = process.env): Promise<void> {
  const manifest = readManifestFromZip(zipPathFrom(args));
  assertStoreManifest(manifest);
  if (args[0] === "--check") {
    console.log(`Store package ${manifest.version} omits the manifest key and is newer than 1.1.1.`);
    return;
  }

  const target = parsePublishTarget(env.PUBLISH_TARGET);
  const credentials = credentialsFromEnv(env);
  const zip = readFileSync(zipPathFrom(args));
  await publishExtension({
    manifest,
    zip,
    target,
    credentials,
    fetch: async (url, init) => {
      const response = await fetch(url, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body,
      });
      return { ok: response.ok, status: response.status, text: () => response.text() };
    },
    log: (line) => console.log(line),
  });
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("webstore-cli.ts") || entry.endsWith("webstore-cli.mjs")) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Publish failed.");
    process.exit(1);
  });
}
