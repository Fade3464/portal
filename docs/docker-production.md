# Docker Production Operations

For a first deployment beside the still-running host Nginx and legacy application,
follow [Parallel Production Cutover](parallel-production-cutover.md) first. This
document is the routine operations reference after cutover.

This stack runs seven responsibilities separately:

- `frontend`: Nginx, the built React SPA, static/media files, and reverse proxying.
- `backend`: Django served by Gunicorn.
- `pgbouncer`: transaction-mode PostgreSQL connection pooling for runtime traffic.
- `maintenance`: stale-LIVE expiration and recent rollup maintenance every minute.
- `db`: PostgreSQL with a persistent named volume.
- `redis`: shared cache and maintenance locks with a persistent named volume.
- `migrate`: a one-shot migration, static collection, and deployment-check service.

The backend and maintenance services connect through PgBouncer. The migration
service intentionally connects directly to PostgreSQL because transaction pooling
must not sit in front of schema changes. PostgreSQL, Redis, and PgBouncer are not
published on host ports.

Only the frontend is published, at `127.0.0.1:8080` by default. Keep the existing
host Nginx or another TLS ingress in front of this address.

## 1. Prepare

Install Docker Engine with the Compose plugin. From `/srv/portal/backend`:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -base64 48
```

Put the generated value in `SECRET_KEY`, choose a separate strong
`POSTGRES_PASSWORD`, and replace all example domains. The example file is
intentionally rejected by the production startup guard until both secrets are
replaced. Keep `localhost` in
`ALLOWED_HOSTS` because internal health checks use it.

Set `DJANGO_SUPERUSER_USERNAME`, `DJANGO_SUPERUSER_PASSWORD`, and optionally
`DJANGO_SUPERUSER_EMAIL` before the first start. The supplied example requests an
initial `admin` account, but its known example password must be changed before the
site is exposed. Bootstrap creates the account only when the username is absent;
it never changes an existing account or password.

Validate the resolved Compose file without starting anything:

```bash
docker compose --env-file .env.production config --quiet
```

## 2. Protect Existing Production Data

Do not point the new app at an empty database during cutover. First make a custom
format backup from the currently running PostgreSQL server:

```bash
PGPASSWORD='current-password' pg_dump \
  --host=127.0.0.1 \
  --username=current-user \
  --format=custom \
  --no-owner \
  --no-acl \
  current-database > /root/aims-pre-docker.dump
```

Test this process before the cutover. For the final dump, stop the old Gunicorn and
any old cron job that writes call statuses so no records arrive between dump and
restore.

Start only PostgreSQL and Redis:

```bash
docker compose --env-file .env.production up -d db redis
docker compose --env-file .env.production ps
```

Restore the existing database into the bundled PostgreSQL container:

```bash
docker compose --env-file .env.production exec -T db sh -c \
  'exec pg_restore --clean --if-exists --no-owner --no-acl \
  --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  < /root/aims-pre-docker.dump
```

## 3. Build and Start

```bash
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs migrate
```

Do not continue unless `migrate` exited with code `0` and the other long-running
services are healthy. Test locally on the server:

```bash
curl --fail http://127.0.0.1:8080/healthz
```

## 4. Host Nginx

Keep TLS termination on the host and proxy to the loopback-only container port:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

After HTTPS, login, API calls, and recordings are confirmed, increase
`SECURE_HSTS_SECONDS` gradually. Do not enable HSTS preload until every subdomain is
permanently HTTPS-capable.

## Routine Operations

Status and logs:

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=200 pgbouncer backend maintenance frontend
```

Inspect the live PgBouncer pools without publishing its admin port:

```bash
docker compose --env-file .env.production exec db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql \
  --host=pgbouncer --port=6432 --username="$POSTGRES_USER" \
  --dbname=pgbouncer --command="SHOW POOLS"'
```

`cl_waiting` should normally remain near zero. If it remains elevated, inspect slow
queries and PostgreSQL capacity before increasing pool sizes. Keep
`PGBOUNCER_MAX_DB_CONNECTIONS` below PostgreSQL `max_connections`; the supplied
value of 60 leaves room for migrations, backups, and emergency administration.

Create an on-host database backup:

```bash
ENV_FILE=.env.production ./scripts/backup-docker-db.sh
```

Deploy an update:

```bash
ENV_FILE=.env.production ./scripts/backup-docker-db.sh
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d db redis pgbouncer
docker compose --env-file .env.production run --rm migrate
docker compose --env-file .env.production up -d backend maintenance frontend
docker compose --env-file .env.production ps
```

Running migration as an explicit one-shot command makes a failed schema check stop
the deployment before the existing web container is replaced.

Run a Django command:

```bash
docker compose --env-file .env.production exec backend python manage.py check
docker compose --env-file .env.production exec backend python manage.py createsuperuser
docker compose --env-file .env.production exec backend \
  python manage.py validate_routing_policies --include-disabled
```

Changing `DJANGO_SUPERUSER_PASSWORD` after the account exists does not rotate its
password. Change it in Django admin or run the interactive command:

```bash
docker compose --env-file .env.production exec backend \
  python manage.py changepassword admin
```

Restart only the web application (PgBouncer remains available):

```bash
docker compose --env-file .env.production restart backend
```

Stop application containers without deleting data:

```bash
docker compose --env-file .env.production down
```

Never use `docker compose down -v` in production; `-v` deletes the PostgreSQL,
Redis, static, and media volumes.

## Rollback

Keep the previous application commit or image tag available. Restore the previous
code/image and run `docker compose up -d` again. Prefer backward-compatible database
migrations. If a database restore is unavoidable, stop `backend` and `maintenance`
first and restore only from a tested backup.

## PgBouncer Compatibility

The Compose runtime sets `DB_CONN_MAX_AGE=0` and
`DB_DISABLE_SERVER_SIDE_CURSORS=True`, which are the safe Django settings for
transaction pooling. Normal `transaction.atomic()` and `select_for_update()` blocks
remain on one PostgreSQL connection for their full transaction. Do not add
session-scoped SQL features such as `LISTEN`, session advisory locks, or temporary
tables to web requests without reassessing the pooling mode.
