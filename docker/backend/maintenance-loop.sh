#!/bin/sh
set -u

interval="${MAINTENANCE_INTERVAL_SECONDS:-60}"
lookback="${MAINTENANCE_LOOKBACK_MINUTES:-60}"

case "$interval" in
    ''|*[!0-9]*) interval=60 ;;
esac

case "$lookback" in
    ''|*[!0-9]*) lookback=60 ;;
esac

if [ "$interval" -lt 15 ]; then
    interval=15
fi

shutdown=0
trap 'shutdown=1' TERM INT

while [ "$shutdown" -eq 0 ]; do
    python manage.py run_runtime_maintenance --lookback-minutes "$lookback" || true

    sleep "$interval" &
    wait "$!" || true
done
