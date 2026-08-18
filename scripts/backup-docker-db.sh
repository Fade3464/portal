#!/usr/bin/env bash
set -euo pipefail

env_file="${ENV_FILE:-.env.production}"
backup_dir="${BACKUP_DIR:-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="${backup_dir}/aims-${timestamp}.dump"
temporary_path="${backup_path}.partial"

umask 077
mkdir -p "$backup_dir"

cleanup() {
    rm -f "$temporary_path"
}
trap cleanup EXIT

docker compose --env-file "$env_file" exec -T db sh -c \
    'exec pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" "$POSTGRES_DB"' \
    > "$temporary_path"

test -s "$temporary_path"
mv "$temporary_path" "$backup_path"
trap - EXIT

printf 'Database backup created: %s\n' "$backup_path"
