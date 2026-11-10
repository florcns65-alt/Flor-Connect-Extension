import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const manifestPath = resolve(dist, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("dist/manifest.json is missing. Run npm run build first.");
  process.exit(1);
}

const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const zipName = `flor-connect-${version}.zip`;
const outDir = resolve(root, "dist-zip");
mkdirSync(outDir, { recursive: true });
const zipPath = resolve(outDir, zipName);
rmSync(zipPath, { force: true });
rmSync(`${zipPath}.sha256`, { force: true });
execFileSync("zip", ["-r", "-X", "-q", zipPath, "."], { cwd: dist });
const hash = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
writeFileSync(`${zipPath}.sha256`, `${hash}  ${zipName}\n`);
console.log(`${zipName}`);
console.log(hash);
