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

await import("./import-catalog-commercial-map.mjs");
