#!/bin/bash
# Resilience Companion — SQLite backup script
# Copies the database file with a timestamp. Safe to run while the app is running
# (SQLite WAL mode ensures consistent reads).
#
# Usage:
#   ./scripts/backup.sh                    # backs up to ./backups/
#   ./scripts/backup.sh /mnt/nas/backups   # backs up to a custom directory
#
# Automate with cron (daily at 2am):
#   0 2 * * * /path/to/resilience-companion/scripts/backup.sh >> /var/log/orr-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
DB_PATH="${DB_PATH:-./data/resilience-companion.db}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/resilience-companion-${TIMESTAMP}.db"

# For Docker Compose: if running inside the container, the DB is at /app/data/
if [ -f "/app/data/resilience-companion.db" ] && [ ! -f "$DB_PATH" ]; then
  DB_PATH="/app/data/resilience-companion.db"
fi

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Database not found at $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Use sqlite3 .backup for a consistent copy (if available), otherwise cp
if command -v sqlite3 &> /dev/null; then
  sqlite3 "$DB_PATH" ".backup '${BACKUP_FILE}'"
else
  cp "$DB_PATH" "$BACKUP_FILE"
fi

# Calculate size
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "$(date -Iseconds) Backup complete: ${BACKUP_FILE} (${SIZE})"

# Prune backups older than 30 days
find "$BACKUP_DIR" -name "resilience-companion-*.db" -mtime +30 -delete 2>/dev/null && \
  echo "Pruned backups older than 30 days" || true
