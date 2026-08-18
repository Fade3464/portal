import hashlib
import logging
import secrets

from django.conf import settings
from django.core.cache import cache
from django.db import DatabaseError
from django.db.models import Prefetch

from .models import (
    DialerRoutingPolicy,
    RoutingBatch,
    RoutingEndpoint,
    RoutingFlow,
)

logger = logging.getLogger(__name__)

_database_identity = str(settings.DATABASES["default"]["NAME"])
ROUTING_POLICY_CACHE_NAMESPACE = hashlib.sha256(
    _database_identity.encode("utf-8")
).hexdigest()[:12]
ROUTING_POLICY_CACHE_VERSION_KEY = (
    f"routing_policy:{ROUTING_POLICY_CACHE_NAMESPACE}:version"
)
ROUTING_POLICY_CACHE_TTL = getattr(settings, "ROUTING_POLICY_CACHE_TTL", 300)


def _weighted_value(rows, value_key):
    weighted_rows = [row for row in rows if int(row.get("weight") or 0) > 0]
    total_weight = sum(int(row["weight"]) for row in weighted_rows)
    if total_weight <= 0:
        return None

    target = secrets.randbelow(total_weight)
    cumulative_weight = 0
    for row in weighted_rows:
        cumulative_weight += int(row["weight"])
        if target < cumulative_weight:
            return row[value_key]

    return None


def _get_cache_version():
    try:
        return cache.get(ROUTING_POLICY_CACHE_VERSION_KEY, 1)
    except Exception:
        logger.exception("Unable to read the routing policy cache version.")
        return None


def invalidate_routing_policy_cache():
    try:
        cache.add(ROUTING_POLICY_CACHE_VERSION_KEY, 1, timeout=None)
        cache.incr(ROUTING_POLICY_CACHE_VERSION_KEY)
    except Exception:
        logger.exception("Unable to invalidate the routing policy cache.")


def _load_policy_config(dialer_id):
    active_batches = RoutingBatch.objects.filter(active=True).order_by("id")
    active_flows = (
        RoutingFlow.objects.filter(active=True)
        .prefetch_related(Prefetch("batches", queryset=active_batches))
        .order_by("id")
    )
    active_endpoints = RoutingEndpoint.objects.filter(active=True).order_by("id")

    try:
        policy = (
            DialerRoutingPolicy.objects.select_related("project", "dialer")
            .prefetch_related(
                Prefetch("project__flows", queryset=active_flows),
                Prefetch("endpoints", queryset=active_endpoints),
            )
            .filter(dialer_id=dialer_id, enabled=True, project__active=True)
            .first()
        )
    except DatabaseError:
        # This also protects a code-first rolling deploy before the additive migration runs.
        logger.exception("Unable to load routing policy for dialer %s.", dialer_id)
        return None

    if policy is None or policy.project.client_id != policy.dialer.client_id:
        return None

    project_name = (policy.project.name or "").strip()
    if not project_name:
        return None

    flows = []
    assignment_is_valid = True
    for flow in policy.project.flows.all():
        flow_name = (flow.name or "").strip()
        batches = [
            {"value": batch.value, "weight": batch.weight}
            for batch in flow.batches.all()
            if batch.weight > 0
        ]
        if not flow_name or flow.weight <= 0 or not batches:
            assignment_is_valid = False
            break
        flows.append({"name": flow_name, "weight": flow.weight, "batches": batches})

    if not flows:
        assignment_is_valid = False

    endpoints = []
    for endpoint in policy.endpoints.all():
        route_ip = (endpoint.route_ip or "").strip()
        if (
            route_ip
            and endpoint.weight > 0
            and not any(separator in route_ip for separator in (",", "\n", "\r"))
        ):
            endpoints.append({"route_ip": route_ip, "weight": endpoint.weight})

    if not assignment_is_valid or not endpoints:
        return None

    return {
        "project": project_name,
        "flows": flows,
        "endpoints": endpoints,
    }


def get_routing_policy_config(dialer_id):
    version = _get_cache_version()
    cache_key = (
        f"routing_policy:{ROUTING_POLICY_CACHE_NAMESPACE}:{version}:{dialer_id}"
        if version is not None
        else None
    )

    if cache_key:
        try:
            cached_config = cache.get(cache_key)
        except Exception:
            logger.exception("Unable to read cached routing policy for dialer %s.", dialer_id)
        else:
            if cached_config is not None:
                return cached_config or None

    config = _load_policy_config(dialer_id)
    if cache_key:
        try:
            cache.set(cache_key, config or {}, ROUTING_POLICY_CACHE_TTL)
        except Exception:
            logger.exception("Unable to cache routing policy for dialer %s.", dialer_id)
    return config


def select_weighted_call_assignment(dialer_id):
    config = get_routing_policy_config(dialer_id)
    if not config or not config["flows"]:
        return None

    selected_flow_name = _weighted_value(config["flows"], "name")
    selected_flow = next(
        (flow for flow in config["flows"] if flow["name"] == selected_flow_name),
        None,
    )
    if selected_flow is None:
        return None

    selected_batch = _weighted_value(selected_flow["batches"], "value")
    if selected_batch is None:
        return None

    return {
        "project": config["project"],
        "flow": selected_flow["name"],
        "batch": selected_batch,
    }


def select_weighted_route(dialer_id):
    config = get_routing_policy_config(dialer_id)
    if not config or not config["endpoints"]:
        return None

    route_ip = _weighted_value(config["endpoints"], "route_ip")
    if route_ip is None:
        return None

    return {
        "project": config["project"],
        "route_ip": route_ip,
    }
