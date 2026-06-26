import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(__dirname, "..");
const defaultPublicDir = join(frontendDir, "public");
const defaultTemplatePath = join(__dirname, "service-worker.template.js");
const BUILD_ID_PLACEHOLDER = "__PWA_BUILD_ID__";

function safeExec(command, fallback) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}

function sanitizePart(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function createBuildId({ git, builtAt, deploymentId = "", entropy = "" }) {
  const safeGit = sanitizePart(git) || "local";
  const safeDeployment = sanitizePart(deploymentId);
  const timestamp = Date.parse(builtAt);
  const safeTimestamp = Number.isFinite(timestamp) ? String(timestamp) : String(Date.now());
  const safeEntropy = sanitizePart(entropy) || randomBytes(6).toString("hex");

  return [safeGit, safeDeployment || safeTimestamp, safeEntropy].join("-");
}

export function renderServiceWorker(template, buildId) {
  if (!template.includes(BUILD_ID_PLACEHOLDER)) {
    throw new Error(`Missing ${BUILD_ID_PLACEHOLDER} in service worker template.`);
  }

  return template.split(BUILD_ID_PLACEHOLDER).join(JSON.stringify(buildId));
}

export function writePwaRelease({
  publicDir = defaultPublicDir,
  templatePath = defaultTemplatePath,
  git = process.env.VERCEL_GIT_COMMIT_SHA || safeExec("git rev-parse --short=12 HEAD", "local"),
  deploymentId = process.env.VERCEL_DEPLOYMENT_ID || "",
  builtAt = new Date().toISOString(),
  entropy = randomBytes(6).toString("hex"),
  buildId,
} = {}) {
  const releaseId = buildId || createBuildId({ git, deploymentId, builtAt, entropy });
  const appVersionPath = join(publicDir, "app-version.json");
  const serviceWorkerPath = join(publicDir, "service-worker.js");
  const template = readFileSync(templatePath, "utf8");
  const serviceWorker = renderServiceWorker(template, releaseId);

  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    appVersionPath,
    `${JSON.stringify({ buildId: releaseId, version: releaseId, git, builtAt }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(serviceWorkerPath, serviceWorker, "utf8");

  return { buildId: releaseId, appVersionPath, serviceWorkerPath };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = writePwaRelease();
  console.log(`Wrote PWA release ${result.buildId}`);
  console.log(`- ${result.appVersionPath}`);
  console.log(`- ${result.serviceWorkerPath}`);
}
