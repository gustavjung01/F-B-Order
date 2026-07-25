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
const remoteDir = `${remoteRoot}/.tmp/catalog-remap-batch-dry-run-${Date.now()}-${process.pid}`;
const localArtifactsDir = path.join(repoRoot, "artifacts/catalog-remap");

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function fail(message) {
  console.error(`[catalog-remap-batch-dry-run] ${message}`);
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
  fail("This command is dry-run only. Apply and rollback are intentionally blocked.");
}

const manifestPath = resolveRepoPath(argument("manifest", "data/catalog-remap/tea-batch-02.json"));
const auditVerificationPath = resolveRepoPath(argument(
  "audit-verification",
  "data/catalog-remap/tea-batch-02-audit-verification.json",
));
const commercialArg = argument("commercial-file");
if (!commercialArg) fail("--commercial-file is required.");
const commercialPath = resolveRepoPath(commercialArg);
if (!fs.existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}`);
if (!fs.existsSync(auditVerificationPath)) fail(`Audit verification not found: ${auditVerificationPath}`);
if (!fs.existsSync(commercialPath)) fail(`Commercial payload not found: ${commercialPath}`);
if (!fs.existsSync(sshKey)) fail(`SSH key not found: ${sshKey}`);

const dryRunPath = path.join(here, "dry-run-catalog-remap-batch.mjs");
if (!fs.existsSync(dryRunPath)) fail(`Batch dry-run script not found: ${dryRunPath}`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
const groupKey = String(manifest.groupKey || "batch").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
const localJsonPath = path.join(localArtifactsDir, `${groupKey}-dry-run.json`);
const localCsvPath = path.join(localArtifactsDir, `${groupKey}-dry-run.csv`);

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

function download(remoteName, localPath, label) {
  const probe = run("ssh", [...sshArgs, sshTarget, `sudo -n test -f '${remoteDir}/${remoteName}'`], { allowFailure: true, capture: true });
  if (probe.status !== 0) return false;
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  run("scp", [...scpArgs, `${sshTarget}:${remoteDir}/${remoteName}`, localPath]);
  console.log(`[catalog-remap-batch-dry-run] ${label} saved: ${localPath}`);
  return true;
}

console.log(`[catalog-remap-batch-dry-run] VPS target: ${sshTarget}${remoteRoot}`);
console.log(`[catalog-remap-batch-dry-run] Task: ${manifest.taskId}; rows=${manifest.rows?.length || 0}`);
console.log("[catalog-remap-batch-dry-run] Mode: READ ONLY; no migration, SKU update, DB write, R2 write, restart, or deploy.");

try {
  run("ssh", [
    ...sshArgs,
    sshTarget,
    `set -euo pipefail; sudo -n test -d '${remoteRoot}'; sudo -n test -f '${remoteEnv}'; sudo -n systemctl is-active --quiet '${remoteService}'; sudo -n mkdir -p '${remoteDir}'; sudo -n chown ubuntu:ubuntu '${remoteDir}'; chmod 700 '${remoteDir}'`,
  ]);

  run("scp", [
    ...scpArgs,
    dryRunPath,
    manifestPath,
    auditVerificationPath,
    commercialPath,
    `${sshTarget}:${remoteDir}/`,
  ]);

  const dryRunName = path.basename(dryRunPath);
  const manifestName = path.basename(manifestPath);
  const auditVerificationName = path.basename(auditVerificationPath);
  const commercialName = path.basename(commercialPath);
  const remoteScript = [
    "set -euo pipefail",
    `cd '${remoteDir}'`,
    `chmod 600 '${manifestName}' '${auditVerificationName}' '${commercialName}'`,
    `SERVICE_PID=$(systemctl show --property MainPID --value '${remoteService}')`,
    `test -n "$SERVICE_PID" && test "$SERVICE_PID" -gt 0`,
    `SERVICE_CWD=$(readlink -f "/proc/$SERVICE_PID/cwd")`,
    `test -n "$SERVICE_CWD"`,
    `case "$SERVICE_CWD" in '${remoteRoot}'|'${remoteRoot}'/*) ;; *) echo "Unexpected Bếp Sỉ service cwd: $SERVICE_CWD" >&2; exit 1 ;; esac`,
    "mkdir -p node_modules",
    `for PACKAGE_NAME in pg dotenv; do PACKAGE_JSON=$(find "$SERVICE_CWD" '${remoteRoot}' -type f -path "*/node_modules/$PACKAGE_NAME/package.json" -print -quit 2>/dev/null || true); if [ -z "$PACKAGE_JSON" ]; then echo "Bếp Sỉ runtime package not found: $PACKAGE_NAME" >&2; exit 1; fi; ln -s "$(dirname "$PACKAGE_JSON")" "node_modules/$PACKAGE_NAME"; done`,
    "set -a",
    `. '${remoteEnv}'`,
    "set +a",
    `test -n "\${DATABASE_URL:-\${BEPSI_DATABASE_URL:-}}"`,
    "set +e",
    `node '${dryRunName}' --manifest='${manifestName}' --audit-verification='${auditVerificationName}' --commercial-file='${commercialName}' --output-json='dry-run.json' --output-csv='dry-run.csv'`,
    "DRY_RUN_STATUS=$?",
    "set -e",
    "if [ \"$DRY_RUN_STATUS\" -ne 0 ] && [ \"$DRY_RUN_STATUS\" -ne 2 ]; then exit \"$DRY_RUN_STATUS\"; fi",
    "exit 0",
  ].join("\n");

  const encoded = Buffer.from(remoteScript, "utf8").toString("base64");
  run("ssh", [...sshArgs, sshTarget, `printf '%s' '${encoded}' | base64 -d | sudo -n bash`]);
  const jsonSaved = download("dry-run.json", localJsonPath, "JSON dry-run");
  const csvSaved = download("dry-run.csv", localCsvPath, "CSV dry-run");
  if (!jsonSaved || !csvSaved) throw new Error("Batch dry-run completed without both report files.");

  const report = JSON.parse(fs.readFileSync(localJsonPath, "utf8"));
  console.log(`[catalog-remap-batch-dry-run] ${report.status}; rows=${report.summary?.rowCount}; pass=${report.summary?.rowPassCount}; blocked=${report.summary?.rowBlockedCount}; canApplyNow=${report.canApplyNow}; canApplyAfterMigration=${report.canApplyAfterMigration}`);
  for (const blocker of report.summary?.globalBlockers || []) {
    console.error(`[catalog-remap-batch-dry-run] Global blocker: ${blocker}`);
  }
  for (const parent of report.parents || []) {
    if (!parent.pass) {
      console.error(`[catalog-remap-batch-dry-run] Parent ${parent.productKey}: ${(parent.blockers || []).join(", ")}`);
    }
  }
  for (const row of report.rows || []) {
    if (!row.pass) {
      console.error(`[catalog-remap-batch-dry-run] ${row.action} ${row.legacySku || "-"} -> ${row.canonicalSku}: ${(row.blockers || []).join(", ")}`);
    }
  }
  console.log("[catalog-remap-batch-dry-run] Nothing was written to production.");
  if (report.status !== "BATCH_DRY_RUN_PASS") process.exitCode = 2;
} catch (error) {
  console.error(`[catalog-remap-batch-dry-run] VPS dry-run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  run("ssh", [...sshArgs, sshTarget, `sudo -n rm -rf '${remoteDir}'`], { allowFailure: true, capture: true });
}
