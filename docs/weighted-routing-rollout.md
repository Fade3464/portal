# Weighted Routing Rollout

The weighted routing schema is additive. Existing `Dialer.project`, `flow`, `batch`,
`batch_cursor`, and `route_ip` fields remain the automatic fallback.

## Production Deployment

1. Back up the PostgreSQL database using the normal production backup process.
2. Upload the release, but do not create or enable any routing policies yet.
3. Preview the migration:

   ```bash
   cd /srv/portal/backend
   venv/bin/python manage.py migrate --plan
   ```

4. Apply the additive migration:

   ```bash
   venv/bin/python manage.py migrate Chatbot 0020
   ```

5. Restart Gunicorn so every worker uses the same release:

   ```bash
   systemctl restart portal
   systemctl status portal --no-pager
   ```

Replace `portal` if the systemd unit has a different name. No cron change is needed.

## Configure One Dialer Safely

1. In Django admin, create a **Routing project** for the same client as the dialer.
   Its name is returned as the API `project` value when weighted route selection
   is active, so use the exact SIP project value expected by the downstream system.
2. Add all flows to the project. Use relative weights such as `60` and `40`.
3. Open each flow and add all batches with their relative weights.
4. Create a **Dialer routing policy**, select the dialer and project, and leave
   `enabled` off.
5. Add each route IP as a separate row with its relative weight.
6. Validate the draft from the server:

   ```bash
   venv/bin/python manage.py validate_routing_policies \
     --include-disabled --dialer "Exact Dialer Name"
   ```

7. Enable the policy in admin. Start with one low-risk dialer and monitor API and
   Gunicorn logs before enabling another.

## Rollback

Turn off `enabled` on the dialer's routing policy. The next request uses the legacy
Dialer fields; no deployment, migration rollback, or service restart is required.

## Behavior and Edge Cases

- Weights are relative integers and do not need to total 100.
- An enabled policy with invalid flows, missing batches, or missing routes falls back
  as one unit to legacy project, flow, batch, and route selection.
- Disabled or inactive projects use the legacy workflow.
- Redis stores compiled policies for performance. Admin edits invalidate the shared
  cache after the database transaction commits.
- API URLs, authentication, request bodies, and response keys remain unchanged.
