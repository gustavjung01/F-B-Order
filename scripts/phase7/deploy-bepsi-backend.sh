#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_SHA="${1:-}"
APP_ROOT="/srv/apps/bepsi"
SOURCE_DIR="/srv/apps/bepsi/source"
CURRENT_LINK="/srv/apps/bepsi/current"
RELEASES_DIR="/srv/apps/bepsi/releases"
WORKTREES_DIR="/srv/apps/bepsi/worktrees"
BACKUP_DIR="/srv/apps/bepsi/backups"
ENV_FILE="/etc/app-env/bepsi.env"
SERVICE_NAME="bepsi-api.service"
WORKER_SERVICE_NAME="bepsi-ai-worker.service"
WORKER_UNIT_RELATIVE="scripts/phase7/systemd/bepsi-ai-worker.service"
WORKER_UNIT_PATH="/etc/systemd/system/${WORKER_SERVICE_NAME}"
API_BASE_URL="${API_BASE_URL:-https://api.bepsi.click}"
EXPECTED_BACKEND_VERSION="${BEPSI_EXPECTED_BACKEND_VERSION:-catalog-v2-backend}"
LOCK_FILE="/var/lock/bepsi-phase7-deploy.lock"
REPO_URL_PATTERN='github\.com[:/]gustavjung01/F-B-Order(\.git)?$'
DEPLOY_USER="$(id -un)"
DEPLOY_GROUP="$(id -gn)"
BACKUP_RETENTION_DAYS="${BEPSI_BACKUP_RETENTION_DAYS:-30}"
RELEASE_RETENTION_COUNT="${BEPSI_RELEASE_RETENTION_COUNT:-10}"

log() {
  printf '[phase7-backend] %s\n' "$*"
}

die() {
  printf '[phase7-backend] ERROR: %s\n' "$*" >&2
  exit 1
}

fetch_with_retry() {
  local url="$1"
  local label="$2"
  local attempts="${3:-30}"
  local delay_seconds="${4:-2}"
  local attempt
  local body

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if body="$(curl --fail --silent --show-error --max-time 15 "$url")"; then
      printf '%s' "$body"
      return 0
    fi
    if ((attempt < attempts)); then
      log "${label} not ready (attempt ${attempt}/${attempts}); retrying in ${delay_seconds}s"
      sleep "$delay_seconds"
    fi
  done

  die "${label} did not become ready after ${attempts} attempts: ${url}"
}

wait_for_service_active() {
  local service="$1"
  local attempts="${2:-10}"
  local delay_seconds="${3:-2}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if sudo systemctl is-active --quiet "$service"; then
      if ((attempt >= 3)); then
        return 0
      fi
    fi
    sleep "$delay_seconds"
  done

  sudo systemctl status "$service" --no-pager || true
  die "Systemd service did not remain active: ${service}"
}

[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || die "Target commit must be a full 40-character SHA."

for command in git flock rsync corepack node curl pg_dump sudo find; do
  command -v "$command" >/dev/null 2>&1 || die "Required command is missing: $command"
done
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "BEPSI_BACKUP_RETENTION_DAYS must be a non-negative integer."
[[ "$RELEASE_RETENTION_COUNT" =~ ^[1-9][0-9]*$ ]] || die "RELEASE_RETENTION_COUNT must be a positive integer."

[[ -d "${SOURCE_DIR}/.git" ]] || die "Bếp Sỉ source repository is missing: ${SOURCE_DIR}"
[[ -f "$ENV_FILE" ]] || die "Bếp Sỉ environment file is missing: ${ENV_FILE}"
[[ -L "$CURRENT_LINK" ]] || die "${CURRENT_LINK} must be a release symlink before production deployment."

SOURCE_REAL="$(readlink -f "$SOURCE_DIR")"
CURRENT_REAL="$(readlink -f "$CURRENT_LINK")"
[[ "$SOURCE_REAL" == "$APP_ROOT"/* ]] || die "Source path escaped Bếp Sỉ root."
[[ "$CURRENT_REAL" == "$APP_ROOT"/* ]] || die "Current release escaped Bếp Sỉ root."
[[ "$SOURCE_REAL" != *"/vlgn"* && "$SOURCE_REAL" != *"/tocviet"* ]] || die "Refusing to touch another application."
[[ "$CURRENT_REAL" != *"/vlgn"* && "$CURRENT_REAL" != *"/tocviet"* ]] || die "Refusing to touch another application."

REMOTE_URL="$(git -C "$SOURCE_DIR" remote get-url origin)"
[[ "$REMOTE_URL" =~ $REPO_URL_PATTERN ]] || die "Unexpected git remote: ${REMOTE_URL}"

SERVICE_UNIT="$(sudo systemctl cat "$SERVICE_NAME")"
printf '%s' "$SERVICE_UNIT" | grep -Fq "$CURRENT_LINK" || die "${SERVICE_NAME} is not configured to run from ${CURRENT_LINK}."
printf '%s' "$SERVICE_UNIT" | grep -Eiq 'vlgn|tocviet' && die "Service unit contains another application path."
SERVICE_USER="$(sudo systemctl show -p User --value "$SERVICE_NAME")"
SERVICE_GROUP="$(sudo systemctl show -p Group --value "$SERVICE_NAME")"
[[ -n "$SERVICE_USER" ]] || SERVICE_USER=root
[[ -n "$SERVICE_GROUP" ]] || SERVICE_GROUP="$SERVICE_USER"

if sudo systemctl cat "$WORKER_SERVICE_NAME" >/dev/null 2>&1; then
  EXISTING_WORKER_UNIT="$(sudo systemctl cat "$WORKER_SERVICE_NAME")"
  printf '%s' "$EXISTING_WORKER_UNIT" | grep -Fq "$CURRENT_LINK" || die "${WORKER_SERVICE_NAME} is not configured to run from ${CURRENT_LINK}."
  printf '%s' "$EXISTING_WORKER_UNIT" | grep -Eiq 'vlgn|tocviet' && die "Worker service unit contains another application path."
fi

log "Preparing writable Bếp Sỉ deployment directories"
sudo install -d -o "$DEPLOY_USER" -g "$SERVICE_GROUP" -m 0750 "$RELEASES_DIR"
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0750 "$WORKTREES_DIR"
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0700 "$BACKUP_DIR"
sudo touch "$LOCK_FILE"
sudo chown "$DEPLOY_USER:$DEPLOY_GROUP" "$LOCK_FILE"
sudo chmod 0600 "$LOCK_FILE"

exec 9>"$LOCK_FILE"
flock -n 9 || die "Another Bếp Sỉ production deployment is running."

DEPLOY_WORKTREE="${WORKTREES_DIR}/${TARGET_SHA}"
WORKTREE_READY=0

cleanup_worktree() {
  if [[ "$WORKTREE_READY" -eq 1 ]]; then
    git -C "$SOURCE_DIR" worktree remove --force "$DEPLOY_WORKTREE" >/dev/null 2>&1 || true
  fi
  git -C "$SOURCE_DIR" worktree prune >/dev/null 2>&1 || true
}
trap cleanup_worktree EXIT

log "Fetching origin/main without modifying the dirty source checkout"
git -C "$SOURCE_DIR" fetch --prune origin main
ACTUAL_SHA="$(git -C "$SOURCE_DIR" rev-parse refs/remotes/origin/main)"
[[ "$ACTUAL_SHA" == "$TARGET_SHA" ]] || die "origin/main is ${ACTUAL_SHA}, expected ${TARGET_SHA}."

git -C "$SOURCE_DIR" worktree remove --force "$DEPLOY_WORKTREE" >/dev/null 2>&1 || true
rm -rf "$DEPLOY_WORKTREE"
git -C "$SOURCE_DIR" worktree prune
log "Creating clean detached worktree for ${TARGET_SHA}"
git -C "$SOURCE_DIR" worktree add --force --detach "$DEPLOY_WORKTREE" "$TARGET_SHA"
WORKTREE_READY=1
[[ "$(git -C "$DEPLOY_WORKTREE" rev-parse HEAD)" == "$TARGET_SHA" ]] || die "Deploy worktree resolved the wrong commit."
[[ -z "$(git -C "$DEPLOY_WORKTREE" status --porcelain)" ]] || die "Deploy worktree is not clean."

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export DB_SSL_REJECT_UNAUTHORIZED="${DB_SSL_REJECT_UNAUTHORIZED:-false}"
DATABASE_URL_VALUE="${BEPSI_DATABASE_URL:-${DATABASE_URL:-}}"
[[ -n "$DATABASE_URL_VALUE" ]] || die "BEPSI_DATABASE_URL or DATABASE_URL is missing from ${ENV_FILE}."
LOCAL_API_BASE_URL="${BEPSI_LOCAL_API_BASE_URL:-http://127.0.0.1:${PORT:-5100}}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_BACKUP="${BACKUP_DIR}/bepsi-${TIMESTAMP}-${TARGET_SHA:0:12}.dump"
PREVIOUS_TARGET="$CURRENT_REAL"
RELEASE_DIR="${RELEASES_DIR}/${TARGET_SHA}"
TEMP_RELEASE="${RELEASES_DIR}/.${TARGET_SHA}.tmp"
SWITCHED=0

rollback_code() {
  local status=$?
  if [[ "$SWITCHED" -eq 1 ]]; then
    log "Deployment failed after release switch; restoring ${PREVIOUS_TARGET}"
    sudo ln -sfn "$PREVIOUS_TARGET" "${CURRENT_LINK}.rollback"
    sudo mv -Tf "${CURRENT_LINK}.rollback" "$CURRENT_LINK"
    sudo systemctl restart "$SERVICE_NAME" || true
    if [[ -r "$PREVIOUS_TARGET/apps/backend/dist/ai-worker.js" ]]; then
      sudo systemctl restart "$WORKER_SERVICE_NAME" || true
    else
      sudo systemctl stop "$WORKER_SERVICE_NAME" || true
    fi
  fi
  log "Database changes are forward-only; no automatic down migration was attempted."
  exit "$status"
}
trap rollback_code ERR

log "Creating production database backup: ${DB_BACKUP}"
(
  umask 077
  ${PG_DUMP_BIN:-/usr/lib/postgresql/17/bin/pg_dump} \
    --dbname="$DATABASE_URL_VALUE" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="$DB_BACKUP"
)
[[ -s "$DB_BACKUP" ]] || die "Database backup is empty."

log "Preparing immutable release ${RELEASE_DIR}"
rm -rf "$TEMP_RELEASE"
mkdir -p "$TEMP_RELEASE"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  "$DEPLOY_WORKTREE/" "$TEMP_RELEASE/"
rm -rf "$RELEASE_DIR"
mv "$TEMP_RELEASE" "$RELEASE_DIR"

cd "$RELEASE_DIR"
corepack pnpm install --frozen-lockfile
corepack pnpm build:backend

log "Granting ${SERVICE_USER}:${SERVICE_GROUP} access to the immutable release"
sudo chgrp -R "$SERVICE_GROUP" "$RELEASE_DIR"
sudo find "$RELEASE_DIR" -type d -exec chmod g+rx {} +
sudo find "$RELEASE_DIR" -type f -exec chmod g+r {} +
sudo -u "$SERVICE_USER" test -x "$RELEASE_DIR/apps/backend"
sudo -u "$SERVICE_USER" test -r "$RELEASE_DIR/apps/backend/dist/main.js"
sudo -u "$SERVICE_USER" test -r "$RELEASE_DIR/apps/backend/dist/ai-worker.js"
test -r "$RELEASE_DIR/$WORKER_UNIT_RELATIVE"
grep -Fq "$CURRENT_LINK" "$RELEASE_DIR/$WORKER_UNIT_RELATIVE" || die "Worker unit must run from ${CURRENT_LINK}."
grep -Eiq 'vlgn|tocviet' "$RELEASE_DIR/$WORKER_UNIT_RELATIVE" && die "Worker unit contains another application path."

log "Auditing production database before migration"
corepack pnpm --filter @fb-order/backend db:audit:schema > "${BACKUP_DIR}/schema-before-${TIMESTAMP}-${TARGET_SHA:0:12}.json"

log "Verifying the audited Phase 1 production contract"
corepack pnpm db:verify:order-contract

LEDGER_ROW_COUNT="$(corepack pnpm --filter @fb-order/backend exec node --input-type=module <<'NODE'
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.BEPSI_DATABASE_URL || process.env.DATABASE_URL;
const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
const allowInsecure = process.env.DB_SSL_REJECT_UNAUTHORIZED === "false";
const ca = process.env.DB_SSL_CA?.replace(/\\n/g, "\n");
const ssl = isLocal ? false : { rejectUnauthorized: !allowInsecure, ...(ca ? { ca } : {}) };
const pool = new Pool({ connectionString, max: 1, ssl });
try {
  const exists = await pool.query(`
    SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists
  `);
  if (!exists.rows[0].exists) {
    console.log("missing");
  } else {
    const count = await pool.query("SELECT count(*)::int AS count FROM schema_migrations");
    console.log(String(count.rows[0].count));
  }
} finally {
  await pool.end();
}
NODE
)"

if [[ "$LEDGER_ROW_COUNT" == "missing" || "$LEDGER_ROW_COUNT" == "0" ]]; then
  log "Adopting the audited Phase 1 production schema into the migration ledger"
  corepack pnpm db:migrate:baseline
else
  log "Migration ledger already contains ${LEDGER_ROW_COUNT} row(s); baseline adoption is not required"
fi

log "Running pending production migrations"
corepack pnpm db:migrate

log "Importing production catalog"
corepack pnpm catalog:import

log "Auditing production database after migration and import"
corepack pnpm --filter @fb-order/backend db:audit:schema > "${BACKUP_DIR}/schema-after-${TIMESTAMP}-${TARGET_SHA:0:12}.json"

log "Switching Bếp Sỉ current release"
sudo ln -sfn "$RELEASE_DIR" "${CURRENT_LINK}.next"
sudo mv -Tf "${CURRENT_LINK}.next" "$CURRENT_LINK"
SWITCHED=1

log "Installing ${WORKER_SERVICE_NAME}"
sudo install -o root -g root -m 0644 "$RELEASE_DIR/$WORKER_UNIT_RELATIVE" "$WORKER_UNIT_PATH"
sudo systemctl daemon-reload
sudo systemctl enable "$WORKER_SERVICE_NAME"

log "Restarting only ${SERVICE_NAME} and ${WORKER_SERVICE_NAME}"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl restart "$WORKER_SERVICE_NAME"
wait_for_service_active "$SERVICE_NAME" 10 2
wait_for_service_active "$WORKER_SERVICE_NAME" 10 2

log "Waiting for local backend readiness"
fetch_with_retry "${LOCAL_API_BASE_URL}/api/health" "local backend health" 30 2 >/dev/null

log "Running backend smoke checks through the public endpoint"
fetch_with_retry "${API_BASE_URL}/api/health" "public backend health" 30 2 >/dev/null
VERSION_PAYLOAD="$(fetch_with_retry "${API_BASE_URL}/api/version" "public backend version" 15 2)"
VERSION_VALUE="$(node -e 'const body = JSON.parse(process.argv[1]); process.stdout.write(String(body.version ?? ""));' "$VERSION_PAYLOAD")"
[[ "$VERSION_VALUE" == "$EXPECTED_BACKEND_VERSION" ]] || die "Unexpected backend version: ${VERSION_VALUE}; expected ${EXPECTED_BACKEND_VERSION}."
fetch_with_retry "${API_BASE_URL}/api/catalog/categories" "public catalog categories" 15 2 >/dev/null
fetch_with_retry "${API_BASE_URL}/api/catalog/products?limit=1" "public catalog products" 15 2 >/dev/null

SWITCHED=0
trap - ERR

log "Pruning database backups older than ${BACKUP_RETENTION_DAYS} day(s)"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'bepsi-*.dump' -o -name 'schema-before-*.json' -o -name 'schema-after-*.json' \) \
  -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete

log "Pruning old releases while keeping at most ${RELEASE_RETENTION_COUNT} total, including current and previous"
mapfile -t RELEASE_CANDIDATES < <(
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -nr \
    | awk '{ $1=""; sub(/^ /, ""); print }'
)
kept=0
for candidate in "${RELEASE_CANDIDATES[@]}"; do
  candidate_real="$(readlink -f "$candidate")"
  if [[ "$candidate_real" == "$RELEASE_DIR" || "$candidate_real" == "$PREVIOUS_TARGET" || "$candidate_real" == "$CURRENT_REAL" ]]; then
    kept=$((kept + 1))
    continue
  fi
  if (( kept < RELEASE_RETENTION_COUNT )); then
    kept=$((kept + 1))
    continue
  fi
  log "Removing old release: ${candidate_real}"
  rm -rf -- "$candidate_real"
done

log "Backend production deployment completed at ${TARGET_SHA}."
log "Database backup: ${DB_BACKUP}"
log "Previous code release retained at: ${PREVIOUS_TARGET}"
