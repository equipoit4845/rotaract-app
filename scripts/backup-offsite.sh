#!/usr/bin/env bash
# E12.2 — encrypted off-site backup (docs/19-operations-e12.md).
#
#   scripts/backup-offsite.sh
#
# Dumps the kernel and meetings databases (pg_dump custom format) and the
# meetings uploads volume, checks each piece, writes a MANIFEST with
# checksums, bundles everything into ONE file encrypted with GPG (AES-256,
# symmetric passphrase) and uploads it with rclone (R2, S3, Google Drive,
# a local directory... whatever the remote is). Nothing leaves the VPS
# unencrypted; a plaintext copy never stays on disk.
#
# Without a remote configured it keeps the encrypted file locally and skips
# the upload with a WARNING (exit 0). Without a passphrase it refuses to run
# (exit 1): an unencrypted off-site backup is never an option.
#
# Configuration: environment, or a file sourced first
# (BACKUP_CONFIG, default ~/.config/rotaract-backup/env):
#   BACKUP_PASSPHRASE_FILE  ~/.config/rotaract-backup/passphrase (chmod 600)
#   RCLONE_REMOTE           e.g. r2:rotaract-backups/vps  (empty = no upload)
#   RCLONE_CONFIG           rclone config file (rclone's default otherwise)
#   RCLONE_BIN              rclone binary (default: rclone in PATH)
#   BACKUP_DIR              ~/backups/rotaract/offsite (local encrypted copies)
#   RETENTION_DAYS          14   local copies
#   REMOTE_RETENTION_DAYS   90   remote copies (0 = never delete)
#   PG_CONTAINER            rotaract-app-postgres-1
#   POSTGRES_USER           kernel
#   BACKUP_DATABASES        "institutional_kernel meetings"
#   BACKUP_VOLUMES          "rotaract-app_meetings-uploads"
#
# Exit codes: 0 ok (or upload skipped with a warning), 1 failure (nothing
# replaced; earlier backups untouched).
set -euo pipefail

CONFIG="${BACKUP_CONFIG:-$HOME/.config/rotaract-backup/env}"
# shellcheck disable=SC1090
[ -f "$CONFIG" ] && . "$CONFIG"

PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-$HOME/.config/rotaract-backup/passphrase}"
REMOTE="${RCLONE_REMOTE:-}"
RCLONE="${RCLONE_BIN:-rclone}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/rotaract/offsite}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-90}"
CONTAINER="${PG_CONTAINER:-rotaract-app-postgres-1}"
DB_USER="${POSTGRES_USER:-kernel}"
DATABASES="${BACKUP_DATABASES:-institutional_kernel meetings}"
VOLUMES="${BACKUP_VOLUMES:-rotaract-app_meetings-uploads}"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-alpine:3.20}"

log() { printf '%s backup-offsite: %s\n' "$(date +%FT%T)" "$*"; }
warn() { printf '%s backup-offsite: WARNING %s\n' "$(date +%FT%T)" "$*" >&2; }
fail() { printf '%s backup-offsite: ERROR %s\n' "$(date +%FT%T)" "$*" >&2; exit 1; }

[ -s "$PASSPHRASE_FILE" ] ||
  fail "no passphrase at $PASSPHRASE_FILE: backups are always encrypted (see docs/19-operations-e12.md)"
command -v gpg >/dev/null || fail "gpg is not installed"

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="rotaract-$stamp.tar.gpg"
work="$(mktemp -d "$BACKUP_DIR/.work-$stamp.XXXXXX")"
trap 'rm -rf "$work" "$BACKUP_DIR/$name.partial"' EXIT
mkdir "$work/bundle"

# 1. Databases: custom format (compressed, restorable table by table).
for db in $DATABASES; do
  log "dumping database $db"
  docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$db" --format=custom --no-owner \
    >"$work/bundle/$db.dump" || fail "pg_dump of $db failed"
  # A dump pg_restore cannot list is not a backup.
  docker exec -i "$CONTAINER" pg_restore --list <"$work/bundle/$db.dump" >/dev/null ||
    fail "the dump of $db is unreadable"
done

# 2. Volumes (meetings uploads): tar.gz read-only through a helper container.
for volume in $VOLUMES; do
  log "archiving volume $volume"
  docker volume inspect "$volume" >/dev/null 2>&1 || fail "volume $volume does not exist"
  docker run --rm -v "$volume:/data:ro" "$HELPER_IMAGE" tar czf - -C /data . \
    >"$work/bundle/volume-$volume.tar.gz" || fail "archiving $volume failed"
  gzip -t "$work/bundle/volume-$volume.tar.gz" || fail "the archive of $volume is corrupt"
done

# 3. Manifest with checksums, verified again by the restore drill.
{
  echo "backup $stamp"
  echo "host $(hostname)"
  echo "databases $DATABASES"
  echo "volumes $VOLUMES"
  (cd "$work/bundle" && sha256sum -- *.dump volume-*.tar.gz 2>/dev/null || true)
} >"$work/bundle/MANIFEST"

# 4. One encrypted file. tar streams straight into gpg: no plaintext bundle.
log "encrypting"
tar cf - -C "$work/bundle" . |
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" \
    --symmetric --cipher-algo AES256 --compress-algo none \
    -o "$BACKUP_DIR/$name.partial" || fail "encryption failed"
mv "$BACKUP_DIR/$name.partial" "$BACKUP_DIR/$name"
rm -rf "$work/bundle"
size="$(du -h "$BACKUP_DIR/$name" | cut -f1)"
log "wrote $BACKUP_DIR/$name ($size)"

# 5. Off-site copy.
if [ -z "$REMOTE" ]; then
  warn "RCLONE_REMOTE is not set: upload skipped, the backup stays only on this VPS"
else
  command -v "$RCLONE" >/dev/null || fail "rclone not found ($RCLONE); the encrypted file is in $BACKUP_DIR"
  log "uploading to $REMOTE"
  "$RCLONE" copyto "$BACKUP_DIR/$name" "$REMOTE/$name" || fail "upload to $REMOTE failed"
  local_bytes="$(wc -c <"$BACKUP_DIR/$name" | tr -d ' ')"
  remote_bytes="$("$RCLONE" size --json "$REMOTE/$name" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
  [ "$local_bytes" = "$remote_bytes" ] ||
    fail "uploaded size differs (local $local_bytes, remote ${remote_bytes:-none})"
  log "uploaded $name ($local_bytes bytes)"
  if [ "$REMOTE_RETENTION_DAYS" -gt 0 ]; then
    "$RCLONE" delete "$REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include "rotaract-*.tar.gpg" ||
      warn "could not expire old remote backups"
  fi
fi

# 6. Local retention (encrypted copies only).
find "$BACKUP_DIR" -maxdepth 1 -name 'rotaract-*.tar.gpg' -mtime "+$RETENTION_DAYS" -delete
log "done"
