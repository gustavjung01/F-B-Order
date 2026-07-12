#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_SHA="${1:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPECTED_API_URL="https://api.bepsi.click"

log() {
  printf '[phase7-vercel] %s\n' "$*"
}

die() {
  printf '[phase7-vercel] ERROR: %s\n' "$*" >&2
  exit 1
}

sync_production_env() {
  local key="$1"
  local value="$2"

  log "Syncing Vercel production variable ${key}"
  printf '%s\n' "$value" | pnpm dlx vercel@latest env add "$key" production \
    --force \
    --no-sensitive \
    --token="$VERCEL_TOKEN" \
    --cwd "$REPO_ROOT" \
    >/dev/null
}

[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || die "Target commit must be a full 40-character SHA."
for command in git corepack node; do
  command -v "$command" >/dev/null 2>&1 || die "Required command is missing: $command"
done

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
: "${VERCEL_ORG_ID:?VERCEL_ORG_ID is required}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID is required}"

ACTUAL_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
[[ "$ACTUAL_SHA" == "$TARGET_SHA" ]] || die "Checkout is ${ACTUAL_SHA}, expected ${TARGET_SHA}."
[[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]] || die "Repository checkout is not clean."

corepack enable

log "Pulling Vercel production project settings"
pnpm dlx vercel@latest pull \
  --yes \
  --environment=production \
  --token="$VERCEL_TOKEN" \
  --cwd "$REPO_ROOT"

sync_production_env "NEXT_PUBLIC_DATA_MODE" "backend"
sync_production_env "BACKEND_API_URL" "$EXPECTED_API_URL"
sync_production_env "NEXT_PUBLIC_API_URL" "$EXPECTED_API_URL"

log "Refreshing Vercel production environment after synchronization"
pnpm dlx vercel@latest pull \
  --yes \
  --environment=production \
  --token="$VERCEL_TOKEN" \
  --cwd "$REPO_ROOT"

PRODUCTION_ENV_FILE="${REPO_ROOT}/.vercel/.env.production.local"
[[ -f "$PRODUCTION_ENV_FILE" ]] || die "Vercel production environment file was not generated."

node --input-type=module - "$PRODUCTION_ENV_FILE" "$EXPECTED_API_URL" <<'NODE'
import fs from "node:fs";

const [envPath, expectedApiUrl] = process.argv.slice(2);
const source = fs.readFileSync(envPath, "utf8");
const values = new Map();
for (const rawLine of source.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  let value = line.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  values.set(key, value);
}

const required = {
  NEXT_PUBLIC_DATA_MODE: "backend",
  BACKEND_API_URL: expectedApiUrl,
  NEXT_PUBLIC_API_URL: expectedApiUrl,
};
for (const [key, expected] of Object.entries(required)) {
  if (values.get(key) !== expected) {
    throw new Error(`Vercel production variable ${key} must equal ${expected}.`);
  }
}
NODE

# Build inside Vercel so production-only and sensitive project variables are
# injected by Vercel instead of being materialized in the GitHub runner.
log "Deploying Vercel production from exact checkout"
DEPLOYMENT_URL="$(pnpm dlx vercel@latest deploy \
  --prod \
  --yes \
  --force \
  --token="$VERCEL_TOKEN" \
  --cwd "$REPO_ROOT")"

[[ "$DEPLOYMENT_URL" == https://* ]] || die "Vercel did not return a deployment URL."
log "Vercel production deployment completed: ${DEPLOYMENT_URL}"
