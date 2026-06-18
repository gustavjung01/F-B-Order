import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const outputPath = join(publicDir, "app-version.json");

function safeExec(command, fallback) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}

const git = process.env.VERCEL_GIT_COMMIT_SHA || safeExec("git rev-parse --short HEAD", "local");
const builtAt = new Date().toISOString();
const version = `${git}-${Date.parse(builtAt)}`;

mkdirSync(publicDir, { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify({ version, git, builtAt }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${outputPath}: ${version}`);
