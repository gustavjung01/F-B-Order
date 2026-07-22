import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const main = read("apps/backend/src/main.ts");
const workerEntry = read("apps/backend/src/ai-worker.ts");
const workerLifecycle = read("apps/backend/src/modules/ai/ai.worker.ts");
const provider = read("apps/backend/src/modules/ai/google-agent.provider.ts");
const backendPackage = JSON.parse(read("apps/backend/package.json"));
const unit = read("scripts/phase7/systemd/bepsi-ai-worker.service");
const deploy = read("scripts/phase7/deploy-bepsi-backend.sh");

assert.doesNotMatch(main, /startAiWorker|ai\.worker/, "bepsi-api must not import or start the AI worker");
assert.match(main, /app\.listen\(/, "bepsi-api must remain the HTTP entrypoint");

assert.match(workerEntry, /verifyGoogleAgentProvider/, "worker must verify Google Agent configuration before polling jobs");
assert.match(workerEntry, /AI provider preflight passed/, "worker must log a successful provider preflight");
assert.match(workerEntry, /startAiWorker/, "standalone worker entrypoint must start the worker");
assert.match(workerEntry, /SIGTERM/, "standalone worker must handle SIGTERM from systemd");
assert.match(workerEntry, /SIGINT/, "standalone worker must handle SIGINT");
assert.match(workerEntry, /stopAiWorker/, "standalone worker must stop polling before exit");
assert.match(workerEntry, /closeDb/, "standalone worker must close PostgreSQL cleanly");

assert.match(provider, /AI_PROVIDER_NOT_CONFIGURED/, "provider must expose a clear missing-configuration error");
assert.match(provider, /AI_ALLOW_DETERMINISTIC_FALLBACK/, "local deterministic fallback must be explicit");
assert.match(provider, /process\.env\.NODE_ENV !== "production"/, "production must never use deterministic fallback");
assert.doesNotMatch(provider, /fallbackReason:\s*"google_agent_not_configured"/, "missing production config must not produce fake AI success");

assert.doesNotMatch(workerLifecycle, /\.unref\(\)/, "standalone worker timer must keep the process alive");
assert.match(workerLifecycle, /await activeTick/, "worker shutdown must wait for the active job tick");
assert.equal(backendPackage.scripts["start:worker"], "node dist/ai-worker.js");
assert.equal(backendPackage.scripts["dev:worker"], "tsx watch src/ai-worker.ts");
assert.equal(backendPackage.scripts["test:ai-provider"], "tsx --test test/google-agent.provider.test.ts");

for (const expected of [
  "Description=Bếp Sỉ AI job worker",
  "User=ubuntu",
  "Group=ubuntu",
  "WorkingDirectory=/srv/apps/bepsi/current/apps/backend",
  "EnvironmentFile=/etc/app-env/bepsi.env",
  "ExecStart=/usr/bin/node /srv/apps/bepsi/current/apps/backend/dist/ai-worker.js",
  "Restart=always",
  "KillSignal=SIGTERM",
  "TimeoutStopSec=120",
  "WantedBy=multi-user.target",
]) {
  assert.ok(unit.includes(expected), `worker unit is missing ${expected}`);
}
assert.doesNotMatch(unit, /vlgn|tocviet/i, "worker unit must not reference another VPS application");

for (const expected of [
  'WORKER_SERVICE_NAME="bepsi-ai-worker.service"',
  'WORKER_UNIT_RELATIVE="scripts/phase7/systemd/bepsi-ai-worker.service"',
  'test -r "$RELEASE_DIR/apps/backend/dist/ai-worker.js"',
  'sudo install -o root -g root -m 0644',
  'sudo systemctl daemon-reload',
  'sudo systemctl enable "$WORKER_SERVICE_NAME"',
  'sudo systemctl restart "$SERVICE_NAME"',
  'sudo systemctl restart "$WORKER_SERVICE_NAME"',
  'wait_for_service_active "$WORKER_SERVICE_NAME"',
]) {
  assert.ok(deploy.includes(expected), `backend deploy is missing ${expected}`);
}

assert.doesNotMatch(deploy, /systemctl\s+restart\s+all/i, "broad systemd restart is forbidden");
assert.doesNotMatch(deploy, /systemctl\s+restart\s+(vlgn|tocviet)/i, "deploy must not restart another backend");
assert.match(deploy, /Previous code release retained/, "worker rollout must preserve rollback behavior");

console.log("Standalone Bếp Sỉ AI worker and provider readiness contract passed.");
