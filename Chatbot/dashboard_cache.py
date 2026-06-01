import hashlib
import json

from django.core.cache import cache


DASHBOARD_CACHE_VERSION_PREFIX = "dashboard_cache_version"


def _dashboard_cache_version_key(client_id):
    return f"{DASHBOARD_CACHE_VERSION_PREFIX}:{client_id}"


def get_dashboard_cache_version(client_id):
    version_key = _dashboard_cache_version_key(client_id)
    version = cache.get(version_key)
    if version is None:
        cache.set(version_key, 1, None)
        return 1
    return int(version)


def bump_dashboard_cache_version(client_id):
    version_key = _dashboard_cache_version_key(client_id)
    if cache.add(version_key, 2, None):
        return 2

    try:
        return cache.incr(version_key)
    except ValueError:
        cache.set(version_key, 2, None)
        return 2


def build_dashboard_cache_key(namespace, client_id, cache_payload):
    version = get_dashboard_cache_version(client_id)
    payload_with_version = {
        "version": version,
        **cache_payload,
    }
    digest = hashlib.sha256(
        json.dumps(
            payload_with_version,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return f"{namespace}:{digest}"
