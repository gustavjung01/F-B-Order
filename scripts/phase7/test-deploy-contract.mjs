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
const app = read("apps/backend/src/app.ts");

const backendVersionMatch = app.match(/version:\s*"([^"]+)"/);
assert.ok(backendVersionMatch, "backend version payload is missing");
const expectedBackendVersion = backendVersionMatch[1];

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
assert.match(workflow, /Invalid confirmation/, "explicit invalid confirmation annotation is missing");
assert.match(workflow, /Outdated target_sha/, "explicit outdated SHA annotation is missing");
assert.ok(
  workflow.includes('git -C "$SOURCE_DIR" fetch --prune origin main'),
  "remote deploy must fetch without switching the dirty source checkout",
);
assert.ok(
  workflow.includes('git -C "$SOURCE_DIR" show "${TARGET_SHA}:scripts/phase7/deploy-bepsi-backend.sh"'),
  "remote deploy must load the script from the exact target commit",
);
assert.doesNotMatch(workflow, /git switch main/, "production workflow must not switch the dirty VPS source checkout");
assert.doesNotMatch(workflow, /git pull --ff-only origin main/, "production workflow must not pull into the dirty VPS source checkout");

for (const expected of [
  "/srv/apps/bepsi/source",
  "/srv/apps/bepsi/current",
  "/srv/apps/bepsi/releases",
  "/srv/apps/bepsi/worktrees",
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
  "worktree add",
  "worktree remove",
  "refs/remotes/origin/main",
  "systemctl show -p User",
  "systemctl show -p Group",
  'sudo chgrp -R "$SERVICE_GROUP" "$RELEASE_DIR"',
  'sudo find "$RELEASE_DIR" -type d -exec chmod g+rx',
  'sudo find "$RELEASE_DIR" -type f -exec chmod g+r',
  'sudo -u "$SERVICE_USER" test -r "$RELEASE_DIR/apps/backend/dist/main.js"',
  "fetch_with_retry()",
  'LOCAL_API_BASE_URL="${BEPSI_LOCAL_API_BASE_URL:-http://127.0.0.1:${PORT:-5100}}"',
]) {
  assert.ok(backend.includes(expected), `backend deploy contract is missing ${expected}`);
}

assert.doesNotMatch(backend, /git\s+-C\s+"\$SOURCE_DIR"\s+switch/, "backend deploy must not switch the dirty source checkout");
assert.doesNotMatch(backend, /git\s+-C\s+"\$SOURCE_DIR"\s+pull/, "backend deploy must not pull into the dirty source checkout");
assert.doesNotMatch(backend, /pm2\s+restart\s+all/i, "broad PM2 restart is forbidden");
assert.doesNotMatch(backend, /systemctl\s+restart\s+(vlgn|tocviet)/i, "other backend restart is forbidden");
assert.doesNotMatch(backend, /systemctl\s+restart\s+all/i, "broad systemd restart is forbidden");
assert.match(backend, /Refusing to touch another application/, "cross-application path guard is missing");
assert.match(backend, /Database changes are forward-only/, "forward-only migration warning is missing");
assert.match(backend, /LEDGER_ROW_COUNT/, "migration ledger detection is missing");
assert.match(backend, /missing.*0/s, "empty or missing ledger baseline condition is missing");
assert.match(backend, /sudo install -d[\s\S]*RELEASES_DIR/, "release directory ownership preparation is missing");
assert.match(backend, /sudo install -d[\s\S]*WORKTREES_DIR/, "worktree directory ownership preparation is missing");
assert.match(backend, /sudo install -d[\s\S]*BACKUP_DIR/, "backup directory ownership preparation is missing");
assert.match(backend, /sudo chown[\s\S]*LOCK_FILE/, "deploy lock ownership preparation is missing");
assert.match(
  backend,
  /\(\s*umask 077[\s\S]*pg_dump[\s\S]*\)/,
  "restrictive backup umask must be scoped so it cannot poison release permissions",
);
assert.ok(
  backend.includes(`BEPSI_EXPECTED_BACKEND_VERSION:-${expectedBackendVersion}`),
  "backend deploy version expectation must match the API payload",
);

const localReadinessIndex = backend.indexOf('fetch_with_retry "${LOCAL_API_BASE_URL}/api/health"');
const publicSmokeIndex = backend.indexOf('fetch_with_retry "${API_BASE_URL}/api/health"');
assert.ok(localReadinessIndex >= 0, "backend deploy must wait for local readiness after restart");
assert.ok(publicSmokeIndex > localReadinessIndex, "public smoke must run after local readiness succeeds");
assert.match(backend, /fetch_with_retry[\s\S]*attempts[\s\S]*sleep/, "backend smoke retries must be bounded and delayed");

for (const expected of [
  "NEXT_PUBLIC_DATA_MODE",
  "BACKEND_API_URL",
  "NEXT_PUBLIC_API_URL",
  "sync_production_env()",
  'env add "$key" production',
  "--force",
  "--no-sensitive",
  "Refreshing Vercel production environment after synchronization",
  "vercel@latest build",
  "vercel@latest deploy",
  "--prebuilt",
  "--prod",
]) {
  assert.ok(vercel.includes(expected), `Vercel deploy contract is missing ${expected}`);
}

const vercelSyncIndex = vercel.indexOf('sync_production_env "NEXT_PUBLIC_DATA_MODE" "backend"');
const vercelRefreshIndex = vercel.indexOf('log "Refreshing Vercel production environment after synchronization"');
const vercelBuildIndex = vercel.indexOf('log "Building Vercel production artifact"');
assert.ok(vercelSyncIndex >= 0, "Vercel deploy must synchronize production variables");
assert.ok(vercelRefreshIndex > vercelSyncIndex, "Vercel deploy must refresh settings after synchronizing variables");
assert.ok(vercelBuildIndex > vercelRefreshIndex, "Vercel build must run after refreshed production settings are validated");
assert.ok(
  vercel.includes('sync_production_env "BACKEND_API_URL" "$EXPECTED_API_URL"') &&
    vercel.includes('sync_production_env "NEXT_PUBLIC_API_URL" "$EXPECTED_API_URL"'),
  "Vercel deploy must synchronize both backend API URL variables",
);

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
assert.ok(
  smoke.includes(`BEPSI_EXPECTED_BACKEND_VERSION || "${expectedBackendVersion}"`),
  "production smoke version expectation must match the API payload",
);

console.log("Phase 7 deploy contract tests passed.");
