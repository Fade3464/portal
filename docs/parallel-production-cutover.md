# Parallel Production Cutover

This runbook deploys the container stack beside the currently running application.
The old application and host Nginx remain online until the new stack passes every
health gate. The only cutover action is a graceful Nginx upstream change.

Replace these placeholders before running commands:

- Production subdomain: `interface.pulsarpportal.live`.
- `/srv/portal/backend`: the deployment directory.
- `portal.service`: the existing application service, if it has a different name.
- `/etc/nginx/sites-available/portal`: the existing Nginx virtual-host file.

## 1. Preflight Without Changing Traffic

Confirm the current listener and identify the active Nginx configuration. Do not
stop the old service yet.

```bash
sudo ss -ltnp
sudo nginx -T | grep -n "server_name interface.pulsarpportal.live"
sudo systemctl status nginx --no-pager
sudo systemctl status portal.service --no-pager
dig +short interface.pulsarpportal.live
docker version
docker compose version
df -h
free -h
```

The container frontend defaults to `127.0.0.1:8080`. Confirm that port is free:

```bash
sudo ss -ltnp | grep ':8080 ' || true
```

If it is occupied, choose another loopback port such as `18080` in
`.env.production`. Do not publish PostgreSQL, Redis, PgBouncer, or Gunicorn ports.

Back up the current Nginx configuration before editing it:

```bash
sudo cp /etc/nginx/sites-available/portal \
  /etc/nginx/sites-available/portal.pre-container
```

Confirm the existing HTTPS virtual host has a valid certificate for the subdomain.
If it does not, obtain and verify the certificate against the still-running Nginx
site before introducing the container preview or changing upstreams.

```bash
sudo certbot --nginx -d interface.pulsarpportal.live
sudo certbot certificates
sudo certbot renew --dry-run
```

## 2. Install the Release

Put the reviewed application release in `/srv/portal/backend`, then enter it:

```bash
cd /srv/portal/backend
cp .env.production.example .env.production
chmod 600 .env.production
```

Generate independent secrets. Hex values avoid shell and Compose escaping issues:

```bash
openssl rand -hex 48
openssl rand -hex 32
openssl rand -base64 24
```

Use the values for `SECRET_KEY`, `POSTGRES_PASSWORD`, and
`DJANGO_SUPERUSER_PASSWORD`, respectively. Configure at least these values:

```dotenv
COMPOSE_PROJECT_NAME=aims
BIND_ADDRESS=127.0.0.1
APP_PORT=8080

PROD=True
DEBUG=False
SECRET_KEY=generated-application-secret
ALLOWED_HOSTS=interface.pulsarpportal.live,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://interface.pulsarpportal.live,https://interface.pulsarpportal.live:8443
CORS_ALLOWED_ORIGINS=https://interface.pulsarpportal.live

POSTGRES_DB=aims
POSTGRES_USER=aims
POSTGRES_PASSWORD=generated-database-password

DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_PASSWORD=generated-admin-password
DJANGO_SUPERUSER_EMAIL=

RECORDINGS_HOST_PATH=/srv/ingress_records
CALL_RECORDINGS_BASE_URL=https://interface.pulsarpportal.live/recordings
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=0
SECURE_HSTS_INCLUDE_SUBDOMAINS=False
SECURE_HSTS_PRELOAD=False
```

Do not use the known example admin password on an internet-facing deployment.
Changing the env password after `admin` exists will not reset that account.

Validate configuration before pulling or starting services:

```bash
docker compose --env-file .env.production config --quiet
```

## 3. Build Beside the Old Application

Building does not change Nginx traffic:

```bash
docker compose --env-file .env.production build
```

Because the existing data is not required, initialize a fresh bundled database and
start the complete stack:

```bash
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps --all
docker compose --env-file .env.production logs migrate
```

Required state:

- `migrate` exited with code `0`.
- `db`, `redis`, `pgbouncer`, `backend`, and `frontend` are healthy.
- `maintenance` is running.
- The migration log says the bootstrap superuser was created or already exists.

If any gate fails, leave Nginx unchanged and inspect logs:

```bash
docker compose --env-file .env.production logs --tail=250 \
  db redis pgbouncer migrate backend maintenance frontend
```

## 4. Test the New Stack Before Cutover

These requests go directly to the loopback container port and do not touch the old
Nginx route:

```bash
curl --fail --show-error --silent \
  -H 'Host: interface.pulsarpportal.live' \
  -H 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8080/healthz

curl --show-error --silent --write-out '\nHTTP %{http_code}\n' \
  -H 'Host: interface.pulsarpportal.live' \
  -H 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8080/api/check-auth/

curl --fail --output /dev/null --write-out 'SPA HTTP %{http_code}\n' \
  -H 'Host: interface.pulsarpportal.live' \
  -H 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8080/

curl --fail --output /dev/null --write-out 'STATIC HTTP %{http_code}\n' \
  -H 'Host: interface.pulsarpportal.live' \
  -H 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8080/static/admin/css/base.css
```

Expected results are health `200`, unauthenticated auth check `401`, SPA `200`, and
static file `200`.

Verify the admin account without printing its password:

```bash
docker compose --env-file .env.production exec backend python manage.py shell -c \
  "from django.contrib.auth import get_user_model; u=get_user_model().objects.get(username='admin'); print(u.is_active, u.is_staff, u.is_superuser)"
```

All three values must be `True`.

Verify PgBouncer is using transaction pooling and is not queueing clients:

```bash
docker compose --env-file .env.production exec db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql \
  --host=pgbouncer --port=6432 --username="$POSTGRES_USER" \
  --dbname=pgbouncer --command="SHOW POOLS"'
```

The application row must show `pool_mode` as `transaction`. `cl_waiting` should be
zero during this idle preflight.

## 5. Configure Fresh Data Through a Private TLS Preview

Do this before public cutover so dialer requests never reach an unconfigured fresh
database. The preview listener binds only to server loopback and is reached through
SSH; it does not open another public port.

Copy the existing HTTPS virtual host to a temporary file. In the copy:

1. Change its listener to `listen 127.0.0.1:8443 ssl;`.
2. Keep the existing `server_name`, certificate, and TLS directives.
3. Remove old application-specific locations.
4. Use the container proxy `location /` shown in the next section.

Enable and validate the temporary virtual host using the host's existing Nginx
layout, then reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo ss -ltnp | grep '127.0.0.1:8443'
```

On the administrator workstation, establish the tunnel:

```bash
ssh -L 8443:127.0.0.1:8443 your-user@your-server-ip
```

Temporarily map the production hostname to `127.0.0.1` in the workstation's hosts
file, then open:

```text
https://interface.pulsarpportal.live:8443/admin/
```

The browser still sees a valid hostname and TLS certificate while traffic travels
inside SSH. Configure clients, projects, flows, batches, routes, dialers, and API
tokens. Exercise test API requests against port `8443` and confirm call logs and
dashboard analytics update correctly. Remove the workstation hosts-file entry when
testing is complete.

If a private preview cannot be created, schedule a short maintenance window and
configure immediately after cutover. Do not knowingly send live dialer traffic to
the fresh database before tokens and routing are configured.

## 6. Prepare the Nginx Switch

Keep all existing TLS certificate directives. In the existing HTTPS server block,
route the entire virtual host to the container frontend. Remove or update any more
specific old locations such as `/api/`, `/admin/`, `/static/`, or `/media/`; Nginx
would otherwise keep sending those paths to the old application even if
`location /` changes. A safe single location block is:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 5s;
    proxy_send_timeout 65s;
    proxy_read_timeout 65s;
}
```

The containing HTTPS virtual host must use:

```nginx
server_name interface.pulsarpportal.live;
```

Keep the existing HTTP-to-HTTPS redirect server block. Set
`client_max_body_size 25m;` in the HTTPS server if API uploads require it.

Validate before reload:

```bash
sudo nginx -t
```

Do not proceed if this command reports any error.

## 7. Cut Over Without Stopping the Old App

Reload Nginx gracefully:

```bash
sudo systemctl reload nginx
sudo systemctl status nginx --no-pager
```

The old application remains running for immediate rollback, but new requests now go
to the containers. Verify through public TLS:

```bash
curl --fail https://interface.pulsarpportal.live/healthz
curl --fail --output /dev/null --write-out 'PUBLIC HTTP %{http_code}\n' \
  https://interface.pulsarpportal.live/
```

Then verify in a private browser window:

1. Load the dashboard and sign in.
2. Open `/admin/` and sign in as `admin`.
3. Exercise one create/update call-log request and confirm dashboard data changes.
4. Confirm recordings and static assets load without mixed-content errors.

Monitor the new path for at least 15 to 30 minutes:

```bash
docker compose --env-file .env.production ps --all
docker compose --env-file .env.production logs --follow --tail=100 \
  pgbouncer backend maintenance frontend
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

Do not increase Gunicorn workers and PgBouncer pool sizes during cutover. First
observe CPU, memory, PostgreSQL activity, slow queries, and `cl_waiting`.

After public verification, disable the temporary `127.0.0.1:8443` preview virtual
host, run `sudo nginx -t`, and reload Nginx.

## 8. Retire the Old Application

Only after the public checks and observation window pass, stop the previous
Gunicorn service and its old maintenance cron or timer:

```bash
sudo systemctl stop portal.service
sudo systemctl status portal.service --no-pager
```

Use the actual service name. Keep it installed but stopped for the first 24 to 48
hours so rollback remains quick; disable it only after that stability period. Do not
delete its code, virtualenv, database, or Nginx backup during the initial stability
period. Confirm that no obsolete cron job still writes to the old database:

```bash
sudo crontab -l
systemctl list-timers --all
```

## 9. Immediate Rollback

If the container path fails before important new data is entered:

1. Restore `/etc/nginx/sites-available/portal.pre-container`, or change
   `proxy_pass` back to the old application's loopback port.
2. Run `sudo nginx -t`.
3. Start `portal.service` if it was stopped.
4. Run `sudo systemctl reload nginx`.
5. Confirm the old public health and login paths.

Leave the container stack running for diagnosis unless it is consuming harmful
resources. If it must be stopped, preserve all data volumes:

```bash
docker compose --env-file .env.production down
```

Never run `docker compose down -v` in production.

## 10. Post-Cutover Operations

Ensure Docker itself starts after a server reboot. The long-running Compose services
already use restart policies; the one-shot migration service should run only during
deployments.

```bash
sudo systemctl enable docker
sudo systemctl status docker --no-pager
```

Create the first backup immediately after configuration:

```bash
ENV_FILE=.env.production ./scripts/backup-docker-db.sh
```

Schedule that script from the host and copy backups off-server. Test restoration on
a separate Compose project before relying on the backup policy.

For updates, always back up first and run migrations before replacing the web
containers:

```bash
ENV_FILE=.env.production ./scripts/backup-docker-db.sh
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d db redis pgbouncer
docker compose --env-file .env.production run --rm migrate
docker compose --env-file .env.production up -d backend maintenance frontend
docker compose --env-file .env.production ps --all
```

Keep HSTS at zero for the first deployment. Increase it only after HTTPS behavior is
confirmed and every relevant subdomain is permanently HTTPS-capable.

Continue with the routine commands, backup guidance, and PgBouncer monitoring in
[Docker Production Operations](docker-production.md).
