#!/usr/bin/env bash
# Daily logical backup of the Kernel database (pg_dump, gzip) with retention.
#
#   scripts/backup-postgres.sh            # writes to ~/backups/rotaract
#   BACKUP_DIR=/srv/backups RETENTION_DAYS=30 scripts/backup-postgres.sh
#
# Scheduled from the user crontab on the VPS (see docs/04-operations-and-deployment.md).
# Restore: gunzip -c <file> | docker exec -i rotaract-app-postgres-1 psql -U kernel -d institutional_kernel
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/rotaract}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
CONTAINER="${PG_CONTAINER:-rotaract-app-postgres-1}"
DB_USER="${POSTGRES_USER:-kernel}"
DB_NAME="${POSTGRES_DB:-institutional_kernel}"

umask 077
mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/kernel-$(date +%Y%m%d-%H%M%S).sql.gz"
tmp="$target.partial"

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner | gzip >"$tmp"

# A dump that doesn't end cleanly must never replace a good one.
if ! gunzip -c "$tmp" | tail -n 20 | grep -q "PostgreSQL database dump complete"; then
  echo "backup-postgres: dump incomplete, keeping previous backups" >&2
  rm -f "$tmp"
  exit 1
fi
mv "$tmp" "$target"

find "$BACKUP_DIR" -name 'kernel-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "backup-postgres: wrote $target ($(du -h "$target" | cut -f1))"
