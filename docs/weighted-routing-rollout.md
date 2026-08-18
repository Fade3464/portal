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

## Worked Django Admin Example

Target distribution:

- Flow `A`: 60% of calls, split equally between batches 1 and 2.
- Flow `B`: 40% of calls, split 50%/30%/20% between batches 1, 2, and 3.
- Route `10.0.0.1`: 60%; route `10.0.0.2`: 40%.

Create the required authentication user and **Client** first. Every object below
must use that same client.

Create the legacy **Dialer** row before the weighted hierarchy. Example values:

| Field | Example |
| --- | --- |
| Dialer name | `Medicare Dialer 01` |
| Client | `Acme Calls` |
| Project | `Medicare Legacy` |
| Flow | `A` |
| Batch | `1,2` |
| Route IP | `10.0.0.1,10.0.0.2` |
| Active | Yes |

Complete its API URLs, API credentials, transfer extension, and agent count as
normal. These project/flow/batch/route fields remain the automatic fallback if the
weighted policy is disabled or invalid.

Create **Routing project** `Medicare Playback` for client `Acme Calls`. Add these
flows in its inline rows:

| Flow | Weight | Active |
| --- | ---: | --- |
| `A` | 60 | Yes |
| `B` | 40 | Yes |

Open **Routing flows**, select `A`, and add:

| Batch value | Weight | Active |
| ---: | ---: | --- |
| 1 | 50 | Yes |
| 2 | 50 | Yes |

Open flow `B` and add:

| Batch value | Weight | Active |
| ---: | ---: | --- |
| 1 | 50 | Yes |
| 2 | 30 | Yes |
| 3 | 20 | Yes |

Create **Dialer routing policy**, select `Medicare Dialer 01` and
`Medicare Playback`, and leave **Enabled** unchecked. Add one endpoint per inline
row:

| Route IP | Weight | Active |
| --- | ---: | --- |
| `10.0.0.1` | 60 | Yes |
| `10.0.0.2` | 40 | Yes |

Save it disabled, validate it in the container, and then enable it:

```bash
docker compose --env-file .env.production exec backend \
  python manage.py validate_routing_policies \
  --include-disabled --dialer "Medicare Dialer 01"
```

The expected long-run assignment is:

| Flow and batch | All calls |
| --- | ---: |
| A / Batch 1 | 30% |
| A / Batch 2 | 30% |
| B / Batch 1 | 20% |
| B / Batch 2 | 12% |
| B / Batch 3 | 8% |

Route selection is independent of flow and batch: approximately 60% of all route
requests use `10.0.0.1` and 40% use `10.0.0.2`. The current model does not assign a
different route-IP distribution to each individual flow or batch.

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
