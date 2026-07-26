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
const remotePgBin = "/usr/lib/postgresql/17/bin";
const remotePsql = `${remotePgBin}/psql`;
const remotePgDump = `${remotePgBin}/pg_dump`;
const remotePgRestore = `${remotePgBin}/pg_restore`;
const remoteDir = `${remoteRoot}/.tmp/catalog-remap-tea-production-${Date.now()}-${process.pid}`;
const localArtifactsDir = path.join(repoRoot, "artifacts/catalog-remap/production");
const confirmation = process.argv.find((value) => value.startsWith("--confirm-production="))?.split("=").slice(1).join("=") || "";

function fail(message) {
  console.error(`[catalog-remap-tea-production] ${message}`);
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

if (confirmation !== "BEPSI_TEA_48") fail("Required: --confirm-production=BEPSI_TEA_48");

const engineFiles = ["catalog-remap-batch-engine.mjs", "catalog-remap-batch-common.mjs", "catalog-remap-batch-state.mjs", "catalog-remap-batch-apply.mjs", "catalog-remap-batch-verify.mjs"].map((name) => path.join(here, name));
const enginePath = engineFiles[0];
const planPath = path.join(repoRoot, "data/catalog-remap/tea-production-plan.json");
const migration031 = path.join(repoRoot, "db/migrations/031_catalog_group_remap.sql");
const migration032 = path.join(repoRoot, "db/migrations/032_catalog_packaging_count_only.sql");
for (const [label, file] of [...engineFiles.map((file) => ["engine module", file]), ["plan", planPath], ["migration 031", migration031], ["migration 032", migration032]]) {
  if (!fs.existsSync(file)) fail(`${label} is missing: ${file}`);
}
if (!fs.existsSync(sshKey)) fail(`SSH key is missing: ${sshKey}`);

const plan = JSON.parse(fs.readFileSync(planPath, "utf8").replace(/^\uFEFF/, ""));
if (plan.planId !== "TEA-PRODUCTION-48" || plan.remoteRoot !== remoteRoot || !Array.isArray(plan.tasks) || plan.tasks.length !== 3) {
  fail("Production plan identity/scope is invalid.");
}
const taskFiles = plan.tasks.flatMap((task) => [
  path.resolve(repoRoot, task.manifest),
  path.resolve(repoRoot, task.commercialFile),
]);
for (const file of taskFiles) if (!fs.existsSync(file)) fail(`Required task file is missing: ${file}`);

console.log("[catalog-remap-tea-production] Local contract self-test...");
run("node", [enginePath, "--self-test", `--test-config=${planPath}`]);

const sshArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", "-i", sshKey];
const scpArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", "-i", sshKey];
const ssh = (script, options = {}) => run("ssh", [...sshArgs, sshTarget, script], options);
const scp = (files, destination) => run("scp", [...scpArgs, ...files, `${sshTarget}:${destination}`]);

function download(remotePath, localName) {
  fs.mkdirSync(localArtifactsDir, { recursive: true });
  const localPath = path.join(localArtifactsDir, localName);
  const result = run("scp", [...scpArgs, `${sshTarget}:${remotePath}`, localPath], { allowFailure: true, capture: true });
  if (result.status === 0) console.log(`[catalog-remap-tea-production] Saved: ${localPath}`);
  return result.status === 0 ? localPath : null;
}

console.log(`[catalog-remap-tea-production] Target locked: ${sshTarget}${remoteRoot}; services: ${remoteService}, ${remoteWorker}; port 5100 only.`);

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
  `test -x '${remotePsql}'`,
  `test -x '${remotePgDump}'`,
  `test -x '${remotePgRestore}'`,
  `'${remotePsql}' --version | grep -qE ' 17\\.'`,
  `'${remotePgDump}' --version | grep -qE ' 17\\.'`,
  `'${remotePgRestore}' --version | grep -qE ' 17\\.'`,
  "command -v curl >/dev/null",
  `ss -ltn | grep -qE '[:.]5100[[:space:]]'`,
  `CODE_READY=0; for D in "$SERVICE_CWD/dist" '${remoteRoot}/apps/backend/dist'; do if [ -d "$D" ] && grep -Rqs 'count_only' "$D"; then CODE_READY=1; fi; done; test "$CODE_READY" -eq 1 || { echo 'Deployed Bếp Sỉ backend does not contain COUNT_ONLY support.' >&2; exit 1; }`,
  `mkdir -p '${remoteDir}/apps/backend/scripts' '${remoteDir}/data/catalog-remap' '${remoteDir}/data/private/catalog-imports' '${remoteDir}/db/migrations' '${remoteDir}/artifacts/catalog-remap' '${remoteDir}/node_modules'`,
  `chown -R ubuntu:ubuntu '${remoteDir}'`,
  `chmod 700 '${remoteDir}'`,
].join("; ");
const preflightEncoded = Buffer.from(preflight, "utf8").toString("base64");
ssh(`printf '%s' '${preflightEncoded}' | base64 -d | sudo -n bash`);

try {
  scp(engineFiles, `${remoteDir}/apps/backend/scripts/`);
  scp([planPath], `${remoteDir}/data/catalog-remap/`);
  scp([migration031, migration032], `${remoteDir}/db/migrations/`);
  for (const task of plan.tasks) {
    scp([path.resolve(repoRoot, task.manifest)], `${remoteDir}/data/catalog-remap/`);
    scp([path.resolve(repoRoot, task.commercialFile)], `${remoteDir}/data/private/catalog-imports/`);
  }

  const remoteScript = `set -euo pipefail
REMOTE_DIR='${remoteDir}'
REMOTE_ROOT='${remoteRoot}'
REMOTE_ENV='${remoteEnv}'
SERVICE='${remoteService}'
PSQL='${remotePsql}'
PG_DUMP='${remotePgDump}'
PG_RESTORE='${remotePgRestore}'
cd "$REMOTE_DIR"
chmod 600 data/private/catalog-imports/*.json
SERVICE_PID=$(systemctl show --property MainPID --value "$SERVICE")
SERVICE_CWD=$(readlink -f "/proc/$SERVICE_PID/cwd")
for PACKAGE_NAME in pg dotenv; do
  PACKAGE_JSON=$(find "$SERVICE_CWD" "$REMOTE_ROOT" -type f -path "*/node_modules/$PACKAGE_NAME/package.json" -print -quit 2>/dev/null || true)
  test -n "$PACKAGE_JSON" || { echo "Bếp Sỉ runtime package not found: $PACKAGE_NAME" >&2; exit 1; }
  ln -s "$(dirname "$PACKAGE_JSON")" "node_modules/$PACKAGE_NAME"
done
node apps/backend/scripts/catalog-remap-batch-engine.mjs --self-test
set -a
. "$REMOTE_ENV"
set +a
DB_URL="\${DATABASE_URL:-\${BEPSI_DATABASE_URL:-}}"
test -n "$DB_URL"
BACKUP_DIR="$REMOTE_ROOT/backups/catalog-remap"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/bepsi-before-tea-48-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'if [ -n "\${BACKUP_FILE:-}" ] && [ -e "$BACKUP_FILE" ] && [ ! -s "$BACKUP_FILE" ]; then rm -f "$BACKUP_FILE"; fi' EXIT
"$PG_DUMP" "$DB_URL" --format=custom --no-owner --no-acl --file="$BACKUP_FILE"
test -s "$BACKUP_FILE"
"$PG_RESTORE" -l "$BACKUP_FILE" >/dev/null
chmod 600 "$BACKUP_FILE"
BACKUP_SHA=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
node -e 'const fs=require("fs");fs.writeFileSync("artifacts/catalog-remap/backup.json",JSON.stringify({status:"BACKUP_PASS",file:process.argv[1],sha256:process.argv[2],bytes:Number(process.argv[3])},null,2)+"\\n")' "$BACKUP_FILE" "$BACKUP_SHA" "$(stat -c %s "$BACKUP_FILE")"
"$PSQL" "$DB_URL" -v ON_ERROR_STOP=1 -f db/migrations/031_catalog_group_remap.sql
"$PSQL" "$DB_URL" -v ON_ERROR_STOP=1 -f db/migrations/032_catalog_packaging_count_only.sql
node apps/backend/scripts/catalog-remap-batch-engine.mjs --config=data/catalog-remap/tea-production-plan.json --output-json=artifacts/catalog-remap/pre-apply-dry-run.json
node -e 'const r=require("./artifacts/catalog-remap/pre-apply-dry-run.json");if(r.status!=="TEA_PRODUCTION_DRY_RUN_PASS")process.exit(2)'
node apps/backend/scripts/catalog-remap-batch-engine.mjs --config=data/catalog-remap/tea-production-plan.json --apply --allow-remote-apply --confirm-production=BEPSI_TEA_48 --output-json=artifacts/catalog-remap/apply.json
node -e 'const r=require("./artifacts/catalog-remap/apply.json");if(r.status!=="TEA_PRODUCTION_APPLY_PASS"||r.verification?.canonicalVariantCount!==48)process.exit(2)'
set +e
curl -fsS http://127.0.0.1:5100/health > artifacts/catalog-remap/health.json
HEALTH_STATUS=$?
COUNT_ID=$("$PSQL" "$DB_URL" -Atqc "SELECT id FROM catalog_variants WHERE sku='COHTBD' LIMIT 1")
MEASURED_ID=$("$PSQL" "$DB_URL" -Atqc "SELECT id FROM catalog_variants WHERE sku='HTRKIG' LIMIT 1")
test -n "$COUNT_ID" && curl -fsS "http://127.0.0.1:5100/api/catalog-v2/products/$COUNT_ID" > artifacts/catalog-remap/count-only-api.json
COUNT_STATUS=$?
test -n "$MEASURED_ID" && curl -fsS "http://127.0.0.1:5100/api/catalog-v2/products/$MEASURED_ID" > artifacts/catalog-remap/measured-api.json
MEASURED_STATUS=$?
set -e
API_OK=1
if [ "$HEALTH_STATUS" -ne 0 ] || [ "$COUNT_STATUS" -ne 0 ] || [ "$MEASURED_STATUS" -ne 0 ]; then API_OK=0; fi
if [ "$API_OK" -eq 1 ]; then
  node - <<'NODE' || API_OK=0
const fs=require('fs');
const health=JSON.parse(fs.readFileSync('artifacts/catalog-remap/health.json','utf8'));
const count=JSON.parse(fs.readFileSync('artifacts/catalog-remap/count-only-api.json','utf8'));
const measured=JSON.parse(fs.readFileSync('artifacts/catalog-remap/measured-api.json','utf8'));
const c=count.variants?.find(v=>v.sku==='COHTBD');
const m=measured.variants?.find(v=>v.sku==='HTRKIG');
if(!health.ok || health.port!==5100) throw new Error('Health verification failed');
if(!c || c.packaging?.measureMode!=='count_only' || c.sizeLabel!==null || c.packaging?.packageQuantity!==30) throw new Error('COUNT_ONLY API verification failed');
if(!m || m.packaging?.measureMode!=='measured' || m.packaging?.netQuantity!==500) throw new Error('MEASURED API verification failed');
NODE
fi
if [ "$API_OK" -ne 1 ]; then
  IDS=$(node -e 'const r=require("./artifacts/catalog-remap/apply.json");process.stdout.write(r.rollbackBatchIds.join(","))')
  node apps/backend/scripts/catalog-remap-batch-engine.mjs --rollback="$IDS" --allow-remote-apply --confirm-production=BEPSI_TEA_48 --output-json=artifacts/catalog-remap/automatic-rollback.json || true
  echo 'API verification failed; catalog batches were rolled back automatically.' >&2
  exit 1
fi
systemctl is-active --quiet '${remoteService}'
systemctl is-active --quiet '${remoteWorker}'
ss -ltn | grep -qE '[:.]5100[[:space:]]'
node -e 'const fs=require("fs");const apply=require("./artifacts/catalog-remap/apply.json");fs.writeFileSync("artifacts/catalog-remap/final.json",JSON.stringify({status:"TEA_PRODUCTION_VERIFIED",productionModified:true,backup:require("./artifacts/catalog-remap/backup.json"),apply,service:"${remoteService}",worker:"${remoteWorker}",port:5100,r2Writes:0},null,2)+"\\n")'
`;
  const encoded = Buffer.from(remoteScript, "utf8").toString("base64");
  ssh(`printf '%s' '${encoded}' | base64 -d | sudo -n bash`);

  download(`${remoteDir}/artifacts/catalog-remap/backup.json`, "tea-48-backup.json");
  download(`${remoteDir}/artifacts/catalog-remap/pre-apply-dry-run.json`, "tea-48-pre-apply-dry-run.json");
  download(`${remoteDir}/artifacts/catalog-remap/apply.json`, "tea-48-apply.json");
  download(`${remoteDir}/artifacts/catalog-remap/health.json`, "tea-48-health.json");
  download(`${remoteDir}/artifacts/catalog-remap/count-only-api.json`, "tea-48-count-only-api.json");
  download(`${remoteDir}/artifacts/catalog-remap/measured-api.json`, "tea-48-measured-api.json");
  const finalPath = download(`${remoteDir}/artifacts/catalog-remap/final.json`, "tea-48-final.json");
  if (!finalPath) throw new Error("Final production verification report was not downloaded.");
  const final = JSON.parse(fs.readFileSync(finalPath, "utf8"));
  if (final.status !== "TEA_PRODUCTION_VERIFIED" || final.apply?.verification?.canonicalVariantCount !== 48) {
    throw new Error("Final production verification report is invalid.");
  }
  console.log(`[catalog-remap-tea-production] TEA_PRODUCTION_VERIFIED; variants=${final.apply.verification.canonicalVariantCount}; aliases=${final.apply.verification.remapAliasCount}; countOnly=${final.apply.verification.countOnlyCount}; backup=${final.backup.file}`);
  console.log("[catalog-remap-tea-production] No R2 object was written or deleted; services were not restarted.");
} catch (error) {
  download(`${remoteDir}/artifacts/catalog-remap/automatic-rollback.json`, "tea-48-automatic-rollback.json");
  throw error;
} finally {
  ssh(`sudo -n rm -rf '${remoteDir}'`, { allowFailure: true, capture: true });
}
