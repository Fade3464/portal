#!/bin/sh
set -eu

require_value() {
    variable_name="$1"
    eval "variable_value=\${$variable_name:-}"
    if [ -z "$variable_value" ]; then
        echo "ERROR: $variable_name is required by PgBouncer." >&2
        exit 1
    fi
}

require_positive_integer() {
    variable_name="$1"
    eval "variable_value=\${$variable_name:-}"
    case "$variable_value" in
        ''|*[!0-9]*|0)
            echo "ERROR: $variable_name must be a positive integer." >&2
            exit 1
            ;;
    esac
}

require_value POSTGRES_DB
require_value POSTGRES_USER
require_value POSTGRES_PASSWORD
require_value PGBOUNCER_DATABASE_HOST
require_value PGBOUNCER_DATABASE_PORT

case "$POSTGRES_DB" in
    *[!A-Za-z0-9_.-]*)
        echo "ERROR: POSTGRES_DB contains unsupported characters." >&2
        exit 1
        ;;
esac

case "$POSTGRES_USER" in
    *[!A-Za-z0-9_.-]*)
        echo "ERROR: POSTGRES_USER contains unsupported characters." >&2
        exit 1
        ;;
esac

max_client_conn="${PGBOUNCER_MAX_CLIENT_CONN:-500}"
default_pool_size="${PGBOUNCER_DEFAULT_POOL_SIZE:-40}"
min_pool_size="${PGBOUNCER_MIN_POOL_SIZE:-5}"
reserve_pool_size="${PGBOUNCER_RESERVE_POOL_SIZE:-10}"
max_db_connections="${PGBOUNCER_MAX_DB_CONNECTIONS:-60}"
query_wait_timeout="${PGBOUNCER_QUERY_WAIT_TIMEOUT:-120}"

for variable_name in \
    max_client_conn \
    default_pool_size \
    min_pool_size \
    reserve_pool_size \
    max_db_connections \
    query_wait_timeout
do
    require_positive_integer "$variable_name"
done

if [ "$default_pool_size" -gt "$max_db_connections" ]; then
    echo "ERROR: PGBOUNCER_DEFAULT_POOL_SIZE cannot exceed PGBOUNCER_MAX_DB_CONNECTIONS." >&2
    exit 1
fi

if [ "$min_pool_size" -gt "$default_pool_size" ]; then
    echo "ERROR: PGBOUNCER_MIN_POOL_SIZE cannot exceed PGBOUNCER_DEFAULT_POOL_SIZE." >&2
    exit 1
fi

case "$POSTGRES_PASSWORD" in
    *"
"*)
        echo "ERROR: POSTGRES_PASSWORD cannot contain a newline." >&2
        exit 1
        ;;
esac

escaped_password=$(printf '%s' "$POSTGRES_PASSWORD" | sed 's/\\/\\\\/g; s/"/\\"/g')

install -d -m 0750 -o postgres -g postgres /etc/pgbouncer /var/run/pgbouncer
printf '"%s" "%s"\n' "$POSTGRES_USER" "$escaped_password" > /etc/pgbouncer/userlist.txt
chmod 0600 /etc/pgbouncer/userlist.txt
chown postgres:postgres /etc/pgbouncer/userlist.txt

cat > /etc/pgbouncer/pgbouncer.ini <<EOF
[databases]
$POSTGRES_DB = host=$PGBOUNCER_DATABASE_HOST port=$PGBOUNCER_DATABASE_PORT dbname=$POSTGRES_DB

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
unix_socket_dir = /var/run/pgbouncer
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = $max_client_conn
default_pool_size = $default_pool_size
min_pool_size = $min_pool_size
reserve_pool_size = $reserve_pool_size
max_db_connections = $max_db_connections
query_wait_timeout = $query_wait_timeout
server_connect_timeout = 15
server_login_retry = 5
server_idle_timeout = 60
server_lifetime = 3600
server_check_delay = 30
server_check_query = SELECT 1
stats_users = $POSTGRES_USER
admin_users = $POSTGRES_USER
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
pidfile = /var/run/pgbouncer/pgbouncer.pid
EOF

chmod 0640 /etc/pgbouncer/pgbouncer.ini
chown postgres:postgres /etc/pgbouncer/pgbouncer.ini

exec su-exec postgres "$@"
