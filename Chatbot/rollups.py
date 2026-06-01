from datetime import timedelta, timezone as datetime_timezone
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Sum
from django.utils import timezone

from .models import CallLog, CallLogMinuteRollup


@dataclass(frozen=True)
class CallLogRollupSnapshot:
    client_id: int
    dialer_id: int
    bucket_start: object
    status: str
    flow: str
    batch: int
    duration: int


def _normalize_bucket_start(value):
    localized_value = timezone.localtime(value)
    return localized_value.replace(second=0, microsecond=0)


def _normalize_rebuild_range(start_at, end_at):
    normalized_start = _normalize_bucket_start(start_at) if start_at is not None else None
    normalized_end = _normalize_bucket_start(end_at) if end_at is not None else None
    return normalized_start, normalized_end


def build_call_log_rollup_snapshot(call_log):
    return CallLogRollupSnapshot(
        client_id=call_log.dialer.client_id,
        dialer_id=call_log.dialer_id,
        bucket_start=_normalize_bucket_start(call_log.created_at),
        status=call_log.status or "",
        flow=call_log.flow or "",
        batch=call_log.batch or 0,
        duration=call_log.duration or 0,
    )


def _apply_rollup_delta(snapshot, *, count_delta, duration_delta):
    if count_delta == 0 and duration_delta == 0:
        return

    rollup_filters = {
        "client_id": snapshot.client_id,
        "dialer_id": snapshot.dialer_id,
        "bucket_start": snapshot.bucket_start,
        "status": snapshot.status,
        "flow": snapshot.flow,
        "batch": snapshot.batch,
    }

    with transaction.atomic():
        updated = CallLogMinuteRollup.objects.filter(**rollup_filters).update(
            call_count=F("call_count") + count_delta,
            total_duration=F("total_duration") + duration_delta,
        )

        if not updated:
            if count_delta < 0:
                return

            try:
                CallLogMinuteRollup.objects.create(
                    **rollup_filters,
                    call_count=count_delta,
                    total_duration=duration_delta,
                )
            except IntegrityError:
                # Another worker created the same rollup row after our update
                # probe but before the insert. Apply the delta to that row instead.
                CallLogMinuteRollup.objects.filter(**rollup_filters).update(
                    call_count=F("call_count") + count_delta,
                    total_duration=F("total_duration") + duration_delta,
                )
            return

        CallLogMinuteRollup.objects.filter(
            **rollup_filters,
            call_count__lte=0,
        ).delete()


def increment_call_log_rollup(call_log):
    snapshot = build_call_log_rollup_snapshot(call_log)
    _apply_rollup_delta(
        snapshot,
        count_delta=1,
        duration_delta=snapshot.duration,
    )


def adjust_call_log_rollup(previous_snapshot, current_snapshot):
    if previous_snapshot == current_snapshot:
        return

    _apply_rollup_delta(
        previous_snapshot,
        count_delta=-1,
        duration_delta=-previous_snapshot.duration,
    )
    _apply_rollup_delta(
        current_snapshot,
        count_delta=1,
        duration_delta=current_snapshot.duration,
    )


def rebuild_call_log_rollups(*, batch_size=5000):
    return rebuild_call_log_rollups_for_range(
        start_at=None,
        end_at=None,
        batch_size=batch_size,
    )


def refresh_recent_call_log_rollups(*, lookback_minutes=120, batch_size=5000):
    end_at = timezone.now()
    start_at = end_at - timedelta(minutes=lookback_minutes)
    return rebuild_call_log_rollups_for_range(
        start_at=start_at,
        end_at=end_at,
        batch_size=batch_size,
    )


def rebuild_call_log_rollups_for_range(*, start_at, end_at, batch_size=5000):
    normalized_start_at, normalized_end_at = _normalize_rebuild_range(start_at, end_at)

    if start_at is None and end_at is None:
        CallLogMinuteRollup.objects.all().delete()
    else:
        rollup_qs = CallLogMinuteRollup.objects.all()
        if normalized_start_at is not None:
            rollup_qs = rollup_qs.filter(bucket_start__gte=normalized_start_at)
        if normalized_end_at is not None:
            rollup_qs = rollup_qs.filter(bucket_start__lte=normalized_end_at)
        rollup_qs.delete()

    call_log_qs = CallLog.objects.all()
    if normalized_start_at is not None:
        call_log_qs = call_log_qs.filter(created_at__gte=normalized_start_at)
    if end_at is not None:
        call_log_qs = call_log_qs.filter(created_at__lte=end_at)

    aggregated_rows = (
        call_log_qs.values(
            "dialer__client_id",
            "dialer_id",
            "created_at__year",
            "created_at__month",
            "created_at__day",
            "created_at__hour",
            "created_at__minute",
            "status",
            "flow",
            "batch",
        )
        .annotate(
            call_count=Count("id"),
            total_duration=Sum("duration"),
        )
        .order_by()
    )

    processed_count = 0
    pending_rows = []

    for row in aggregated_rows.iterator(chunk_size=batch_size):
        pending_rows.append(
            CallLogMinuteRollup(
                client_id=row["dialer__client_id"],
                dialer_id=row["dialer_id"],
                bucket_start=timezone.datetime(
                    row["created_at__year"],
                    row["created_at__month"],
                    row["created_at__day"],
                    row["created_at__hour"],
                    row["created_at__minute"],
                    tzinfo=datetime_timezone.utc,
                ),
                status=row["status"] or "",
                flow=row["flow"] or "",
                batch=row["batch"] or 0,
                call_count=row["call_count"] or 0,
                total_duration=row["total_duration"] or 0,
            )
        )
        processed_count += row["call_count"] or 0

        if len(pending_rows) >= batch_size:
            CallLogMinuteRollup.objects.bulk_create(
                pending_rows,
                batch_size=batch_size,
                ignore_conflicts=True,
            )
            pending_rows = []

    if pending_rows:
        CallLogMinuteRollup.objects.bulk_create(
            pending_rows,
            batch_size=batch_size,
            ignore_conflicts=True,
        )

    return processed_count
