import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const sshKey = process.env.BEPSI_SSH_KEY || "F:\\1_A_Disk_D\\khuong-binh\\TK\\Orcle\\vps-40.233.83.234-backend\\ssh-key-1-1-E1.key";
const sshTarget = process.env.BEPSI_SSH_TARGET || "ubuntu@40.233.83.234";
const remoteRoot = "/srv/apps/bepsi";
const remoteEnv = "/etc/app-env/bepsi.env";
const remoteService = "bepsi-api.service";
const remoteDir = `${remoteRoot}/.tmp/sinh-to-mut-correction-dry-run-${Date.now()}-${process.pid}`;
const artifactsDir = path.join(repoRoot, "artifacts/catalog-remap");

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function fail(message) {
  console.error(`[sinh-to-mut-correction-dry-run] ${message}`);
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
  fail("Wrapper này chỉ chạy dry-run read-only. Apply và rollback bị khóa.");
}

const manifestPath = resolveRepoPath(argument("manifest", "data/catalog-remap/sinh-to-mut-correction-01.json"));
const commercialPath = resolveRepoPath(argument("commercial-file", "data/private/catalog-imports/sinh-to-mut-correction-01.private.json"));
const enginePath = path.join(here, "sinh-to-mut-correction-engine.mjs");
const commonPath = path.join(here, "catalog-remap-batch-common.mjs");
const correctionCommonPath = path.join(here, "sinh-to-mut-correction-common.mjs");
const correctionStatePath = path.join(here, "sinh-to-mut-correction-state.mjs");

for (const required of [manifestPath, commercialPath, enginePath, commonPath, correctionCommonPath, correctionStatePath, sshKey]) {
  if (!fs.existsSync(required)) fail(`Không tìm thấy file: ${required}`);
}

const localJson = path.join(artifactsDir, "sinh-to-mut-correction-01-dry-run.json");
const localCsv = path.join(artifactsDir, "sinh-to-mut-correction-01-dry-run.csv");
const sshArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", "-i", sshKey];
const scpArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", "-i", sshKey];

function download(remoteName, localPath) {
  const probe = run("ssh", [...sshArgs, sshTarget, `sudo -n test -f '${remoteDir}/${remoteName}'`], { allowFailure: true, capture: true });
  if (probe.status !== 0) return false;
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  run("scp", [...scpArgs, `${sshTarget}:${remoteDir}/${remoteName}`, localPath]);
  return true;
}

console.log(`[sinh-to-mut-correction-dry-run] VPS: ${sshTarget}${remoteRoot}`);
console.log("[sinh-to-mut-correction-dry-run] Mode: READ ONLY; không migration, DB write, service restart hoặc R2 write.");

try {
  run("ssh", [...sshArgs, sshTarget,
    `set -euo pipefail; sudo -n test -d '${remoteRoot}'; sudo -n test -f '${remoteEnv}'; sudo -n systemctl is-active --quiet '${remoteService}'; sudo -n mkdir -p '${remoteDir}'; sudo -n chown ubuntu:ubuntu '${remoteDir}'; chmod 700 '${remoteDir}'`,
  ]);

  run("scp", [...scpArgs, enginePath, commonPath, correctionCommonPath, correctionStatePath, manifestPath, commercialPath, `${sshTarget}:${remoteDir}/`]);

  const engineName = path.basename(enginePath);
  const manifestName = path.basename(manifestPath);
  const commercialName = path.basename(commercialPath);
  const remoteScript = [
    "set -euo pipefail",
    `cd '${remoteDir}'`,
    `chmod 600 '${manifestName}' '${commercialName}'`,
    `SERVICE_PID=$(systemctl show --property MainPID --value '${remoteService}')`,
    `test -n "$SERVICE_PID" && test "$SERVICE_PID" -gt 0`,
    `SERVICE_CWD=$(readlink -f "/proc/$SERVICE_PID/cwd")`,
    `case "$SERVICE_CWD" in '${remoteRoot}'|'${remoteRoot}'/*) ;; *) echo "Unexpected Bếp Sỉ service cwd: $SERVICE_CWD" >&2; exit 1 ;; esac`,
    "mkdir -p node_modules",
    `for PACKAGE_NAME in pg dotenv; do PACKAGE_JSON=$(find "$SERVICE_CWD" '${remoteRoot}' -type f -path "*/node_modules/$PACKAGE_NAME/package.json" -print -quit 2>/dev/null || true); test -n "$PACKAGE_JSON"; ln -s "$(dirname "$PACKAGE_JSON")" "node_modules/$PACKAGE_NAME"; done`,
    "set -a",
    `. '${remoteEnv}'`,
    "set +a",
    `node '${engineName}' --manifest='${manifestName}' --commercial-file='${commercialName}' --output-json='dry-run.json' --output-csv='dry-run.csv'`,
  ].join("\n");

  const encoded = Buffer.from(remoteScript, "utf8").toString("base64");
  const execution = run("ssh", [...sshArgs, sshTarget, `printf '%s' '${encoded}' | base64 -d | sudo -n bash`], { allowFailure: true });
  const jsonSaved = download("dry-run.json", localJson);
  const csvSaved = download("dry-run.csv", localCsv);
  if (!jsonSaved || !csvSaved) throw new Error("Dry-run không tạo đủ JSON/CSV.");
  const report = JSON.parse(fs.readFileSync(localJson, "utf8"));
  console.log(`[sinh-to-mut-correction-dry-run] ${report.status}; rows=${report.summary?.rowCount}; pass=${report.summary?.rowPassCount}; blocked=${report.summary?.rowBlockedCount}`);
  console.log(`[sinh-to-mut-correction-dry-run] JSON: ${localJson}`);
  console.log(`[sinh-to-mut-correction-dry-run] CSV: ${localCsv}`);
  console.log("[sinh-to-mut-correction-dry-run] Không có dữ liệu production nào bị thay đổi.");
  if (execution.status !== 0 || report.status !== "SINH_TO_MUT_CORRECTION_DRY_RUN_PASS") process.exitCode = 2;
} catch (error) {
  console.error(`[sinh-to-mut-correction-dry-run] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  run("ssh", [...sshArgs, sshTarget, `sudo -n rm -rf '${remoteDir}'`], { allowFailure: true, capture: true });
}
