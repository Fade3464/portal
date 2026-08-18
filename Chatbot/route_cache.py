from threading import Lock

from django.db.utils import OperationalError, ProgrammingError

from .models import Dialer

_route_cache = {}
_route_cache_lock = Lock()


def parse_route_ip_values(raw_route_ip):
    if not raw_route_ip:
        return []

    normalized = str(raw_route_ip).replace("\r", "\n")
    parts = []

    for line in normalized.split("\n"):
        for item in line.split(","):
            value = item.strip()
            if value:
                parts.append(value)

    return parts


def preload_dialer_route_map():
    route_map = {}

    try:
        for (
            dialer_id,
            dialer_name,
            route_ip,
            project,
            xferexten,
            batch,
            flow,
            agent_api_url,
            non_agent_api_url,
            api_user,
            api_password,
        ) in Dialer.objects.values_list(
            "id",
            "dialer_name",
            "route_ip",
            "project",
            "xferexten",
            "batch",
            "flow",
            "agent_api_url",
            "non_agent_api_url",
            "api_user",
            "api_password",
        ):
            normalized_name = (dialer_name or "").strip().lower()
            if not normalized_name:
                continue

            route_map[normalized_name] = {
                "dialer_id": dialer_id,
                "dialer_name": dialer_name,
                "route_ips": parse_route_ip_values(route_ip),
                "project": project,
                "xferexten": xferexten,
                "batch": batch,
                "flow": flow,
                "agent_api_url": agent_api_url,
                "non_agent_api_url": non_agent_api_url,
                "api_user": api_user,
                "api_password": api_password,
            }
    except (OperationalError, ProgrammingError):
        return False

    with _route_cache_lock:
        _route_cache.clear()
        _route_cache.update(route_map)

    return True


def get_dialer_route_map():
    with _route_cache_lock:
        return dict(_route_cache)
