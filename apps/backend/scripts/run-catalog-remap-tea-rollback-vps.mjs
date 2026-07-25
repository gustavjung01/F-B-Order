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
const remoteDir = `${remoteRoot}/.tmp/catalog-remap-tea-rollback-${Date.now()}-${process.pid}`;
const localArtifactsDir = path.join(repoRoot, "artifacts/catalog-remap/production");
const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
const confirmation = argument("confirm-production");
const rollbackIds = argument("rollback");

function fail(message) {
  console.error(`[catalog-remap-tea-rollback] ${message}`);
  process.exit(1);
}
function run(command, args, { allowFailure = false, capture = false } = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", windowsHide: true });
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
if (!rollbackIds || !rollbackIds.split(",").every((id) => /^[0-9a-f-]{36}$/i.test(id.trim()))) fail("--rollback must contain comma-separated batch UUIDs in reverse apply order.");
const engineFiles = ["catalog-remap-batch-engine.mjs", "catalog-remap-batch-common.mjs", "catalog-remap-batch-state.mjs", "catalog-remap-batch-apply.mjs", "catalog-remap-batch-verify.mjs"].map((name) => path.join(here, name));
const enginePath = engineFiles[0];
for (const file of engineFiles) if (!fs.existsSync(file)) fail(`Engine module is missing: ${file}`);
if (!fs.existsSync(sshKey)) fail(`SSH key is missing: ${sshKey}`);

const sshArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", "-i", sshKey];
const scpArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", "-i", sshKey];
const ssh = (script, options = {}) => run("ssh", [...sshArgs, sshTarget, script], options);
const scp = (files, destination) => run("scp", [...scpArgs, ...files, `${sshTarget}:${destination}`]);
function download(remotePath, localName) {
  fs.mkdirSync(localArtifactsDir, { recursive: true });
  const localPath = path.join(localArtifactsDir, localName);
  const result = run("scp", [...scpArgs, `${sshTarget}:${remotePath}`, localPath], { allowFailure: true, capture: true });
  if (result.status === 0) console.log(`[catalog-remap-tea-rollback] Saved: ${localPath}`);
  return result.status === 0 ? localPath : null;
}

const preflight = [
  "set -euo pipefail",
  `test -d '${remoteRoot}'`,
  `test -f '${remoteEnv}'`,
  `systemctl is-active --quiet '${remoteService}'`,
  `systemctl is-active --quiet '${remoteWorker}'`,
  "command -v node >/dev/null",
  "command -v pg_dump >/dev/null",
  "command -v pg_restore >/dev/null",
  "command -v curl >/dev/null",
  `mkdir -p '${remoteDir}/apps/backend/scripts' '${remoteDir}/artifacts/catalog-remap' '${remoteDir}/node_modules'`,
  `chown -R ubuntu:ubuntu '${remoteDir}'`,
  `chmod 700 '${remoteDir}'`,
].join("; ");
const preflightEncoded = Buffer.from(preflight, "utf8").toString("base64");
ssh(`printf '%s' '${preflightEncoded}' | base64 -d | sudo -n bash`);

try {
  scp(engineFiles, `${remoteDir}/apps/backend/scripts/`);
  const remoteScript = `set -euo pipefail
REMOTE_DIR='${remoteDir}'
REMOTE_ROOT='${remoteRoot}'
REMOTE_ENV='${remoteEnv}'
SERVICE='${remoteService}'
cd "$REMOTE_DIR"
SERVICE_PID=$(systemctl show --property MainPID --value "$SERVICE")
SERVICE_CWD=$(readlink -f "/proc/$SERVICE_PID/cwd")
case "$SERVICE_CWD" in "$REMOTE_ROOT"|"$REMOTE_ROOT"/*) ;; *) echo "Unexpected Bếp Sỉ service cwd: $SERVICE_CWD" >&2; exit 1 ;; esac
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
BACKUP_FILE="$BACKUP_DIR/bepsi-before-tea-rollback-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump "$DB_URL" --format=custom --no-owner --no-acl --file="$BACKUP_FILE"
test -s "$BACKUP_FILE"
pg_restore -l "$BACKUP_FILE" >/dev/null
chmod 600 "$BACKUP_FILE"
BACKUP_SHA=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
node -e 'const fs=require("fs");fs.writeFileSync("artifacts/catalog-remap/rollback-backup.json",JSON.stringify({status:"BACKUP_PASS",file:process.argv[1],sha256:process.argv[2],bytes:Number(process.argv[3])},null,2)+"\\n")' "$BACKUP_FILE" "$BACKUP_SHA" "$(stat -c %s "$BACKUP_FILE")"
node apps/backend/scripts/catalog-remap-batch-engine.mjs --rollback='${rollbackIds}' --allow-remote-apply --confirm-production=BEPSI_TEA_48 --output-json=artifacts/catalog-remap/rollback.json
node -e 'const r=require("./artifacts/catalog-remap/rollback.json");if(r.status!=="CATALOG_REMAP_ROLLBACK_PASS")process.exit(2)'
curl -fsS http://127.0.0.1:5100/health > artifacts/catalog-remap/health-after-rollback.json
systemctl is-active --quiet '${remoteService}'
systemctl is-active --quiet '${remoteWorker}'
ss -ltn | grep -qE '[:.]5100[[:space:]]'
`;
  const encoded = Buffer.from(remoteScript, "utf8").toString("base64");
  ssh(`printf '%s' '${encoded}' | base64 -d | sudo -n bash`);
  download(`${remoteDir}/artifacts/catalog-remap/rollback-backup.json`, "tea-48-rollback-backup.json");
  const rollbackPath = download(`${remoteDir}/artifacts/catalog-remap/rollback.json`, "tea-48-rollback.json");
  download(`${remoteDir}/artifacts/catalog-remap/health-after-rollback.json`, "tea-48-health-after-rollback.json");
  if (!rollbackPath) throw new Error("Rollback report was not downloaded.");
  const result = JSON.parse(fs.readFileSync(rollbackPath, "utf8"));
  if (result.status !== "CATALOG_REMAP_ROLLBACK_PASS") throw new Error("Rollback report is invalid.");
  console.log(`[catalog-remap-tea-rollback] CATALOG_REMAP_ROLLBACK_PASS; batches=${result.results.length}; backup saved on VPS.`);
} finally {
  ssh(`sudo -n rm -rf '${remoteDir}'`, { allowFailure: true, capture: true });
}
