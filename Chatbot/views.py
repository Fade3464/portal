import csv
import json
from functools import lru_cache
from pathlib import Path

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email
from django.db.models import Avg, Count, Sum
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .models import BlacklistedNumbers, CallLog, Dialer, RESTAPITOKENS

AREA_CODES_CSV_PATH = Path("/home/kali/new1.2/assets/us_area_codes.csv")
url_validator = URLValidator()


def _get_user_display_name(user):
    full_name = f"{user.first_name} {user.last_name}".strip()
    return full_name or user.get_username()


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
        return Dialer.objects.only("id", "dialer_name", "flow", "batch").filter(id=dialer_id).first()

    if dialer_name:
        return (
            Dialer.objects.only("id", "dialer_name", "flow", "batch")
            .filter(dialer_name__iexact=dialer_name)
            .order_by("id")
            .first()
        )

    return None


def _normalize_int(value, field_name, minimum=None, maximum=None):
    if value is None or value == "":
        return None

    try:
        normalized_value = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be an integer.")

    if minimum is not None and normalized_value < minimum:
        raise ValueError(f"{field_name} must be at least {minimum}.")

    if maximum is not None and normalized_value > maximum:
        raise ValueError(f"{field_name} must be at most {maximum}.")

    return normalized_value


def _normalize_optional_string(value, field_name, max_length):
    if value is None:
        return None

    normalized_value = str(value).strip()
    if len(normalized_value) > max_length:
        raise ValueError(f"{field_name} must be {max_length} characters or fewer.")

    return normalized_value


def _normalize_required_string(value, field_name, max_length):
    normalized_value = _normalize_optional_string(value, field_name, max_length)
    if not normalized_value:
        raise ValueError(f"{field_name} is required.")
    return normalized_value


def _normalize_recording_link(value):
    if value in (None, ""):
        return None

    normalized_value = str(value).strip()
    if len(normalized_value) > 1000:
        raise ValueError("call_recording_link must be 1000 characters or fewer.")

    try:
        url_validator(normalized_value)
    except ValidationError as exc:
        raise ValueError("call_recording_link must be a valid URL.") from exc

    return normalized_value


def _validate_call_log_payload(payload, *, require_status=False):
    normalized = {}

    if "call_id" in payload or require_status:
        normalized["call_id"] = _normalize_int(
            payload.get("call_id"),
            "call_id",
            minimum=1_000_000_000,
            maximum=9_999_999_999,
        )

    if require_status or "status" in payload:
        status_value = _normalize_required_string(payload.get("status"), "status", 255)
        normalized["status"] = status_value

    if "duration" in payload or require_status:
        duration_value = payload.get("duration", 0 if require_status else None)
        normalized["duration"] = _normalize_int(duration_value, "duration", minimum=0)

    if "state" in payload:
        normalized["state"] = _normalize_optional_string(payload.get("state"), "state", 255)

    if "call_recording_link" in payload or require_status:
        normalized["call_recording_link"] = _normalize_recording_link(
            payload.get("call_recording_link")
        )

    return normalized


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
        "call_recording_link": call_log.call_recording_link,
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


def _serialize_account_profile(client):
    user = client.user
    return {
        "first_name": user.first_name,
        "last_name": user.last_name,
        "display_name": _get_user_display_name(user),
        "username": user.get_username(),
        "email": user.email,
        "backup_email": client.backup_email,
        "client_name": client.client_name,
    }


def _normalize_email(value, field_name, *, required=False):
    normalized_value = _normalize_optional_string(value, field_name, 254)
    if required and not normalized_value:
        raise ValueError(f"{field_name} is required.")

    if not normalized_value:
        return ""

    normalized_value = normalized_value.lower()

    try:
        validate_email(normalized_value)
    except ValidationError as exc:
        raise ValueError(f"{field_name} must be a valid email address.") from exc

    return normalized_value

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
                "display_name": _get_user_display_name(user),
                "email": user.email,
            },
        }
    )


@require_POST
def logout_view(request):
    logout(request)
    return _json_response({"message": "Logout successful."})


@ensure_csrf_cookie
@require_GET
def check_auth_view(request):
    user = request.user

    if not user.is_authenticated:
        response = _json_response({"is_authenticated": False}, status=401)
        get_token(request)
        return response

    response = _json_response(
        {
            "is_authenticated": True,
            "user": {
                "id": user.id,
                "username": user.get_username(),
                "display_name": _get_user_display_name(user),
                "email": user.email,
            },
        }
    )
    get_token(request)
    return response


@require_http_methods(["GET", "PATCH"])
def account_profile_view(request):
    client, error_response = _get_authenticated_client(request)
    if error_response:
        return error_response

    if request.method == "GET":
        return _json_response({"profile": _serialize_account_profile(client)})

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    user = client.user
    User = get_user_model()
    current_password = payload.get("current_password") or ""

    try:
        first_name = _normalize_optional_string(payload.get("first_name"), "first_name", 150)
        last_name = _normalize_optional_string(payload.get("last_name"), "last_name", 150)
        email = _normalize_email(payload.get("email"), "email", required=True)
        backup_email = _normalize_email(payload.get("backup_email"), "backup_email")
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    if not current_password:
        return _json_error("Current password is required to save changes.", status=400)

    if not user.check_password(current_password):
        return _json_error("Current password is incorrect.", status=400)

    email_exists = (
        User.objects.filter(email__iexact=email)
        .exclude(pk=user.pk)
        .exists()
    )
    if email_exists:
        return _json_error("This email is already in use.", status=409)

    user.first_name = first_name or ""
    user.last_name = last_name or ""
    user.email = email
    user.save(update_fields=["first_name", "last_name", "email"])

    client.backup_email = backup_email
    client.save(update_fields=["backup_email"])

    return _json_response(
        {
            "message": "Account details updated successfully.",
            "profile": _serialize_account_profile(client),
        }
    )


@require_POST
def account_password_verify_view(request):
    client, error_response = _get_authenticated_client(request)
    if error_response:
        return error_response

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    current_password = payload.get("current_password") or ""
    if not current_password:
        return _json_error("Current password is required.", status=400)

    if not client.user.check_password(current_password):
        return _json_error("Current password is incorrect.", status=400)

    return _json_response({"message": "Current password verified."})


@require_POST
def account_password_view(request):
    client, error_response = _get_authenticated_client(request)
    if error_response:
        return error_response

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    confirm_password = payload.get("confirm_password") or ""

    if not current_password or not new_password or not confirm_password:
        return _json_error("All password fields are required.", status=400)

    if not client.user.check_password(current_password):
        return _json_error("Current password is incorrect.", status=400)

    if new_password != confirm_password:
        return _json_error("New password and confirmation do not match.", status=400)

    if len(new_password) < 8:
        return _json_error("New password must be at least 8 characters long.", status=400)

    if new_password == current_password:
        return _json_error("New password must be different from the current password.", status=400)

    client.user.set_password(new_password)
    client.user.save(update_fields=["password"])
    login(request, client.user)

    return _json_response({"message": "Password updated successfully."})


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
        normalized_fields = _validate_call_log_payload(payload, require_status=True)
        resolved_call_id = normalized_fields["call_id"]
        resolved_state = normalized_fields.get("state")
        if resolved_state is None:
            resolved_state = _derive_state_from_call_id(resolved_call_id)

        call_log = CallLog.objects.create(
            call_id=resolved_call_id,
            dialer=dialer,
            status=normalized_fields["status"],
            state=resolved_state,
            duration=normalized_fields["duration"],
            call_recording_link=normalized_fields.get("call_recording_link"),
        )
    except ValueError as exc:
        return _json_error(str(exc), status=400)

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
        CallLog.objects.select_related("dialer")
        .filter(call_uuid=call_uuid)
        .first()
    )
    if call_log is None:
        return _json_error("No call log found for the provided call_uuid.", status=404)

    try:
        normalized_fields = _validate_call_log_payload(payload, require_status=False)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    update_fields = []

    if "dialer_id" in payload or "dialer_name" in payload:
        dialer = _resolve_dialer(payload)
        if dialer is None:
            return _json_error("A valid dialer_id or dialer_name is required.")
        call_log.dialer = dialer
        update_fields.append("dialer")

    if "call_id" in normalized_fields:
        call_log.call_id = normalized_fields["call_id"]
        update_fields.append("call_id")

    if "status" in normalized_fields:
        call_log.status = normalized_fields["status"]
        update_fields.append("status")

    if "duration" in normalized_fields:
        call_log.duration = normalized_fields["duration"]
        update_fields.append("duration")

    if "call_recording_link" in normalized_fields:
        call_log.call_recording_link = normalized_fields["call_recording_link"]
        update_fields.append("call_recording_link")

    if "state" in normalized_fields:
        call_log.state = normalized_fields["state"]
        update_fields.append("state")
    elif "call_id" in normalized_fields:
        call_log.state = _derive_state_from_call_id(call_log.call_id)
        update_fields.append("state")

    if update_fields:
        call_log.save(update_fields=update_fields)

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
    table_selected_statuses = [
        status.strip()
        for status in request.GET.getlist("table_status")
        if status and status.strip()
    ]
    date_from = request.GET.get("date_from")
    date_to = request.GET.get("date_to")
    page = request.GET.get("page", "1")
    page_size = request.GET.get("page_size", "10")

    try:
        start_at = _normalize_datetime_param(date_from)
        end_at = _normalize_datetime_param(date_to)
        page_number = int(page)
        page_size_number = int(page_size)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    if page_number < 1:
        return _json_error("page must be a positive integer.", status=400)

    if page_size_number < 1 or page_size_number > 100:
        return _json_error("page_size must be between 1 and 100.", status=400)

    if start_at is None and end_at is None:
        start_at, end_at = _get_today_range()

    if start_at and end_at and start_at > end_at:
        return _json_error("The from date must be earlier than the to date.", status=400)

    filtered_logs = CallLog.objects.filter(
        dialer__client=client,
        dialer__active=True,
    )

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
    table_logs = filtered_logs
    if table_selected_statuses:
        table_logs = table_logs.filter(status__in=table_selected_statuses)

    duration_summary = filtered_logs.aggregate(
        avg_duration=Avg("duration"),
        total_duration=Sum("duration"),
    )
    status_summary_rows = list(
        filtered_logs.values("status")
        .annotate(count=Count("id"))
        .order_by("-count", "status")
    )
    status_matrix_rows = list(
        filtered_logs.values("dialer__id", "dialer__dialer_name", "status")
        .annotate(count=Count("id"))
        .order_by("dialer__dialer_name", "status")
    )
    table_total_count = table_logs.count()
    total_pages = max((table_total_count + page_size_number - 1) // page_size_number, 1)
    effective_page = min(page_number, total_pages)
    offset = (effective_page - 1) * page_size_number
    paginated_logs = list(
        table_logs.select_related("dialer")
        .order_by("-created_at", "-id")[offset : offset + page_size_number]
    )
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

    matrix_statuses = [
        row["status"] or "unknown"
        for row in status_summary_rows
    ]
    status_matrix_lookup = {}
    for row in status_matrix_rows:
        dialer_id = row["dialer__id"]
        dialer_name = row["dialer__dialer_name"]
        status_name = row["status"] or "unknown"
        count = row["count"]

        if dialer_id not in status_matrix_lookup:
            status_matrix_lookup[dialer_id] = {
                "dialer_id": dialer_id,
                "dialer_name": dialer_name,
                "total_calls": 0,
                "status_counts": {},
            }

        dialer_row = status_matrix_lookup[dialer_id]
        dialer_row["total_calls"] += count
        dialer_row["status_counts"][status_name] = count

    status_matrix = []
    for dialer_row in status_matrix_lookup.values():
        total_calls_for_row = dialer_row["total_calls"]
        status_matrix.append(
            {
                "dialer_id": dialer_row["dialer_id"],
                "dialer_name": dialer_row["dialer_name"],
                "total_calls": total_calls_for_row,
                "status_percentages": {
                    status_name: {
                        "count": dialer_row["status_counts"].get(status_name, 0),
                        "percentage": (
                            dialer_row["status_counts"].get(status_name, 0) / total_calls_for_row * 100
                        )
                        if total_calls_for_row
                        else 0,
                    }
                    for status_name in matrix_statuses
                },
            }
        )

    status_matrix.sort(key=lambda row: row["dialer_name"].lower())

    return _json_response(
        {
            "dialers": active_dialers,
            "filters": {
                "dialer_id": normalized_dialer_id,
                "dialer_name": selected_dialer.dialer_name if selected_dialer else "All",
                "table_statuses": table_selected_statuses,
                "date_from": start_at.isoformat() if start_at else None,
                "date_to": end_at.isoformat() if end_at else None,
            },
            "results": {
                "total_count": total_count,
                "records": [_serialize_call_log(call_log) for call_log in paginated_logs],
                "pagination": {
                    "page": effective_page,
                    "page_size": page_size_number,
                    "total_pages": total_pages,
                    "total_records": table_total_count,
                },
                "chart_records": [
                    {
                        "created_at": timezone.localtime(record["created_at"]).isoformat(),
                        "status": record["status"] or "unknown",
                    }
                    for record in chart_records
                ],
                "stats_summary": {
                    "total_calls": total_count,
                    "avg_duration": float(duration_summary["avg_duration"] or 0),
                    "total_duration": int(duration_summary["total_duration"] or 0),
                    "status_counts": [
                        {
                            "status": row["status"] or "unknown",
                            "count": row["count"],
                            "percentage": (row["count"] / total_count * 100)
                            if total_count
                            else 0,
                        }
                        for row in status_summary_rows
                    ],
                },
                "status_matrix": {
                    "statuses": matrix_statuses,
                    "rows": status_matrix,
                },
                "flow_breakdown": flow_breakdown,
            },
        }
    )


@require_GET
def call_log_search_view(request):
    client, error_response = _get_authenticated_client(request)
    if error_response:
        return error_response

    raw_call_id = (request.GET.get("call_id") or "").strip()
    if not raw_call_id:
        return _json_error("call_id is required.", status=400)

    try:
        normalized_call_id = _normalize_int(
            raw_call_id,
            "call_id",
            minimum=1_000_000_000,
            maximum=9_999_999_999,
        )
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    matched_logs = list(
        CallLog.objects.select_related("dialer")
        .filter(
            call_id=normalized_call_id,
            dialer__client=client,
        )
        .order_by("-created_at", "-id")
    )

    return _json_response(
        {
            "call_id": normalized_call_id,
            "exists": bool(matched_logs),
            "count": len(matched_logs),
            "records": [_serialize_call_log(call_log) for call_log in matched_logs],
        }
    )
