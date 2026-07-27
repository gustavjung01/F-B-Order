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
const remotePgDump = "/usr/lib/postgresql/17/bin/pg_dump";
const remoteDir = `${remoteRoot}/.tmp/sinh-to-mut-correction-production-${Date.now()}-${process.pid}`;
const localArtifactsDir = path.join(repoRoot, "artifacts/catalog-remap/production");
const manifestPath = path.join(repoRoot, "data/catalog-remap/sinh-to-mut-correction-01.json");
const sourceCatalogPath = path.join(repoRoot, "data/catalog/hung-phat/v2/manifests/products.json");
const engineFiles = [
  "catalog-remap-batch-common.mjs",
  "sinh-to-mut-correction-common.mjs",
  "sinh-to-mut-correction-state.mjs",
  "sinh-to-mut-correction-apply.mjs",
  "sinh-to-mut-correction-engine.mjs",
  "prepare-sinh-to-mut-correction-private.mjs",
].map((name) => path.join(here, name));

function fail(message) {
  console.error(`[sinh-to-mut-correction-production] ${message}`);
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

function download(remotePath, localName) {
  fs.mkdirSync(localArtifactsDir, { recursive: true });
  const localPath = path.join(localArtifactsDir, localName);
  const result = run("scp", [...scpArgs, `${sshTarget}:${remotePath}`, localPath], { allowFailure: true, capture: true });
  if (result.status === 0) console.log(`[sinh-to-mut-correction-production] Saved: ${localPath}`);
  return result.status === 0 ? localPath : null;
}

if (!fs.existsSync(sshKey)) fail(`SSH key is missing: ${sshKey}`);
for (const file of [manifestPath, sourceCatalogPath, ...engineFiles]) {
  if (!fs.existsSync(file)) fail(`Required file is missing: ${file}`);
}

const sshArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", "-i", sshKey];
const scpArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", "-i", sshKey];
const ssh = (script, options = {}) => run("ssh", [...sshArgs, sshTarget, script], options);
const scp = (files, destination) => run("scp", [...scpArgs, ...files, `${sshTarget}:${destination}`]);

const preflight = [
  "set -euo pipefail",
  `test -d '${remoteRoot}'`,
  `test -f '${remoteEnv}'`,
  `systemctl is-active --quiet '${remoteService}'`,
  `command -v node >/dev/null`,
  `command -v curl >/dev/null`,
  `test -x '${remotePgDump}'`,
  `SERVICE_PID=$(systemctl show --property MainPID --value '${remoteService}')`,
  `test -n "$SERVICE_PID" && test "$SERVICE_PID" -gt 0`,
  `SERVICE_CWD=$(readlink -f "/proc/$SERVICE_PID/cwd")`,
  `case "$SERVICE_CWD" in '${remoteRoot}'|'${remoteRoot}'/*) ;; *) echo "Unexpected Bếp Sỉ service cwd: $SERVICE_CWD" >&2; exit 1 ;; esac`,
  `ss -ltn | grep -qE '[:.]5100[[:space:]]'`,
  `mkdir -p '${remoteDir}/apps/backend/scripts' '${remoteDir}/data/catalog-remap' '${remoteDir}/data/catalog/hung-phat/v2/manifests' '${remoteDir}/artifacts/catalog-remap' '${remoteDir}/node_modules'`,
  `chown -R ubuntu:ubuntu '${remoteDir}'`,
  `chmod 700 '${remoteDir}'`,
].join("; ");

const preflightEncoded = Buffer.from(preflight, "utf8").toString("base64");
ssh(`printf '%s' '${preflightEncoded}' | base64 -d | sudo -n bash`);

try {
  scp(engineFiles, `${remoteDir}/apps/backend/scripts/`);
  scp([manifestPath], `${remoteDir}/data/catalog-remap/`);
  scp([sourceCatalogPath], `${remoteDir}/data/catalog/hung-phat/v2/manifests/`);

  const remoteScript = `set -euo pipefail
REMOTE_DIR='${remoteDir}'
REMOTE_ROOT='${remoteRoot}'
REMOTE_ENV='${remoteEnv}'
SERVICE='${remoteService}'
PG_DUMP='${remotePgDump}'
cd "$REMOTE_DIR"
SERVICE_PID=$(systemctl show --property MainPID --value "$SERVICE")
SERVICE_CWD=$(readlink -f "/proc/$SERVICE_PID/cwd")
for PACKAGE_NAME in pg dotenv; do
  PACKAGE_JSON=$(find "$SERVICE_CWD" "$REMOTE_ROOT" -type f -path "*/node_modules/$PACKAGE_NAME/package.json" -print -quit 2>/dev/null || true)
  test -n "$PACKAGE_JSON" || { echo "Bếp Sỉ runtime package not found: $PACKAGE_NAME" >&2; exit 1; }
  ln -s "$(dirname "$PACKAGE_JSON")" "node_modules/$PACKAGE_NAME"
done
node apps/backend/scripts/sinh-to-mut-correction-engine.mjs --self-test
set -a
. "$REMOTE_ENV"
set +a
DB_URL="\${DATABASE_URL:-\${BEPSI_DATABASE_URL:-}}"
test -n "$DB_URL"
node apps/backend/scripts/prepare-sinh-to-mut-correction-private.mjs
node apps/backend/scripts/sinh-to-mut-correction-engine.mjs --manifest=data/catalog-remap/sinh-to-mut-correction-01.json --commercial-file=data/private/catalog-imports/sinh-to-mut-correction-01.private.json --output-json=artifacts/catalog-remap/sinh-to-mut-correction-01-dry-run.json --output-csv=artifacts/catalog-remap/sinh-to-mut-correction-01-dry-run.csv
node -e 'const r=require("./artifacts/catalog-remap/sinh-to-mut-correction-01-dry-run.json");if(r.status!=="SINH_TO_MUT_CORRECTION_DRY_RUN_PASS")process.exit(2)'
BACKUP_DIR="$REMOTE_ROOT/backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/bepsi-before-sinh-to-mut-correction-$(date -u +%Y%m%dT%H%M%SZ).dump"
"$PG_DUMP" "$DB_URL" --format=custom --no-owner --no-acl --file="$BACKUP_FILE"
test -s "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
BACKUP_SHA=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
node -e 'const fs=require("fs");fs.writeFileSync("artifacts/catalog-remap/backup.json",JSON.stringify({status:"BACKUP_PASS",file:process.argv[1],sha256:process.argv[2],bytes:Number(process.argv[3])},null,2)+"\\n")' "$BACKUP_FILE" "$BACKUP_SHA" "$(stat -c %s "$BACKUP_FILE")"
node apps/backend/scripts/sinh-to-mut-correction-engine.mjs --manifest=data/catalog-remap/sinh-to-mut-correction-01.json --commercial-file=data/private/catalog-imports/sinh-to-mut-correction-01.private.json --apply --allow-remote-apply --confirm-production=BEPSI_SINH_TO_MUT_CORRECTION_25 --output-json=artifacts/catalog-remap/sinh-to-mut-correction-01-apply.json
node -e 'const r=require("./artifacts/catalog-remap/sinh-to-mut-correction-01-apply.json");if(r.status!=="SINH_TO_MUT_CORRECTION_APPLY_PASS"||r.verification?.recipeMismatchCount!==0||r.verification?.updateExistingVariantIdsPreservedCount!==23||r.verification?.remapAliasCount!==2)process.exit(2)'
curl -fsS http://127.0.0.1:5100/api/health > artifacts/catalog-remap/sinh-to-mut-correction-01-health.json
node -e 'const fs=require("fs");const r=require("./artifacts/catalog-remap/sinh-to-mut-correction-01-apply.json");fs.writeFileSync("artifacts/catalog-remap/final.json",JSON.stringify({status:"SINH_TO_MUT_CORRECTION_PRODUCTION_PASS",backup:require("./artifacts/catalog-remap/backup.json"),dryRun:require("./artifacts/catalog-remap/sinh-to-mut-correction-01-dry-run.json"),apply:r,health:JSON.parse(fs.readFileSync("artifacts/catalog-remap/sinh-to-mut-correction-01-health.json","utf8")),service:"${remoteService}",port:5100},null,2)+"\\n")'
`;
  const encoded = Buffer.from(remoteScript, "utf8").toString("base64");
  ssh(`printf '%s' '${encoded}' | base64 -d | sudo -n bash`);

  download(`${remoteDir}/artifacts/catalog-remap/backup.json`, "sinh-to-mut-correction-backup.json");
  download(`${remoteDir}/artifacts/catalog-remap/sinh-to-mut-correction-01-dry-run.json`, "sinh-to-mut-correction-dry-run.json");
  download(`${remoteDir}/artifacts/catalog-remap/sinh-to-mut-correction-01-apply.json`, "sinh-to-mut-correction-apply.json");
  download(`${remoteDir}/artifacts/catalog-remap/sinh-to-mut-correction-01-health.json`, "sinh-to-mut-correction-health.json");
  const finalPath = download(`${remoteDir}/artifacts/catalog-remap/final.json`, "sinh-to-mut-correction-final.json");
  if (!finalPath) throw new Error("Final production report was not downloaded.");
  const final = JSON.parse(fs.readFileSync(finalPath, "utf8"));
  if (final.status !== "SINH_TO_MUT_CORRECTION_PRODUCTION_PASS") throw new Error("Final production report is invalid.");
  console.log(`[sinh-to-mut-correction-production] ${final.status}; rows=${final.apply?.verification?.canonicalVariantCount}; aliases=${final.apply?.verification?.aliasCount}; backup=${final.backup.file}`);
} finally {
  ssh(`sudo -n rm -rf '${remoteDir}'`, { allowFailure: true, capture: true });
}
