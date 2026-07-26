import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
process.chdir(repoRoot);

const runnerPath = path.join(here, "run-catalog-remap-plan-dry-run-vps.mjs");
const patchedPath = path.join(here, `.run-catalog-remap-plan-dry-run-vps-${process.pid}.mjs`);
const brokenLine = "fs.writeFileSync('artifacts/catalog-remap/dry-run.json', JSON.stringify(report, null, 2) + '\\n');";
const fixedLine = "fs.writeFileSync('artifacts/catalog-remap/dry-run.json', JSON.stringify(report, null, 2));";
const source = fs.readFileSync(runnerPath, "utf8");

if (!source.includes(brokenLine)) {
  throw new Error("Catalog remap dry-run runner hotfix target was not found.");
}

fs.writeFileSync(patchedPath, source.replace(brokenLine, fixedLine), "utf8");

try {
  await import(pathToFileURL(patchedPath).href);
} finally {
  fs.rmSync(patchedPath, { force: true });
}
