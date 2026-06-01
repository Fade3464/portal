from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .dashboard_cache import bump_dashboard_cache_version
from .models import CallLog
from .rollups import (
    adjust_call_log_rollup,
    build_call_log_rollup_snapshot,
)


LIVE_STATUS_TIMEOUT_SECONDS = 60
LIVE_STATUS_EXPIRED_VALUE = "DC"
LIVE_STATUS_ACTIVE_VALUE = "LIVE"


def expire_stale_live_call_logs():
    expiry_cutoff = timezone.now() - timedelta(seconds=LIVE_STATUS_TIMEOUT_SECONDS)

    stale_logs = list(
        CallLog.objects.select_related("dialer").filter(
            status__iexact=LIVE_STATUS_ACTIVE_VALUE,
            created_at__lte=expiry_cutoff,
        )
    )

    affected_client_ids = sorted({call_log.dialer.client_id for call_log in stale_logs})
    updated_count = 0

    with transaction.atomic():
        for call_log in stale_logs:
            previous_rollup_snapshot = build_call_log_rollup_snapshot(call_log)

            call_log.status = LIVE_STATUS_EXPIRED_VALUE
            call_log.save(update_fields=["status"])

            current_rollup_snapshot = build_call_log_rollup_snapshot(call_log)
            adjust_call_log_rollup(previous_rollup_snapshot, current_rollup_snapshot)

            updated_count += 1

    for client_id in affected_client_ids:
        bump_dashboard_cache_version(client_id)

    return updated_count, affected_client_ids