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
const remoteDir = `${remoteRoot}/.tmp/catalog-remap-${Date.now()}-${process.pid}`;
const localArtifactsDir = path.join(repoRoot, "artifacts/catalog-remap");

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function fail(message) {
  console.error(`[catalog-remap] ${message}`);
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
  fail("This command is audit-only. Apply and rollback are intentionally blocked.");
}

const manifestPath = path.resolve(argument("manifest", path.join(repoRoot, "data/catalog-remap/tea-novia.json")));
const commercialArg = argument("commercial-file");
if (!commercialArg) fail("--commercial-file is required so price and packaging can be checked against the private payload.");
const commercialPath = path.resolve(commercialArg);
if (!fs.existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}`);
if (!fs.existsSync(commercialPath)) fail(`Commercial payload not found: ${commercialPath}`);
if (!fs.existsSync(sshKey)) fail(`SSH key not found: ${sshKey}`);

const auditPath = path.join(here, "audit-catalog-remap-group.mjs");
if (!fs.existsSync(auditPath)) fail(`Audit script not found: ${auditPath}`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
const groupKey = String(manifest.groupKey || "group").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
const localJsonPath = path.join(localArtifactsDir, `${groupKey}-audit.json`);
const localCsvPath = path.join(localArtifactsDir, `${groupKey}-audit.csv`);

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
  console.log(`[catalog-remap] ${label} saved: ${localPath}`);
  return true;
}

console.log(`[catalog-remap] VPS audit target: ${sshTarget}${remoteRoot}`);
console.log(`[catalog-remap] Group: ${manifest.groupKey}`);
console.log("[catalog-remap] Mode: READ ONLY; no SKU update, migration, import, R2 write, restart, or deploy.");

try {
  run("ssh", [
    ...sshArgs,
    sshTarget,
    `set -euo pipefail; sudo -n test -d '${remoteRoot}'; sudo -n test -f '${remoteEnv}'; sudo -n systemctl is-active --quiet '${remoteService}'; sudo -n mkdir -p '${remoteDir}'; sudo -n chown ubuntu:ubuntu '${remoteDir}'; chmod 700 '${remoteDir}'`,
  ]);

  run("scp", [
    ...scpArgs,
    auditPath,
    manifestPath,
    commercialPath,
    `${sshTarget}:${remoteDir}/`,
  ]);

  const auditName = path.basename(auditPath);
  const manifestName = path.basename(manifestPath);
  const commercialName = path.basename(commercialPath);
  const remoteScript = [
    "set -euo pipefail",
    `cd '${remoteDir}'`,
    `chmod 600 '${manifestName}' '${commercialName}'`,
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
    `node '${auditName}' --manifest='${manifestName}' --commercial-file='${commercialName}' --output-json='audit.json' --output-csv='audit.csv'`,
    "AUDIT_STATUS=$?",
    "set -e",
    "if [ \"$AUDIT_STATUS\" -ne 0 ] && [ \"$AUDIT_STATUS\" -ne 2 ]; then exit \"$AUDIT_STATUS\"; fi",
    "exit 0",
  ].join("\n");

  const encoded = Buffer.from(remoteScript, "utf8").toString("base64");
  run("ssh", [...sshArgs, sshTarget, `printf '%s' '${encoded}' | base64 -d | sudo -n bash`]);
  const jsonSaved = download("audit.json", localJsonPath, "JSON audit");
  const csvSaved = download("audit.csv", localCsvPath, "CSV audit");
  if (!jsonSaved || !csvSaved) throw new Error("Audit completed without both report files.");
  console.log("[catalog-remap] Audit complete. Review blockers and image mappings; nothing was written to production.");
} catch (error) {
  console.error(`[catalog-remap] VPS audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  run("ssh", [...sshArgs, sshTarget, `sudo -n rm -rf '${remoteDir}'`], { allowFailure: true, capture: true });
}
