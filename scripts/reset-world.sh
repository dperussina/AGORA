#!/usr/bin/env bash
# Safely back up the current Agora SQLite log & blobs, then wipe for a clean Genesis v2 world.
# Usage:
#   AGORA_LOG=./agora.sqlite ./scripts/reset-world.sh
#   AGORA_LOG=/home/dperussina/AGORA/agora.sqlite PM2_APP=agora ./scripts/reset-world.sh
set -euo pipefail

LOG_PATH="${AGORA_LOG:-./agora.sqlite}"
BLOB_PATH="${AGORA_BLOB_DIR:-$(dirname "$LOG_PATH")/blob}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$(dirname "$LOG_PATH")/backups/wipe-${STAMP}"

if [[ -n "${PM2_APP:-}" ]] && command -v pm2 >/dev/null 2>&1; then
  pm2 stop "$PM2_APP" || true
fi

mkdir -p "$BACKUP_DIR"

for f in "$LOG_PATH" "${LOG_PATH}-wal" "${LOG_PATH}-shm"; do
  if [[ -f "$f" ]]; then
    mv "$f" "$BACKUP_DIR/"
    echo "Backed up $f -> $BACKUP_DIR/"
  fi
done

if [[ -d "$BLOB_PATH" ]]; then
  mv "$BLOB_PATH" "$BACKUP_DIR/blob"
  echo "Backed up $BLOB_PATH -> $BACKUP_DIR/blob"
fi

mkdir -p "$BLOB_PATH"
echo "Clean Genesis v2 ready at $LOG_PATH (blobs: $BLOB_PATH)."

if [[ -n "${PM2_APP:-}" ]] && command -v pm2 >/dev/null 2>&1; then
  pm2 start "$PM2_APP"
fi
