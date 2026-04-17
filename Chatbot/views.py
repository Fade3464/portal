import csv
import json
from functools import lru_cache
from pathlib import Path

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.exceptions import ValidationError
from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .models import BlacklistedNumbers, CallLog, Dialer, RESTAPITOKENS

AREA_CODES_CSV_PATH = Path("/home/kali/new1.2/assets/us_area_codes.csv")


def _json_error(message, status=400):
    return _json_response({"error": message}, status=status)


def _json_response(payload, status=200):
    return JsonResponse({"status_code": status, **payload}, status=status)


def _load_json_body(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON payload.")


def _extract_api_token(request):
    auth_header = request.headers.get("Authorization", "").strip()
    header_token = request.headers.get("X-API-Token", "").strip()

    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    return header_token


def _require_call_log_api_token(request):
    provided_token = _extract_api_token(request)

    if not provided_token:
        return _json_error("Invalid API token.", status=401)

    token_exists = RESTAPITOKENS.objects.filter(
        token=provided_token,
        is_active=True,
    ).exists()

    if not token_exists:
        return _json_error("Invalid API token.", status=401)

    return None


def _resolve_dialer(payload):
    dialer_id = payload.get("dialer_id")
    dialer_name = (payload.get("dialer_name") or "").strip()

    if dialer_id is not None:
        return Dialer.objects.filter(id=dialer_id).first()

    if dialer_name:
        return Dialer.objects.filter(dialer_name__iexact=dialer_name).order_by("id").first()

    return None


@lru_cache(maxsize=1)
def _load_area_code_map():
    area_code_map = {}

    if not AREA_CODES_CSV_PATH.exists():
        return area_code_map

    with AREA_CODES_CSV_PATH.open(newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            state_abbr = (row.get("Abbr") or "").strip() or None
            area_codes = (row.get("Area Codes") or "").split(",")

            for area_code in area_codes:
                code = area_code.strip()
                if code:
                    area_code_map[code] = state_abbr

    return area_code_map


def _derive_state_from_call_id(call_id):
    if call_id is None:
        return None

    call_id_str = str(call_id).strip()
    if len(call_id_str) < 3:
        return None

    area_code = call_id_str[:3]
    return _load_area_code_map().get(area_code)


def _serialize_call_log(call_log):
    return {
        "call_uuid": str(call_log.call_uuid),
        "call_id": call_log.call_id,
        "dialer_id": call_log.dialer_id,
        "dialer_name": call_log.dialer.dialer_name,
        "status": call_log.status,
        "state": call_log.state,
        "flow": call_log.flow,
        "batch": call_log.batch,
        "duration": call_log.duration,
        "created_at": call_log.created_at.isoformat(),
    }


def _normalize_datetime_param(value):
    if not value:
        return None

    parsed_value = parse_datetime(value)
    if parsed_value is None:
        raise ValueError("Invalid datetime format. Use ISO 8601 values.")

    if timezone.is_naive(parsed_value):
        parsed_value = timezone.make_aware(
            parsed_value,
            timezone.get_current_timezone(),
        )

    return parsed_value


def _get_authenticated_client(request):
    user = request.user

    if not user.is_authenticated:
        return None, _json_error("Authentication required.", status=401)

    client = getattr(user, "client_profile", None)
    if client is None:
        return None, _json_error("No client profile is linked to this user.", status=403)

    return client, None


def _get_today_range():
    now = timezone.localtime()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start_of_day, end_of_day


@csrf_exempt
@require_POST
def login_view(request):
    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or not password:
        return _json_error("Email and password are required.")

    User = get_user_model()
    user_record = User.objects.filter(email__iexact=email).order_by("id").first()
    username = user_record.get_username() if user_record else email

    user = authenticate(request, username=username, password=password)
    if user is None:
        return _json_error("Invalid email or password.", status=401)

    if not user.is_active:
        return _json_error("This account is inactive.", status=403)

    login(request, user)

    return _json_response(
        {
            "message": "Login successful.",
            "user": {
                "id": user.id,
                "username": user.get_username(),
                "email": user.email,
            },
        }
    )


@csrf_exempt
@require_POST
def logout_view(request):
    logout(request)
    return _json_response({"message": "Logout successful."})


@require_GET
def check_auth_view(request):
    user = request.user

    if not user.is_authenticated:
        return _json_response({"is_authenticated": False}, status=401)

    return _json_response(
        {
            "is_authenticated": True,
            "user": {
                "id": user.id,
                "username": user.get_username(),
                "email": user.email,
            },
        }
    )


@csrf_exempt
@require_POST
def create_call_log_view(request):
    token_error = _require_call_log_api_token(request)
    if token_error:
        return token_error

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    dialer = _resolve_dialer(payload)
    if dialer is None:
        return _json_error("A valid dialer_id or dialer_name is required.")

    try:
        resolved_call_id = payload.get("call_id")
        resolved_state = payload.get("state")
        if resolved_state is None:
            resolved_state = _derive_state_from_call_id(resolved_call_id)

        call_log = CallLog(
            call_id=resolved_call_id,
            dialer=dialer,
            status=(payload.get("status") or "").strip(),
            state=resolved_state,
            duration=payload.get("duration", 0),
        )
        call_log.full_clean()
        call_log.save()
    except ValidationError as exc:
        return _json_response({"errors": exc.message_dict}, status=400)

    return _json_response(
        {
            "message": "Call log created successfully.",
            "call_log": _serialize_call_log(call_log),
        },
        status=201,
    )


@csrf_exempt
@require_http_methods(["PATCH", "POST"])
def update_call_log_view(request, call_uuid):
    token_error = _require_call_log_api_token(request)
    if token_error:
        return token_error

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    call_log = (
        CallLog.objects.filter(call_uuid=call_uuid)
        .select_related("dialer")
        .order_by("-created_at", "-id")
        .first()
    )
    if call_log is None:
        return _json_error("No call log found for the provided call_uuid.", status=404)

    if "dialer_id" in payload or "dialer_name" in payload:
        dialer = _resolve_dialer(payload)
        if dialer is None:
            return _json_error("A valid dialer_id or dialer_name is required.")
        call_log.dialer = dialer

    if "call_id" in payload:
        call_log.call_id = payload.get("call_id")

    if "status" in payload:
        call_log.status = payload.get("status")

    if "duration" in payload:
        call_log.duration = payload.get("duration")

    if "state" in payload:
        call_log.state = payload.get("state")
    elif "call_id" in payload:
        call_log.state = _derive_state_from_call_id(call_log.call_id)

    try:
        call_log.full_clean()
        call_log.save()
    except ValidationError as exc:
        return _json_response({"errors": exc.message_dict}, status=400)

    return _json_response(
        {
            "message": "Call log updated successfully.",
            "call_log": _serialize_call_log(call_log),
        }
    )


@require_GET
def check_blacklisted_number_view(request, call_id):
    token_error = _require_call_log_api_token(request)
    if token_error:
        return token_error

    blacklist_entry = BlacklistedNumbers.objects.filter(number=call_id).first()

    return _json_response(
        {
            "call_id": call_id,
            "is_blacklisted": blacklist_entry is not None,
            "reason": blacklist_entry.reason if blacklist_entry else None,
        }
    )


@require_GET
def dashboard_filters_view(request):
    client, error_response = _get_authenticated_client(request)
    if error_response:
        return error_response

    active_dialers = list(
        Dialer.objects.filter(client=client, active=True)
        .order_by("dialer_name")
        .values("id", "dialer_name")
    )

    selected_dialer_id = request.GET.get("dialer_id")
    date_from = request.GET.get("date_from")
    date_to = request.GET.get("date_to")

    try:
        start_at = _normalize_datetime_param(date_from)
        end_at = _normalize_datetime_param(date_to)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    if start_at is None and end_at is None:
        start_at, end_at = _get_today_range()

    if start_at and end_at and start_at > end_at:
        return _json_error("The from date must be earlier than the to date.", status=400)

    filtered_logs = CallLog.objects.filter(
        dialer__client=client,
        dialer__active=True,
    ).select_related("dialer")

    normalized_dialer_id = None
    selected_dialer = None
    if selected_dialer_id and selected_dialer_id.lower() != "all":
        try:
            normalized_dialer_id = int(selected_dialer_id)
        except ValueError:
            return _json_error("dialer_id must be an integer or 'all'.", status=400)

        selected_dialer = (
            Dialer.objects.filter(
                id=normalized_dialer_id,
                client=client,
                active=True,
            )
            .only("id", "dialer_name")
            .first()
        )
        if selected_dialer is None:
            return _json_error("The selected dialer is not available for this client.", status=404)

        filtered_logs = filtered_logs.filter(dialer_id=normalized_dialer_id)

    if start_at:
        filtered_logs = filtered_logs.filter(created_at__gte=start_at)

    if end_at:
        filtered_logs = filtered_logs.filter(created_at__lte=end_at)

    total_count = filtered_logs.count()
    recent_logs = list(filtered_logs.order_by("-created_at", "-id")[:50])
    chart_records = list(
        filtered_logs.order_by("created_at", "id").values("created_at", "status")
    )
    breakdown_rows = list(
        filtered_logs.values(
            "dialer__id",
            "dialer__dialer_name",
            "dialer__flow",
            "dialer__batch",
        )
        .annotate(count=Count("id"))
        .order_by("dialer__dialer_name", "dialer__flow", "dialer__batch")
    )

    dialer_lookup = {}
    for row in breakdown_rows:
        dialer_id = row["dialer__id"]
        dialer_name = row["dialer__dialer_name"]
        flow_name = row["dialer__flow"] or "unknown"
        batch_value = row["dialer__batch"]
        count = row["count"]

        if dialer_id not in dialer_lookup:
            dialer_lookup[dialer_id] = {
                "dialer_id": dialer_id,
                "dialer_name": dialer_name,
                "total_count": 0,
                "flows": {},
            }

        dialer_group = dialer_lookup[dialer_id]
        dialer_group["total_count"] += count

        if flow_name not in dialer_group["flows"]:
            dialer_group["flows"][flow_name] = {
                "flow": flow_name,
                "total_count": 0,
                "batches": [],
            }

        flow_group = dialer_group["flows"][flow_name]
        flow_group["total_count"] += count
        flow_group["batches"].append(
            {
                "batch": batch_value,
                "count": count,
            }
        )

    flow_breakdown = []
    for dialer_group in dialer_lookup.values():
        flow_breakdown.append(
            {
                "dialer_id": dialer_group["dialer_id"],
                "dialer_name": dialer_group["dialer_name"],
                "total_count": dialer_group["total_count"],
                "flows": [
                    dialer_group["flows"][flow_name]
                    for flow_name in sorted(dialer_group["flows"].keys())
                ],
            }
        )

    return _json_response(
        {
            "dialers": active_dialers,
            "filters": {
                "dialer_id": normalized_dialer_id,
                "dialer_name": selected_dialer.dialer_name if selected_dialer else "All",
                "date_from": start_at.isoformat() if start_at else None,
                "date_to": end_at.isoformat() if end_at else None,
            },
            "results": {
                "total_count": total_count,
                "records": [_serialize_call_log(call_log) for call_log in recent_logs],
                "chart_records": [
                    {
                        "created_at": timezone.localtime(record["created_at"]).isoformat(),
                        "status": record["status"] or "unknown",
                    }
                    for record in chart_records
                ],
                "flow_breakdown": flow_breakdown,
            },
        }
    )
