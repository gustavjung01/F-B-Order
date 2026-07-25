import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
process.chdir(repoRoot);
await import("./run-catalog-remap-tea-production-vps.mjs");
