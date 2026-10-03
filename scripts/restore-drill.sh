#!/usr/bin/env bash
# E12.2 — monthly restore drill (docs/19-operations-e12.md).
#
#   scripts/restore-drill.sh [backup-file]
#
# Takes the LATEST off-site backup (from RCLONE_REMOTE; from BACKUP_DIR
# when no remote is configured, or the file given), decrypts it, checks the
# MANIFEST checksums, restores every database into a THROWAWAY postgres
# container (no network, random password, removed at the end) and runs
# sanity checks: migrations table complete and without failures, core
# tables present with rows, uploads archive readable. Prints a report and
# saves it next to the backups. Exit 0 = the backup restores; 1 = it does
# not (treat as an incident).
#
# Same configuration as scripts/backup-offsite.sh, plus:
#   DRILL_MIN_PERSONS   1   minimum rows in "Person" for the kernel to pass
#   DRILL_PG_IMAGE      postgres:16-alpine
set -euo pipefail

CONFIG="${BACKUP_CONFIG:-$HOME/.config/rotaract-backup/env}"
# shellcheck disable=SC1090
[ -f "$CONFIG" ] && . "$CONFIG"

PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-$HOME/.config/rotaract-backup/passphrase}"
REMOTE="${RCLONE_REMOTE:-}"
RCLONE="${RCLONE_BIN:-rclone}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/rotaract/offsite}"
MIN_PERSONS="${DRILL_MIN_PERSONS:-1}"
PG_IMAGE="${DRILL_PG_IMAGE:-postgres:16-alpine}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="$BACKUP_DIR/drill-$stamp.txt"
container="rotaract-restore-drill-$stamp-$$"
mkdir -p "$BACKUP_DIR"
work="$(mktemp -d "$BACKUP_DIR/.drill-$stamp.XXXXXX")"
problems=0

say() { printf '%s\n' "$*" | tee -a "$report"; }
bad() { problems=$((problems + 1)); say "  FALLA: $*"; }
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

[ -s "$PASSPHRASE_FILE" ] || { echo "restore-drill: no passphrase at $PASSPHRASE_FILE" >&2; exit 1; }

say "Prueba de restauración $stamp"

# 1. Pick the backup.
if [ "${1:-}" ]; then
  source_file="$1"
  say "Origen: $source_file"
elif [ -n "$REMOTE" ]; then
  latest="$("$RCLONE" lsf "$REMOTE" --include 'rotaract-*.tar.gpg' | sort | tail -1)"
  [ -n "$latest" ] || { say "No hay backups en $REMOTE"; exit 1; }
  say "Origen: $REMOTE/$latest"
  "$RCLONE" copyto "$REMOTE/$latest" "$work/$latest"
  source_file="$work/$latest"
else
  source_file="$(ls -1 "$BACKUP_DIR"/rotaract-*.tar.gpg 2>/dev/null | sort | tail -1 || true)"
  [ -n "$source_file" ] || { say "No hay backups en $BACKUP_DIR"; exit 1; }
  say "Origen (local, sin RCLONE_REMOTE): $source_file"
fi
backup_name="$(basename "$source_file")"
backup_time="$(echo "$backup_name" | sed -n 's/rotaract-\([0-9]\{8\}T[0-9]\{6\}Z\).*/\1/p')"
if [ -n "$backup_time" ]; then
  age_h=$(( ($(date -u +%s) - $(date -u -d "$(echo "$backup_time" | sed 's/\(....\)\(..\)\(..\)T\(..\)\(..\)\(..\)Z/\1-\2-\3 \4:\5:\6/')" +%s)) / 3600 ))
  say "Antigüedad: ${age_h} h"
  [ "$age_h" -le 48 ] || bad "el último backup tiene más de 48 horas"
fi

# 2. Decrypt and verify checksums.
mkdir "$work/bundle"
if ! gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" \
  --decrypt "$source_file" | tar xf - -C "$work/bundle"; then
  say "No se pudo descifrar o desempaquetar $backup_name"
  exit 1
fi
if (cd "$work/bundle" && grep -E '^[0-9a-f]{64}  ' MANIFEST | sha256sum --check --quiet); then
  say "Checksums: ok ($(grep -cE '^[0-9a-f]{64}  ' "$work/bundle/MANIFEST") archivos)"
else
  bad "los checksums del MANIFEST no coinciden"
fi

# 3. Throwaway postgres: no network, random password.
password="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
docker run -d --name "$container" --network none \
  -e POSTGRES_USER=drill -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=postgres \
  "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$container" pg_isready -U drill -d postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U drill -d postgres >/dev/null || { say "postgres de prueba no arrancó"; exit 1; }
sql() { docker exec -i "$container" psql -U drill -d "$1" -tAqc "$2"; }

restore_db() { # name
  local db="$1" file="$work/bundle/$1.dump"
  [ -f "$file" ] || { bad "falta $db.dump en el backup"; return 1; }
  sql postgres "CREATE DATABASE \"$db\"" >/dev/null
  if ! docker exec -i "$container" pg_restore -U drill -d "$db" --no-owner --no-privileges --exit-on-error <"$file" 2>"$work/$db.err"; then
    bad "pg_restore de $db falló: $(head -c 300 "$work/$db.err")"
    return 1
  fi
  local applied failed last
  applied="$(sql "$db" 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL' 2>/dev/null || echo x)"
  failed="$(sql "$db" 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL' 2>/dev/null || echo x)"
  last="$(sql "$db" 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1' 2>/dev/null || echo "?")"
  say "Base $db: restaurada; migraciones aplicadas=$applied, fallidas=$failed, última=$last"
  [ "$applied" != x ] && [ "$applied" -gt 0 ] || bad "$db: tabla _prisma_migrations ausente o vacía"
  [ "$failed" = 0 ] || bad "$db: hay migraciones a medio aplicar"
}

for dump in "$work"/bundle/*.dump; do
  [ -e "$dump" ] || { bad "el backup no tiene bases de datos"; break; }
  db="$(basename "$dump" .dump)"
  restore_db "$db" || continue
  case "$db" in
    institutional_kernel)
      counts=""
      for table in Person UserAccount Organization OrganizationMembership Appointment KernelAuditLog; do
        n="$(sql "$db" "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo x)"
        counts="$counts $table=$n"
        [ "$n" != x ] || bad "$db: falta la tabla $table"
      done
      say "  filas:$counts"
      persons="$(sql "$db" 'SELECT count(*) FROM "Person"' 2>/dev/null || echo 0)"
      [ "$persons" -ge "$MIN_PERSONS" ] || bad "$db: Person tiene $persons filas (mínimo $MIN_PERSONS)"
      ;;
    *)
      tables="$(sql "$db" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
      say "  tablas: $tables"
      [ "$tables" -gt 1 ] || bad "$db: sin tablas"
      ;;
  esac
done

# 4. Volume archives.
for archive in "$work"/bundle/volume-*.tar.gz; do
  [ -e "$archive" ] || break
  if files="$(tar tzf "$archive" | grep -vc '/$')"; then
    say "Volumen $(basename "$archive" .tar.gz | sed 's/^volume-//'): legible, $files archivos"
  else
    files=0
    if tar tzf "$archive" >/dev/null; then
      say "Volumen $(basename "$archive" .tar.gz | sed 's/^volume-//'): legible, vacío"
    else
      bad "el archivo $(basename "$archive") está dañado"
    fi
  fi
done

if [ "$problems" -eq 0 ]; then
  say "RESULTADO: OK — el backup $backup_name se restaura completo."
  exit 0
fi
say "RESULTADO: FALLÓ ($problems problemas) — tratarlo como incidente."
exit 1
