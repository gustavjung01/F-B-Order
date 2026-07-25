import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
process.chdir(repoRoot);

const argument = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
};

if (!argument("audit-verification")) {
  const manifestArg = argument("manifest") || "data/catalog-remap/tea-batch-02.json";
  const manifestPath = path.isAbsolute(manifestArg) ? manifestArg : path.resolve(repoRoot, manifestArg);
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
    const groupKey = String(manifest.groupKey || path.basename(manifestPath, path.extname(manifestPath)))
      .replace(/[^a-z0-9-]+/gi, "-")
      .toLowerCase();
    process.argv.push(`--audit-verification=data/catalog-remap/${groupKey}-audit-verification.json`);
  }
}

await import("./run-catalog-remap-batch-dry-run-vps.mjs");
