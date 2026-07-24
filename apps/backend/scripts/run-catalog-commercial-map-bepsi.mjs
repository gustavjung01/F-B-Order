import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const backendRoot = path.resolve(here, "..");

for (const envPath of [
  path.join(repoRoot, ".env"),
  path.join(backendRoot, ".env"),
  path.join(backendRoot, ".env.local"),
]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

if (!process.env.BEPSI_DATABASE_URL) {
  throw new Error("BEPSI_DATABASE_URL is required for the Bếp Sỉ commercial-map command.");
}

// This command belongs to Bếp Sỉ only. Never fall back to another app's DATABASE_URL.
process.env.DATABASE_URL = process.env.BEPSI_DATABASE_URL;

// pnpm --filter runs this command from apps/backend. Resolve user-supplied relative
// payload paths from the repository root so data/private/... points to the right file.
const fileArgumentIndex = process.argv.findIndex((value) => value.startsWith("--file="));
if (fileArgumentIndex >= 0) {
  const suppliedPath = process.argv[fileArgumentIndex].slice("--file=".length);
  const resolvedPath = path.isAbsolute(suppliedPath)
    ? suppliedPath
    : path.resolve(repoRoot, suppliedPath);
  process.argv[fileArgumentIndex] = `--file=${resolvedPath}`;
}

await import("./import-catalog-commercial-map.mjs");
