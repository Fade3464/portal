#!/bin/sh
set -eu

case "${PROD:-False}" in
    True|true|TRUE|1)
        secret_key="${SECRET_KEY:-}"
        postgres_password="${POSTGRES_PASSWORD:-}"
        superuser_username="${DJANGO_SUPERUSER_USERNAME:-}"
        superuser_password="${DJANGO_SUPERUSER_PASSWORD:-}"

        if [ "${#secret_key}" -lt 50 ]; then
            echo "ERROR: SECRET_KEY must contain at least 50 characters in production." >&2
            exit 1
        fi

        case "$secret_key" in
            replace-*|django-insecure-*)
                echo "ERROR: Replace the example SECRET_KEY before production startup." >&2
                exit 1
                ;;
        esac

        if [ "${#postgres_password}" -lt 16 ]; then
            echo "ERROR: POSTGRES_PASSWORD must contain at least 16 characters." >&2
            exit 1
        fi

        case "$postgres_password" in
            replace-*)
                echo "ERROR: Replace the example POSTGRES_PASSWORD before startup." >&2
                exit 1
                ;;
        esac

        if [ -z "$superuser_username" ] || [ "${#superuser_password}" -lt 8 ]; then
            echo "ERROR: Configure DJANGO_SUPERUSER_USERNAME and a " \
                "DJANGO_SUPERUSER_PASSWORD of at least 8 characters." >&2
            exit 1
        fi
        ;;
esac

if [ "$(id -u)" = "0" ]; then
    mkdir -p /app/staticfiles /app/media
    chown app:app /app/staticfiles /app/media
    exec gosu app "$@"
fi

exec "$@"
