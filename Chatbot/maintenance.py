from contextlib import contextmanager

from Chatbot.api_token_cache import get_active_api_tokens, preload_active_api_tokens
from Chatbot.dashboard_cache import bump_dashboard_cache_version
from Chatbot.live_status import expire_stale_live_call_logs
from Chatbot.models import Client
from Chatbot.rollups import rebuild_call_log_rollups, refresh_recent_call_log_rollups
from Chatbot.route_cache import get_dialer_route_map, preload_dialer_route_map
from django.core.cache import cache


ROLLUP_MAINTENANCE_LOCK_KEY = "call_log_rollup_maintenance_lock"
ROLLUP_MAINTENANCE_LOCK_TIMEOUT_SECONDS = 300


@contextmanager
def _maintenance_lock():
    acquired = cache.add(
        ROLLUP_MAINTENANCE_LOCK_KEY,
        "1",
        ROLLUP_MAINTENANCE_LOCK_TIMEOUT_SECONDS,
    )

    try:
        yield acquired
    finally:
        if acquired:
            cache.delete(ROLLUP_MAINTENANCE_LOCK_KEY)


def preload_runtime_caches():
    tokens_loaded = preload_active_api_tokens()
    routes_loaded = preload_dialer_route_map()

    return {
        "tokens_loaded": tokens_loaded,
        "routes_loaded": routes_loaded,
        "token_count": len(get_active_api_tokens()),
        "route_count": len(get_dialer_route_map()),
    }


def invalidate_dashboard_caches(client_ids=None):
    normalized_client_ids = client_ids
    if normalized_client_ids is None:
        normalized_client_ids = Client.objects.values_list("id", flat=True)

    invalidated_ids = []
    for client_id in normalized_client_ids:
        bump_dashboard_cache_version(client_id)
        invalidated_ids.append(client_id)

    return invalidated_ids


def refresh_rollups_and_invalidate_caches(*, lookback_minutes=120):
    with _maintenance_lock() as acquired:
        if not acquired:
            return {
                "processed_count": 0,
                "invalidated_client_ids": [],
                "skipped": True,
            }

        processed_count = refresh_recent_call_log_rollups(
            lookback_minutes=lookback_minutes,
        )
        invalidated_ids = invalidate_dashboard_caches()

    return {
        "processed_count": processed_count,
        "invalidated_client_ids": invalidated_ids,
        "skipped": False,
    }


def rebuild_rollups_and_invalidate_caches():
    with _maintenance_lock() as acquired:
        if not acquired:
            return {
                "processed_count": 0,
                "invalidated_client_ids": [],
                "skipped": True,
            }

        processed_count = rebuild_call_log_rollups()
        invalidated_ids = invalidate_dashboard_caches()

    return {
        "processed_count": processed_count,
        "invalidated_client_ids": invalidated_ids,
        "skipped": False,
    }


def run_runtime_maintenance(*, lookback_minutes=60, preload_caches=False):
    cache_preload_summary = None
    if preload_caches:
        cache_preload_summary = preload_runtime_caches()

    with _maintenance_lock() as acquired:
        if not acquired:
            return {
                "expired_live_count": 0,
                "affected_client_ids": [],
                "refreshed_count": 0,
                "cache_preload_summary": cache_preload_summary,
                "skipped": True,
            }

        expired_live_count, affected_client_ids = expire_stale_live_call_logs()
        refreshed_count = refresh_recent_call_log_rollups(
            lookback_minutes=lookback_minutes,
        )
        invalidated_client_ids = invalidate_dashboard_caches(affected_client_ids)

    return {
        "expired_live_count": expired_live_count,
        "affected_client_ids": invalidated_client_ids,
        "refreshed_count": refreshed_count,
        "cache_preload_summary": cache_preload_summary,
        "skipped": False,
    }
