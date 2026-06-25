import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const forwarded = process.argv.slice(2);
const args = forwarded.includes("--apply") ? forwarded : ["--apply", ...forwarded];

for (const script of ["import-catalog-v2.mjs", "apply-catalog-v2-metadata.mjs"]) {
  const result = spawnSync(process.execPath, [path.join(here, script), ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
