#!/bin/bash
# Nightly backup of klone.live SQLite DB + uploads.
# Local snapshots in ~/Backups/klone, retained 14 days.
# Optional offsite: set RCLONE_REMOTE in ~/.klone-backup.env to push the
# day's snapshot dir to that remote (e.g. b2:klone-backups).

set -euo pipefail

PROJECT_DIR="/Users/gill/Projects/klone-website"
BACKUP_ROOT="$HOME/Backups/klone"
DB_PATH="$PROJECT_DIR/prisma/dev.db"
UPLOADS_DIR="$PROJECT_DIR/.uploads"
RETENTION_DAYS=14
LOG="/tmp/klone-backup.log"

mkdir -p "$BACKUP_ROOT"

if [ -f "$HOME/.klone-backup.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$HOME/.klone-backup.env"
  set +a
fi

DATE=$(date +%Y-%m-%d_%H%M%S)
DAY_DIR="$BACKUP_ROOT/$DATE"
mkdir -p "$DAY_DIR"

echo "[$(date)] Starting backup → $DAY_DIR" >> "$LOG"

# Atomic SQLite snapshot (handles writes correctly, unlike cp).
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" ".backup '$DAY_DIR/dev.db'"
  echo "  db: $(du -h "$DAY_DIR/dev.db" | awk '{print $1}')" >> "$LOG"
else
  echo "  db: SKIPPED (not found at $DB_PATH)" >> "$LOG"
fi

# Tar uploads (only if non-empty).
if [ -d "$UPLOADS_DIR" ] && [ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
  tar -czf "$DAY_DIR/uploads.tar.gz" -C "$PROJECT_DIR" .uploads
  echo "  uploads: $(du -h "$DAY_DIR/uploads.tar.gz" | awk '{print $1}')" >> "$LOG"
else
  echo "  uploads: SKIPPED (empty or missing)" >> "$LOG"
fi

# Optional offsite via rclone.
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  if rclone copy "$DAY_DIR" "$RCLONE_REMOTE/$DATE" --quiet 2>>"$LOG"; then
    echo "  offsite: pushed to $RCLONE_REMOTE/$DATE" >> "$LOG"
  else
    echo "  offsite: FAILED (see log)" >> "$LOG"
  fi
fi

# Prune local snapshots older than retention.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} +

echo "[$(date)] Backup complete" >> "$LOG"
