#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_SHA="${1:-}"
APP_ROOT="/srv/apps/bepsi"
SOURCE_DIR="/srv/apps/bepsi/source"
CURRENT_LINK="/srv/apps/bepsi/current"
RELEASES_DIR="/srv/apps/bepsi/releases"
BACKUP_DIR="/srv/apps/bepsi/backups"
ENV_FILE="/etc/app-env/bepsi.env"
SERVICE_NAME="bepsi-api.service"
API_BASE_URL="${API_BASE_URL:-https://api.bepsi.click}"
LOCK_FILE="/var/lock/bepsi-phase7-deploy.lock"
REPO_URL_PATTERN='github\.com[:/]gustavjung01/F-B-Order(\.git)?$'
DEPLOY_USER="$(id -un)"
DEPLOY_GROUP="$(id -gn)"

log() {
  printf '[phase7-backend] %s\n' "$*"
}

die() {
  printf '[phase7-backend] ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || die "Target commit must be a full 40-character SHA."

for command in git flock rsync corepack node curl pg_dump sudo; do
  command -v "$command" >/dev/null 2>&1 || die "Required command is missing: $command"
done

[[ -d "${SOURCE_DIR}/.git" ]] || die "Báº¿p Sá»‰ source repository is missing: ${SOURCE_DIR}"
[[ -f "$ENV_FILE" ]] || die "Báº¿p Sá»‰ environment file is missing: ${ENV_FILE}"
[[ -L "$CURRENT_LINK" ]] || die "${CURRENT_LINK} must be a release symlink before production deployment."

SOURCE_REAL="$(readlink -f "$SOURCE_DIR")"
CURRENT_REAL="$(readlink -f "$CURRENT_LINK")"
[[ "$SOURCE_REAL" == "$APP_ROOT"/* ]] || die "Source path escaped Báº¿p Sá»‰ root."
[[ "$CURRENT_REAL" == "$APP_ROOT"/* ]] || die "Current release escaped Báº¿p Sá»‰ root."
[[ "$SOURCE_REAL" != *"/vlgn"* && "$SOURCE_REAL" != *"/tocviet"* ]] || die "Refusing to touch another application."
[[ "$CURRENT_REAL" != *"/vlgn"* && "$CURRENT_REAL" != *"/tocviet"* ]] || die "Refusing to touch another application."

REMOTE_URL="$(git -C "$SOURCE_DIR" remote get-url origin)"
[[ "$REMOTE_URL" =~ $REPO_URL_PATTERN ]] || die "Unexpected git remote: ${REMOTE_URL}"

SERVICE_UNIT="$(sudo systemctl cat "$SERVICE_NAME")"
printf '%s' "$SERVICE_UNIT" | grep -Fq "$CURRENT_LINK" || die "${SERVICE_NAME} is not configured to run from ${CURRENT_LINK}."
printf '%s' "$SERVICE_UNIT" | grep -Eiq 'vlgn|tocviet' && die "Service unit contains another application path."

log "Preparing writable Báº¿p Sá»‰ deployment directories"
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0750 "$RELEASES_DIR"
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0700 "$BACKUP_DIR"
sudo touch "$LOCK_FILE"
sudo chown "$DEPLOY_USER:$DEPLOY_GROUP" "$LOCK_FILE"
sudo chmod 0600 "$LOCK_FILE"

exec 9>"$LOCK_FILE"
flock -n 9 || die "Another Báº¿p Sá»‰ production deployment is running."

log "Pulling Báº¿p Sá»‰ source from origin/main"
git -C "$SOURCE_DIR" switch main
git -C "$SOURCE_DIR" pull --ff-only origin main
[[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ]] || die "Source checkout is not clean after pull."
ACTUAL_SHA="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
[[ "$ACTUAL_SHA" == "$TARGET_SHA" ]] || die "VPS source is ${ACTUAL_SHA}, expected ${TARGET_SHA}."

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
DATABASE_URL_VALUE="${BEPSI_DATABASE_URL:-${DATABASE_URL:-}}"
[[ -n "$DATABASE_URL_VALUE" ]] || die "BEPSI_DATABASE_URL or DATABASE_URL is missing from ${ENV_FILE}."

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
  fi
  log "Database changes are forward-only; no automatic down migration was attempted."
  exit "$status"
}
trap rollback_code ERR

log "Creating production database backup: ${DB_BACKUP}"
umask 077
/usr/lib/postgresql/17/bin/pg_dump \\
  --dbname="$DATABASE_URL_VALUE" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$DB_BACKUP"
[[ -s "$DB_BACKUP" ]] || die "Database backup is empty."

log "Preparing immutable release ${RELEASE_DIR}"
rm -rf "$TEMP_RELEASE"
mkdir -p "$TEMP_RELEASE"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  "$SOURCE_DIR/" "$TEMP_RELEASE/"
rm -rf "$RELEASE_DIR"
mv "$TEMP_RELEASE" "$RELEASE_DIR"

cd "$RELEASE_DIR"
corepack pnpm install --frozen-lockfile
corepack pnpm build:backend

log "Auditing production database before migration"
corepack pnpm --filter @fb-order/backend db:audit:schema > "${BACKUP_DIR}/schema-before-${TIMESTAMP}-${TARGET_SHA:0:12}.json"

log "Verifying the audited Phase 1 production contract"
corepack pnpm db:verify:order-contract

LEDGER_ROW_COUNT="$(node --input-type=module <<'NODE'
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.BEPSI_DATABASE_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString, max: 1 });
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

log "Switching Báº¿p Sá»‰ current release"
sudo ln -sfn "$RELEASE_DIR" "${CURRENT_LINK}.next"
sudo mv -Tf "${CURRENT_LINK}.next" "$CURRENT_LINK"
SWITCHED=1

log "Restarting only ${SERVICE_NAME}"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl is-active --quiet "$SERVICE_NAME"

log "Running backend smoke checks"
curl --fail --silent --show-error --max-time 15 "${API_BASE_URL}/api/health" >/dev/null
VERSION_PAYLOAD="$(curl --fail --silent --show-error --max-time 15 "${API_BASE_URL}/api/version")"
printf '%s' "$VERSION_PAYLOAD" | grep -Fq 'frontend-cutover-v6' || die "Unexpected backend version payload."
curl --fail --silent --show-error --max-time 20 "${API_BASE_URL}/api/catalog/categories" >/dev/null
curl --fail --silent --show-error --max-time 20 "${API_BASE_URL}/api/catalog/products?limit=1" >/dev/null

SWITCHED=0
trap - ERR
log "Backend production deployment completed at ${TARGET_SHA}."
log "Database backup: ${DB_BACKUP}"
log "Previous code release retained at: ${PREVIOUS_TARGET}"

