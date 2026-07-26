import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const defaultKey = "F:\\1_A_Disk_D\\khuong-binh\\TK\\Orcle\\vps-40.233.83.234-backend\\ssh-key-1-1-E1.key";
const sshKey = process.env.BEPSI_SSH_KEY || defaultKey;
const sshTarget = process.env.BEPSI_SSH_TARGET || "ubuntu@40.233.83.234";
const remoteRoot = "/srv/apps/bepsi";
const remoteEnv = "/etc/app-env/bepsi.env";
const remoteService = "bepsi-api.service";
const remoteWorker = "bepsi-ai-worker.service";
const remoteDir = `${remoteRoot}/.tmp/catalog-remap-plan-dry-run-${Date.now()}-${process.pid}`;

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function fail(message) {
  console.error(`[catalog-remap-plan-dry-run] ${message}`);
  process.exit(1);
}

function run(command, args, { allowFailure = false, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
  });
  if (result.error) {
    if (allowFailure) return result;
    throw result.error;
  }
  if (result.status !== 0 && !allowFailure) {
    const detail = capture ? `${result.stdout || ""}${result.stderr || ""}`.trim() : "";
    throw new Error(`${command} exited with status ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

if (process.argv.includes("--apply") || process.argv.some((value) => value.startsWith("--rollback="))) {
  fail("This runner is read-only. Apply and rollback are blocked.");
}

const planArg = argument("plan");
if (!planArg) fail("--plan is required.");
const planPath = path.isAbsolute(planArg) ? planArg : path.resolve(repoRoot, planArg);
if (!fs.existsSync(planPath)) fail(`Plan not found: ${planPath}`);
if (!fs.existsSync(sshKey)) fail(`SSH key not found: ${sshKey}`);

const plan = JSON.parse(fs.readFileSync(planPath, "utf8").replace(/^\uFEFF/, ""));
if (plan?.schemaVersion !== 1 || plan?.remoteRoot !== remoteRoot || !Array.isArray(plan.tasks) || plan.tasks.length < 1) {
  fail("Plan identity or scope is invalid.");
}

const manifestPaths = plan.tasks.map((task) => path.resolve(repoRoot, task.manifest));
const commercialPaths = plan.tasks.map((task) => path.resolve(repoRoot, task.commercialFile));
for (const file of [...manifestPaths, ...commercialPaths]) {
  if (!fs.existsSync(file)) fail(`Required plan file not found: ${file}`);
}

const uniqueBasenames = new Set([...manifestPaths, ...commercialPaths].map((file) => path.basename(file)));
if (uniqueBasenames.size !== manifestPaths.length + commercialPaths.length) {
  fail("Plan files must have unique basenames for the temporary VPS workspace.");
}

const engineFiles = [
  "catalog-remap-batch-engine.mjs",
  "catalog-remap-batch-common.mjs",
  "catalog-remap-batch-state.mjs",
  "catalog-remap-batch-apply.mjs",
  "catalog-remap-batch-verify.mjs",
].map((name) => path.join(here, name));
for (const file of engineFiles) if (!fs.existsSync(file)) fail(`Engine module not found: ${file}`);

const slug = String(plan.planId || "catalog-remap-plan")
  .replace(/[^a-z0-9-]+/gi, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase();
const localArtifactsDir = path.join(repoRoot, "artifacts/catalog-remap/production");
const localReportPath = path.join(localArtifactsDir, `${slug}-dry-run.json`);

console.log(`[catalog-remap-plan-dry-run] Plan: ${plan.planId}; tasks=${plan.tasks.length}`);
console.log(`[catalog-remap-plan-dry-run] Target locked: ${sshTarget}${remoteRoot}`);
console.log("[catalog-remap-plan-dry-run] Mode: READ ONLY; no migration, apply, rollback, deploy, restart, or R2 write.");
console.log("[catalog-remap-plan-dry-run] Local contract self-test...");
run("node", [engineFiles[0], "--self-test", `--test-config=${planPath}`]);

const sshArgs = [
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=15",
  "-o", "StrictHostKeyChecking=accept-new",
  "-i", sshKey,
];
const scpArgs = [
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=15",
  "-o", "StrictHostKeyChecking=accept-new",
  "-i", sshKey,
];
const ssh = (script, options = {}) => run("ssh", [...sshArgs, sshTarget, script], options);
const scp = (files, destination) => run("scp", [...scpArgs, ...files, `${sshTarget}:${destination}`]);

try {
  const preflight = [
    "set -euo pipefail",
    `test -d '${remoteRoot}'`,
    `test -f '${remoteEnv}'`,
    `systemctl is-active --quiet '${remoteService}'`,
    `systemctl is-active --quiet '${remoteWorker}'`,
    `SERVICE_PID=$(systemctl show --property MainPID --value '${remoteService}')`,
    `test -n "$SERVICE_PID" && test "$SERVICE_PID" -gt 0`,
    `SERVICE_CWD=$(readlink -f "/proc/$SERVICE_PID/cwd")`,
    `case "$SERVICE_CWD" in '${remoteRoot}'|'${remoteRoot}'/*) ;; *) echo "Unexpected Bếp Sỉ service cwd: $SERVICE_CWD" >&2; exit 1 ;; esac`,
    "command -v node >/dev/null",
    `mkdir -p '${remoteDir}/apps/backend/scripts' '${remoteDir}/data/catalog-remap' '${remoteDir}/data/private/catalog-imports' '${remoteDir}/artifacts/catalog-remap' '${remoteDir}/node_modules'`,
    `chown -R ubuntu:ubuntu '${remoteDir}'`,
    `chmod 700 '${remoteDir}'`,
  ].join("; ");
  const preflightEncoded = Buffer.from(preflight, "utf8").toString("base64");
  ssh(`printf '%s' '${preflightEncoded}' | base64 -d | sudo -n bash`);

  scp(engineFiles, `${remoteDir}/apps/backend/scripts/`);
  scp([planPath, ...manifestPaths], `${remoteDir}/data/catalog-remap/`);
  scp(commercialPaths, `${remoteDir}/data/private/catalog-imports/`);

  const planName = path.basename(planPath);
  const remoteScript = `set -euo pipefail
REMOTE_DIR='${remoteDir}'
REMOTE_ROOT='${remoteRoot}'
REMOTE_ENV='${remoteEnv}'
SERVICE='${remoteService}'
cd "$REMOTE_DIR"
chmod 600 data/private/catalog-imports/*.json
SERVICE_PID=$(systemctl show --property MainPID --value "$SERVICE")
SERVICE_CWD=$(readlink -f "/proc/$SERVICE_PID/cwd")
for PACKAGE_NAME in pg dotenv; do
  PACKAGE_JSON=$(find "$SERVICE_CWD" "$REMOTE_ROOT" -type f -path "*/node_modules/$PACKAGE_NAME/package.json" -print -quit 2>/dev/null || true)
  test -n "$PACKAGE_JSON" || { echo "Bếp Sỉ runtime package not found: $PACKAGE_NAME" >&2; exit 1; }
  ln -s "$(dirname "$PACKAGE_JSON")" "node_modules/$PACKAGE_NAME"
done
set -a
. "$REMOTE_ENV"
set +a
test -n "\${DATABASE_URL:-\${BEPSI_DATABASE_URL:-}}"
set +e
node apps/backend/scripts/catalog-remap-batch-engine.mjs \
  --config=data/catalog-remap/${planName} \
  --output-json=artifacts/catalog-remap/engine-dry-run.json
ENGINE_RC=$?
set -e
if [ "$ENGINE_RC" -ne 0 ] && [ "$ENGINE_RC" -ne 2 ]; then exit "$ENGINE_RC"; fi
node - <<'NODE'
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('artifacts/catalog-remap/engine-dry-run.json', 'utf8'));
const plan = JSON.parse(fs.readFileSync('data/catalog-remap/${planName}', 'utf8'));
const taskReports = Array.isArray(raw.taskReports) ? raw.taskReports : [];
const rows = taskReports.flatMap((task) => Array.isArray(task.rows) ? task.rows : []);
const pass = taskReports.length === plan.tasks.length && taskReports.every((task) => task.status === 'BATCH_DRY_RUN_PASS');
const report = {
  schemaVersion: 1,
  planId: plan.planId,
  status: pass ? 'CATALOG_REMAP_PLAN_DRY_RUN_PASS' : 'CATALOG_REMAP_PLAN_DRY_RUN_BLOCKED',
  productionModified: false,
  target: raw.target,
  summary: {
    taskCount: taskReports.length,
    rowCount: rows.length,
    rowPassCount: rows.filter((row) => row.pass === true).length,
    rowBlockedCount: rows.filter((row) => row.pass !== true).length,
  },
  taskReports,
};
fs.writeFileSync('artifacts/catalog-remap/dry-run.json', JSON.stringify(report, null, 2) + '\n');
NODE
chown -R ubuntu:ubuntu artifacts/catalog-remap
chmod 600 artifacts/catalog-remap/*.json
exit 0`;
  const encoded = Buffer.from(remoteScript, "utf8").toString("base64");
  ssh(`printf '%s' '${encoded}' | base64 -d | sudo -n bash`);

  fs.mkdirSync(localArtifactsDir, { recursive: true });
  run("scp", [...scpArgs, `${sshTarget}:${remoteDir}/artifacts/catalog-remap/dry-run.json`, localReportPath]);

  const report = JSON.parse(fs.readFileSync(localReportPath, "utf8"));
  console.log(`[catalog-remap-plan-dry-run] ${report.status}; tasks=${report.summary?.taskCount}; rows=${report.summary?.rowCount}; pass=${report.summary?.rowPassCount}; blocked=${report.summary?.rowBlockedCount}`);
  for (const task of report.taskReports || []) {
    console.log(`[catalog-remap-plan-dry-run] ${task.taskId}: ${task.status}; rows=${task.summary?.rowCount}; pass=${task.summary?.rowPassCount}; blocked=${task.summary?.rowBlockedCount}`);
    for (const row of task.rows || []) {
      if (!row.pass) console.error(`[catalog-remap-plan-dry-run] ${row.action} ${row.legacySku || "-"} -> ${row.canonicalSku}: ${(row.blockers || []).join(", ")}`);
    }
  }
  console.log(`[catalog-remap-plan-dry-run] Report saved: ${localReportPath}`);
  console.log("[catalog-remap-plan-dry-run] Nothing was written to production.");
  if (report.status !== "CATALOG_REMAP_PLAN_DRY_RUN_PASS") process.exitCode = 2;
} catch (error) {
  console.error(`[catalog-remap-plan-dry-run] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  ssh(`sudo -n rm -rf '${remoteDir}'`, { allowFailure: true, capture: true });
}
