import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const workflow = read(".github/workflows/phase7-production-deploy.yml");
const backend = read("scripts/phase7/deploy-bepsi-backend.sh");
const vercel = read("scripts/phase7/deploy-bepsi-vercel.sh");
const smoke = read("scripts/phase7/smoke-production.mjs");

assert.match(workflow, /workflow_dispatch:/, "production workflow must be manual-only");
assert.doesNotMatch(workflow, /^\s{2}(push|pull_request|schedule):/m, "production workflow must not have automatic triggers");
assert.match(workflow, /confirmation=DEPLOY_BEPSI_PRODUCTION|DEPLOY_BEPSI_PRODUCTION/, "confirmation phrase is missing");
assert.match(workflow, /concurrency:[\s\S]*bepsi-production-deploy/, "production concurrency lock is missing");
assert.match(workflow, /deploy-backend:[\s\S]*?needs:\s*total-gate/, "backend deploy must depend on total gate");
assert.match(workflow, /deploy-vercel:[\s\S]*?needs:[\s\S]*?- deploy-backend/, "Vercel deploy must depend on backend deploy");
assert.match(workflow, /production-smoke:[\s\S]*?needs:[\s\S]*?- deploy-vercel/, "production smoke must depend on Vercel deploy");
assert.match(workflow, /id:\s*validate-inputs/, "manual input normalization step is missing");
assert.match(workflow, /target_sha=\$TARGET_SHA.*GITHUB_OUTPUT/, "normalized target SHA output is missing");
assert.match(workflow, /needs\.total-gate\.outputs\.target_sha/, "normalized target SHA is not propagated to deploy jobs");
assert.match(workflow, /Invalid target_sha/, "explicit invalid SHA annotation is missing");
assert.match(workflow, /Invalid confirmation/, "explicit confirmation annotation is missing");
assert.match(workflow, /Outdated target_sha/, "explicit outdated SHA annotation is missing");

for (const expected of [
  "/srv/apps/bepsi/source",
  "/srv/apps/bepsi/current",
  "/srv/apps/bepsi/releases",
  "/srv/apps/bepsi/backups",
  "/etc/app-env/bepsi.env",
  "bepsi-api.service",
  "pg_dump",
  "pnpm db:verify:order-contract",
  "pnpm db:migrate:baseline",
  "pnpm db:migrate",
  "pnpm catalog:import",
  "flock",
  "sudo install -d",
  "sudo ln -sfn",
  "schema_migrations",
]) {
  assert.ok(backend.includes(expected), `backend deploy contract is missing ${expected}`);
}

assert.doesNotMatch(backend, /pm2\s+restart\s+all/i, "broad PM2 restart is forbidden");
assert.doesNotMatch(backend, /systemctl\s+restart\s+(vlgn|tocviet)/i, "other backend restart is forbidden");
assert.doesNotMatch(backend, /systemctl\s+restart\s+all/i, "broad systemd restart is forbidden");
assert.match(backend, /Refusing to touch another application/, "cross-application path guard is missing");
assert.match(backend, /Database changes are forward-only/, "forward-only migration warning is missing");
assert.match(backend, /LEDGER_ROW_COUNT/, "migration ledger detection is missing");
assert.match(backend, /missing.*0/s, "empty or missing ledger baseline condition is missing");
assert.match(backend, /sudo install -d[\s\S]*RELEASES_DIR/, "release directory ownership preparation is missing");
assert.match(backend, /sudo install -d[\s\S]*BACKUP_DIR/, "backup directory ownership preparation is missing");
assert.match(backend, /sudo chown[\s\S]*LOCK_FILE/, "deploy lock ownership preparation is missing");

for (const expected of [
  "NEXT_PUBLIC_DATA_MODE",
  "BACKEND_API_URL",
  "NEXT_PUBLIC_API_URL",
  "vercel@latest build",
  "vercel@latest deploy",
  "--prebuilt",
  "--prod",
]) {
  assert.ok(vercel.includes(expected), `Vercel deploy contract is missing ${expected}`);
}

for (const expected of [
  "/api/health",
  "/api/version",
  "/api/catalog/products",
  "/api/cart/validate",
  "/api/orders",
  "/api/admin/orders",
  "PHASE7_REQUIRE_AUTH_SMOKE",
]) {
  assert.ok(smoke.includes(expected), `production smoke contract is missing ${expected}`);
}

console.log("Phase 7 deploy contract tests passed.");
