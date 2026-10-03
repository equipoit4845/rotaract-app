#!/usr/bin/env bash
# E12.2 — deploy without cutting the service (docs/19-operations-e12.md).
#
#   scripts/deploy.sh [options] <service...>
#   scripts/deploy.sh api web            # usual kernel release
#   scripts/deploy.sh --cutover          # one-time switch to the edge proxy
#   scripts/deploy.sh --rollback api     # back to the previous slot
#
# Services:
#   api, web            blue/green behind the edge proxy: zero downtime.
#   worker              recreated (no traffic; jobs pause a few seconds).
#   developers-portal, meetings-api, meetings-web
#                       recreated (a few seconds of downtime; see the doc).
#
# Steps: lock → back up the database → build (once) → migrate (one-off,
# must be backward compatible) → start the idle slot with the new image →
# wait until it is healthy → point nginx at it (graceful reload) → drain →
# stop the old slot. Any failure before the switch leaves the old slot
# serving; a failure right after the switch puts the old slot back.
#
# Options:
#   --skip-backup   do not run scripts/backup-postgres.sh first
#   --skip-build    reuse the images already built for this project
#   --skip-migrate  do not run the migrate service
#   --cutover       start api+web slots, stop the legacy api/web containers
#                   and start the edge (a few seconds of downtime, once)
#   --rollback      switch api/web back to the previous slot (its stopped
#                   container still holds the previous image)
#
# Environment (defaults fit production on the VPS):
#   COMPOSE_PROJECT_NAME   rotaract-app
#   DEPLOY_ENV_FILE        .env
#   DEPLOY_IMAGE_PREFIX    mirotaract       (images <prefix>-api:<slot>)
#   DEPLOY_STATE_DIR       infra/deploy/state (active slots, history)
#   DEPLOY_HEALTH_TIMEOUT  240 seconds for a new slot to become healthy
#   DEPLOY_DRAIN_SECONDS   15 seconds between switch and stopping the old slot
#   DEPLOY_HEALTH_PATH_<SERVICE>  override the readiness path (tests)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT="${COMPOSE_PROJECT_NAME:-rotaract-app}"
ENV_FILE="${DEPLOY_ENV_FILE:-.env}"
PREFIX="${DEPLOY_IMAGE_PREFIX:-mirotaract}"
STATE_DIR="${DEPLOY_STATE_DIR:-infra/deploy/state}"
HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-240}"
DRAIN_SECONDS="${DEPLOY_DRAIN_SECONDS:-15}"
export DEPLOY_IMAGE_PREFIX="$PREFIX"
case "$STATE_DIR" in /*) ;; *) STATE_DIR="$ROOT/$STATE_DIR" ;; esac
export DEPLOY_STATE_DIR="$STATE_DIR"

SKIP_BACKUP=0 SKIP_BUILD=0 SKIP_MIGRATE=0 CUTOVER=0 ROLLBACK=0
SERVICES=()
for arg in "$@"; do
  case "$arg" in
    --skip-backup) SKIP_BACKUP=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    --cutover) CUTOVER=1 ;;
    --rollback) ROLLBACK=1 ;;
    -h | --help) sed -n '2,40p' "$0"; exit 0 ;;
    -*) echo "deploy: unknown option $arg" >&2; exit 2 ;;
    *) SERVICES+=("$arg") ;;
  esac
done
[ "$CUTOVER" = 1 ] && SERVICES=(api web)
[ "${#SERVICES[@]}" -gt 0 ] || { echo "deploy: name at least one service (api web worker ...)" >&2; exit 2; }

log() { printf '%s deploy: %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { printf '%s deploy: ERROR %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

compose() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" \
    -f docker-compose.yml -f infra/deploy/compose.zero-downtime.yml "$@"
}

# --- slots -------------------------------------------------------------------
port_of() { case "$1" in api) echo 3001 ;; web) echo 3000 ;; esac; }
health_path_of() {
  local override="DEPLOY_HEALTH_PATH_$(echo "$1" | tr 'a-z-' 'A-Z_')"
  if [ -n "${!override:-}" ]; then echo "${!override}"; return; fi
  case "$1" in api) echo /health/ready ;; web) echo /login ;; esac
}
is_slotted() { [ "$1" = api ] || [ "$1" = web ]; }

UPSTREAMS="$STATE_DIR/upstreams.conf"

# Active slot of a service (blue|green), or "none" before the cutover.
active_slot() {
  [ -f "$UPSTREAMS" ] || { echo none; return; }
  local slot
  slot="$(sed -n "s/.*\$$1_upstream.*$1-\(blue\|green\):.*/\1/p" "$UPSTREAMS" | head -1)"
  echo "${slot:-none}"
}
other_slot() { [ "$1" = blue ] && echo green || echo blue; }

write_upstreams() { # api_slot web_slot
  mkdir -p "$STATE_DIR"
  local tmp="$STATE_DIR/.upstreams.conf.$$"
  {
    echo "# Written by scripts/deploy.sh $(date -u +%FT%TZ). Do not edit by hand."
    echo "map \$host \$api_upstream { default api-$1:3001; }"
    echo "map \$host \$web_upstream { default web-$2:3000; }"
  } >"$tmp"
  mv -f "$tmp" "$UPSTREAMS" # atomic within the bind-mounted directory
}

reload_edge() {
  compose exec -T edge nginx -t -q && compose exec -T edge nginx -s reload
}

container_of() { compose ps -a -q "$1" 2>/dev/null | head -1; }

wait_healthy() { # compose-service url-inside-network
  local service="$1" url="$2" deadline=$((SECONDS + HEALTH_TIMEOUT)) id state
  while [ "$SECONDS" -lt "$deadline" ]; do
    id="$(container_of "$service")"
    if [ -n "$id" ]; then
      state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)"
      case "$state" in
        healthy | running)
          # Docker's healthcheck is liveness; readiness is checked from the
          # edge, over the same network path real traffic will take.
          if probe_from_edge "$url"; then return 0; fi ;;
        exited | dead | missing) return 1 ;;
      esac
    fi
    sleep 3
  done
  return 1
}

probe_from_edge() {
  if [ "$(compose ps -q edge 2>/dev/null)" ]; then
    compose exec -T edge wget -q -T 5 -O /dev/null "$1" 2>/dev/null
  else
    # Before the cutover the edge does not exist yet: probe from a
    # throwaway container on the project network.
    docker run --rm --network "${PROJECT}_default" nginx:1.27-alpine \
      wget -q -T 5 -O /dev/null "$1" >/dev/null 2>&1
  fi
}

record() { mkdir -p "$STATE_DIR"; echo "$(date -u +%FT%TZ) $*" >>"$STATE_DIR/history.log"; }

# --- steps -------------------------------------------------------------------
backup() {
  [ "$SKIP_BACKUP" = 1 ] && { log "backup skipped (--skip-backup)"; return; }
  log "backing up the database before deploying"
  PG_CONTAINER="${PROJECT}-postgres-1" "$ROOT/scripts/backup-postgres.sh" ||
    die "backup failed; nothing was deployed"
}

build() {
  [ "$SKIP_BUILD" = 1 ] && { log "build skipped (--skip-build)"; return; }
  local s
  for s in "$@"; do
    log "building $s"
    nice -n 10 docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.yml build "$s" ||
      die "build of $s failed; nothing was deployed"
  done
}

migrate() {
  [ "$SKIP_MIGRATE" = 1 ] && { log "migrations skipped (--skip-migrate)"; return; }
  log "applying migrations (one-off, backward compatible)"
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.yml \
    run --rm --no-deps migrate || die "migrations failed; the running version keeps serving"
}

# Image built by `docker compose build <svc>` for this project.
built_image() { echo "${PROJECT}-$1:latest"; }

deploy_slotted() { # service
  local svc="$1" port path active target
  port="$(port_of "$svc")"
  path="$(health_path_of "$svc")"
  active="$(active_slot "$svc")"
  target="$( [ "$active" = none ] && echo blue || other_slot "$active")"
  log "$svc: active=$active → starting $target"

  if [ "$ROLLBACK" = 1 ]; then
    [ "$active" != none ] || die "$svc: nothing to roll back to"
    [ -n "$(container_of "$svc-$target")" ] || die "$svc: the previous slot ($target) no longer exists"
    compose start "$svc-$target" >/dev/null
  else
    docker image inspect "$(built_image "$svc")" >/dev/null 2>&1 ||
      die "$svc: image $(built_image "$svc") not found (build first)"
    docker tag "$(built_image "$svc")" "$PREFIX-$svc:$target"
    compose up -d --no-deps --force-recreate "$svc-$target" >/dev/null
  fi

  if ! wait_healthy "$svc-$target" "http://$svc-$target:$port$path"; then
    log "$svc: $target did not become healthy in ${HEALTH_TIMEOUT}s; last logs:"
    compose logs --tail 40 "$svc-$target" >&2 || true
    compose stop "$svc-$target" >/dev/null 2>&1 || true
    record "$svc FAILED $target (stayed on $active)"
    die "$svc: rolled back, $active keeps serving"
  fi
  log "$svc: $target is healthy"

  [ "$active" = none ] && return 0 # cutover: the edge is started afterwards
  switch_to "$svc" "$target" "$active"
}

switch_to() { # service target previous
  local svc="$1" target="$2" previous="$3" api web port path
  port="$(port_of "$svc")"
  path="$(health_path_of "$svc")"
  api="$(active_slot api)"; web="$(active_slot web)"
  [ "$svc" = api ] && api="$target" || web="$target"
  cp -f "$UPSTREAMS" "$UPSTREAMS.previous"
  write_upstreams "$api" "$web"
  if ! reload_edge || ! probe_from_edge "http://127.0.0.1:$port$path"; then
    log "$svc: traffic check through the edge failed; switching back to $previous"
    cp -f "$UPSTREAMS.previous" "$UPSTREAMS"
    reload_edge || true
    compose stop "$svc-$target" >/dev/null 2>&1 || true
    record "$svc FAILED-AFTER-SWITCH $target (back on $previous)"
    die "$svc: rolled back to $previous"
  fi
  log "$svc: traffic now on $target; draining $previous for ${DRAIN_SECONDS}s"
  sleep "$DRAIN_SECONDS"
  compose stop -t 30 "$svc-$previous" >/dev/null 2>&1 || true
  record "$svc $([ "$ROLLBACK" = 1 ] && echo ROLLBACK || echo OK) $previous→$target"
  log "$svc: done ($previous stopped; kept for --rollback)"
}

recreate() { # service
  local svc="$1"
  log "$svc: recreating (no blue/green for this service)"
  compose up -d --no-deps --force-recreate "$svc" >/dev/null
  local id state deadline=$((SECONDS + HEALTH_TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    id="$(container_of "$svc")"
    state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)"
    case "$state" in
      healthy) break ;;
      running) [ "$(docker inspect -f '{{if .State.Health}}y{{end}}' "$id")" ] || break ;;
      exited | dead) die "$svc exited; see: docker logs $id" ;;
    esac
    sleep 3
  done
  record "$svc RECREATED"
  log "$svc: $state"
}

cutover() {
  log "cutover: api and web slots are up; stopping the legacy containers and starting the edge"
  write_upstreams blue blue
  compose stop api web >/dev/null 2>&1 || true
  compose up -d --no-deps edge >/dev/null
  local deadline=$((SECONDS + 60))
  until probe_from_edge "http://127.0.0.1:3001$(health_path_of api)" &&
    probe_from_edge "http://127.0.0.1:3000$(health_path_of web)"; do
    [ "$SECONDS" -lt "$deadline" ] || die "edge does not serve api/web; restore with: docker compose up -d api web (after stopping edge)"
    sleep 1
  done
  compose rm -f api web >/dev/null 2>&1 || true
  record "CUTOVER api=blue web=blue"
  log "cutover done: the edge owns ports 3000/3001"
}

# --- main --------------------------------------------------------------------
mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "another deploy is running"

if [ "$CUTOVER" = 0 ] && [ "$ROLLBACK" = 0 ]; then
  for s in "${SERVICES[@]}"; do
    if is_slotted "$s" && [ "$(active_slot "$s")" = none ]; then
      die "$s has no active slot yet: run scripts/deploy.sh --cutover once (see docs/19-operations-e12.md)"
    fi
  done
fi

needs_db=0
for s in "${SERVICES[@]}"; do
  case "$s" in
    api | worker) needs_db=1 ;;
    web | developers-portal | meetings-api | meetings-web) ;;
    *) die "unknown service $s" ;;
  esac
done

if [ "$ROLLBACK" = 0 ]; then
  [ "$needs_db" = 1 ] && backup
  build_list=()
  for s in "${SERVICES[@]}"; do build_list+=("$s"); done
  build "${build_list[@]}"
  [ "$needs_db" = 1 ] && migrate
fi

for s in "${SERVICES[@]}"; do
  if is_slotted "$s"; then deploy_slotted "$s"; else recreate "$s"; fi
done
[ "$CUTOVER" = 1 ] && cutover
log "all done"
