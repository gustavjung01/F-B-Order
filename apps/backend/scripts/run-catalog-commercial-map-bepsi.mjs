import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const backendRoot = path.resolve(here, "..");

// Root env provides shared defaults. Backend env files are more specific and must
// override root values, otherwise a DATABASE_URL from another app can win.
const envFiles = [
  { filePath: path.join(repoRoot, ".env"), override: false },
  { filePath: path.join(backendRoot, ".env"), override: true },
  { filePath: path.join(backendRoot, ".env.local"), override: true },
];

for (const { filePath, override } of envFiles) {
  if (fs.existsSync(filePath)) dotenv.config({ path: filePath, override });
}

const connectionString = process.env.BEPSI_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not configured for the Bếp Sỉ backend.");
}

// Normalize the value consumed by the importer. BEPSI_DATABASE_URL remains an
// optional explicit override; the normal backend DATABASE_URL also works.
process.env.DATABASE_URL = connectionString;

const targetUrl = new URL(connectionString);
console.log(`[catalog-commercial] dry-run target: ${targetUrl.hostname}:${targetUrl.port || "5432"}${targetUrl.pathname}`);

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
