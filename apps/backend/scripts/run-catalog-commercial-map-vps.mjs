import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const defaultPayload = path.join(repoRoot, "data/private/catalog-imports/kenh-quan-commercial-map.json");
const defaultKey = "F:\\1_A_Disk_D\\khuong-binh\\TK\\Orcle\\vps-40.233.83.234-backend\\ssh-key-1-1-E1.key";
const sshKey = process.env.BEPSI_SSH_KEY || defaultKey;
const sshTarget = process.env.BEPSI_SSH_TARGET || "ubuntu@40.233.83.234";
const remoteRoot = "/srv/apps/bepsi";
const remoteEnv = "/etc/app-env/bepsi.env";
const remoteService = "bepsi-api.service";
const remoteDir = `${remoteRoot}/.tmp/catalog-commercial-map-${Date.now()}-${process.pid}`;
const localReportPath = path.join(repoRoot, "artifacts/catalog-commercial-import/reconciliation.json");

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function fail(message) {
  console.error(`[catalog-commercial] ${message}`);
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
  fail("This VPS command is dry-run only. Apply and rollback are intentionally blocked.");
}

const suppliedPayload = argument("file", defaultPayload);
const payloadPath = path.isAbsolute(suppliedPayload)
  ? suppliedPayload
  : path.resolve(repoRoot, suppliedPayload);

if (!fs.existsSync(payloadPath)) fail(`Payload file not found: ${payloadPath}`);
if (!fs.existsSync(sshKey)) fail(`SSH key not found: ${sshKey}`);

const importerPath = path.join(here, "import-catalog-commercial-map.mjs");
const helperPath = path.join(here, "catalog-commercial-map.mjs");
const reconciliationPath = path.join(here, "audit-catalog-commercial-map-reconciliation.mjs");
for (const requiredPath of [importerPath, helperPath, reconciliationPath]) {
  if (!fs.existsSync(requiredPath)) fail(`Required script not found: ${requiredPath}`);
}

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

console.log(`[catalog-commercial] VPS dry-run target: ${sshTarget}${remoteRoot}`);
console.log(`[catalog-commercial] Service: ${remoteService}`);
console.log(`[catalog-commercial] Environment: ${remoteEnv}`);
console.log("[catalog-commercial] Mode: READ ONLY; no migration, import, service restart, or deploy.");

try {
  run("ssh", [
    ...sshArgs,
    sshTarget,
    `set -euo pipefail; sudo -n test -d '${remoteRoot}'; sudo -n test -f '${remoteEnv}'; sudo -n systemctl is-active --quiet '${remoteService}'; sudo -n mkdir -p '${remoteDir}'; sudo -n chown ubuntu:ubuntu '${remoteDir}'; chmod 700 '${remoteDir}'`,
  ]);

  run("scp", [
    ...scpArgs,
    importerPath,
    helperPath,
    reconciliationPath,
    payloadPath,
    `${sshTarget}:${remoteDir}/`,
  ]);

  const payloadName = path.basename(payloadPath);
  const remoteScript = [
    "set -euo pipefail",
    `cd '${remoteDir}'`,
    `chmod 600 '${payloadName}'`,
    `SERVICE_PID=$(systemctl show --property MainPID --value '${remoteService}')`,
    `test -n "$SERVICE_PID" && test "$SERVICE_PID" -gt 0`,
    `SERVICE_CWD=$(readlink -f "/proc/$SERVICE_PID/cwd")`,
    `test -n "$SERVICE_CWD"`,
    `mkdir -p node_modules`,
    `for PACKAGE_NAME in pg dotenv; do PACKAGE_JSON=$(find "$SERVICE_CWD" '${remoteRoot}' /srv/apps -type f -path "*/node_modules/$PACKAGE_NAME/package.json" -print -quit 2>/dev/null || true); if [ -z "$PACKAGE_JSON" ]; then echo "Bếp Sỉ runtime package not found: $PACKAGE_NAME (service cwd: $SERVICE_CWD)" >&2; exit 1; fi; ln -s "$(dirname "$PACKAGE_JSON")" "node_modules/$PACKAGE_NAME"; done`,
    "set -a",
    `. '${remoteEnv}'`,
    "set +a",
    `test -n "\${DATABASE_URL:-\${BEPSI_DATABASE_URL:-}}"`,
    "set +e",
    `node import-catalog-commercial-map.mjs --file='${payloadName}'`,
    "IMPORT_STATUS=$?",
    "set -e",
    "if [ \"$IMPORT_STATUS\" -eq 2 ]; then",
    `  node audit-catalog-commercial-map-reconciliation.mjs --file='${payloadName}' --output='reconciliation.json'`,
    "elif [ \"$IMPORT_STATUS\" -ne 0 ]; then",
    "  exit \"$IMPORT_STATUS\"",
    "fi",
  ].join("\n");
  const encodedScript = Buffer.from(remoteScript, "utf8").toString("base64");
  const remoteCommand = `printf '%s' '${encodedScript}' | base64 -d | sudo -n bash`;

  run("ssh", [...sshArgs, sshTarget, remoteCommand]);

  const reportProbe = run("ssh", [
    ...sshArgs,
    sshTarget,
    `sudo -n test -f '${remoteDir}/reconciliation.json'`,
  ], { allowFailure: true, capture: true });
  if (reportProbe.status === 0) {
    fs.mkdirSync(path.dirname(localReportPath), { recursive: true });
    run("scp", [
      ...scpArgs,
      `${sshTarget}:${remoteDir}/reconciliation.json`,
      localReportPath,
    ]);
    console.log(`[catalog-commercial] Reconciliation report saved: ${localReportPath}`);
  }
} catch (error) {
  console.error(`[catalog-commercial] VPS dry-run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  run("ssh", [
    ...sshArgs,
    sshTarget,
    `sudo -n rm -rf '${remoteDir}'`,
  ], { allowFailure: true, capture: true });
}
