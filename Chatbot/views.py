import csv
import base64
from datetime import timedelta
import hashlib
import hmac
import json
import os
import random
import secrets
import struct
import time
import uuid
from functools import lru_cache
from urllib.parse import quote
from django.views.decorators.csrf import csrf_exempt

from django.conf import settings
from django.contrib.auth import (
    authenticate,
    get_user_model,
    login,
    logout,
    update_session_auth_hash,
)
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core import signing
from django.core.validators import URLValidator, validate_email
from django.db import IntegrityError, connection, transaction
from django.db.models import Count, Sum
from django.db.models.functions import TruncDay, TruncHour, TruncMinute, TruncMonth
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .models import (
    BlacklistedNumbers,
    CallLog,
    CallLogMinuteRollup,
    Client,
    ClientTOTPDevice,
    Dialer,
    LoginRateLimit,
    RESTAPITOKENS,
)
from .api_token_cache import get_active_api_tokens, preload_active_api_tokens
from .dashboard_cache import build_dashboard_cache_key, bump_dashboard_cache_version
from .route_cache import get_dialer_route_map, preload_dialer_route_map
from .routing import select_weighted_call_assignment, select_weighted_route
from .rollups import (
    adjust_call_log_rollup,
    build_call_log_rollup_snapshot,
    increment_call_log_rollup,
)

AREA_CODES_CSV_PATH = settings.AREA_CODES_CSV_PATH
url_validator = URLValidator()
PASSWORD_RESET_SALT = "chatbot-forgot-password-v2"
TOTP_ISSUER = "Pulsar Portal"
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5
LOGIN_RATE_LIMIT_LOCKOUT_SECONDS = 3600
ACCOUNT_AUTH_RATE_LIMIT_ATTEMPTS = 5
ACCOUNT_AUTH_RATE_LIMIT_SECONDS = 900
MFA_CHALLENGE_TTL_SECONDS = 300
PASSWORD_RESET_TTL_SECONDS = 600
MFA_SESSION_KEY = "pending_mfa_authentication"
MAX_TOTP_DEVICES_PER_CLIENT = 10
DASHBOARD_TABLE_CACHE_TTL_SECONDS = 30
DASHBOARD_ANALYTICS_CACHE_TTL_SECONDS = 120
LIVE_DASHBOARD_ANALYTICS_CACHE_TTL_SECONDS = 5


def _get_user_display_name(user):
    full_name = f"{user.first_name} {user.last_name}".strip()
    return full_name or user.get_username()


def _json_error(message, status=400):
    return _json_response({"error": message}, status=status)


def _json_response(payload, status=200):
    return JsonResponse({"status_code": status, **payload}, status=status)


@require_GET
def health_view(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()

        health_cache_key = "application_health_check"
        cache.set(health_cache_key, "ok", timeout=10)
        if cache.get(health_cache_key) != "ok":
            raise RuntimeError("Cache health check failed.")
    except Exception:
        return _json_response({"status": "unavailable"}, status=503)

    return _json_response({"status": "ok"})


def _generate_totp_secret():
    return base64.b32encode(os.urandom(20)).decode("ascii").rstrip("=")


def _pad_base32_secret(secret):
    normalized_secret = (secret or "").strip().replace(" ", "").upper()
    padding_length = (-len(normalized_secret)) % 8
    return normalized_secret + ("=" * padding_length)


def _build_totp_uri(secret, account_name):
    label = quote(f"{TOTP_ISSUER}:{account_name}")
    issuer = quote(TOTP_ISSUER)
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&digits=6&period=30"


def _generate_totp_code(secret, counter):
    key = base64.b32decode(_pad_base32_secret(secret), casefold=True)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(binary % 1_000_000).zfill(6)


def _get_matching_totp_counter(secret, otp, *, window=1, at_time=None):
    normalized_otp = (otp or "").strip()
    if not normalized_otp.isdigit() or len(normalized_otp) != 6 or not secret:
        return None

    current_time = int(at_time or time.time())
    current_counter = current_time // 30

    for delta in range(-window, window + 1):
        if _generate_totp_code(secret, current_counter + delta) == normalized_otp:
            return current_counter + delta

    return None


def _verify_totp_code(secret, otp, *, window=1, at_time=None):
    return _get_matching_totp_counter(
        secret,
        otp,
        window=window,
        at_time=at_time,
    ) is not None


def _consume_totp_code(user_id, secret, otp, *, scope="authentication"):
    matched_counter = _get_matching_totp_counter(secret, otp)
    if matched_counter is None:
        return False

    secret_fingerprint = _auth_subject_digest(secret)[:16]
    replay_key = (
        f"totp-used:{scope}:{user_id}:{secret_fingerprint}:{matched_counter}"
    )
    return cache.add(replay_key, True, timeout=180)


def _get_enabled_totp_devices(client):
    if client is None:
        return []
    return list(client.authenticator_devices.filter(enabled=True).only("id", "secret"))


def _consume_client_totp_code(client, otp, *, scope="authentication"):
    if client is None:
        return False

    devices = _get_enabled_totp_devices(client)
    for device in devices:
        if _consume_totp_code(client.user_id, device.secret, otp, scope=scope):
            ClientTOTPDevice.objects.filter(pk=device.pk).update(last_used_at=timezone.now())
            return True

    if devices:
        return False

    return bool(
        client.recovery_totp_enabled
        and client.recovery_totp_secret
        and _consume_totp_code(
            client.user_id,
            client.recovery_totp_secret,
            otp,
            scope=scope,
        )
    )


def _sync_legacy_totp_fields(client):
    primary_device = (
        client.authenticator_devices.filter(enabled=True)
        .only("secret")
        .order_by("created_at", "id")
        .first()
    )
    secret = primary_device.secret if primary_device else ""
    enabled = primary_device is not None

    if (
        client.recovery_totp_secret != secret
        or client.recovery_totp_enabled != enabled
    ):
        client.recovery_totp_secret = secret
        client.recovery_totp_enabled = enabled
        client.save(update_fields=["recovery_totp_secret", "recovery_totp_enabled"])


def _auth_subject_digest(value):
    return hmac.new(
        str(settings.SECRET_KEY).encode("utf-8"),
        (value or "").strip().lower().encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _auth_throttle_key(purpose, subject, kind):
    return f"auth-throttle:{purpose}:{_auth_subject_digest(subject)}:{kind}"


def _is_auth_subject_locked(purpose, subject):
    if not subject:
        return False
    return bool(cache.get(_auth_throttle_key(purpose, subject, "locked")))


def _record_auth_subject_failure(purpose, subject):
    if not subject:
        return

    attempts_key = _auth_throttle_key(purpose, subject, "attempts")
    if cache.add(attempts_key, 1, timeout=ACCOUNT_AUTH_RATE_LIMIT_SECONDS):
        attempts = 1
    else:
        try:
            attempts = cache.incr(attempts_key)
        except ValueError:
            cache.set(attempts_key, 1, timeout=ACCOUNT_AUTH_RATE_LIMIT_SECONDS)
            attempts = 1

    if attempts >= ACCOUNT_AUTH_RATE_LIMIT_ATTEMPTS:
        cache.set(
            _auth_throttle_key(purpose, subject, "locked"),
            True,
            timeout=ACCOUNT_AUTH_RATE_LIMIT_SECONDS,
        )


def _clear_auth_subject_failures(purpose, subject):
    if not subject:
        return
    cache.delete_many(
        [
            _auth_throttle_key(purpose, subject, "attempts"),
            _auth_throttle_key(purpose, subject, "locked"),
        ]
    )


def _clear_mfa_challenge(request):
    request.session.pop(MFA_SESSION_KEY, None)


def _start_mfa_challenge(request, user):
    request.session.cycle_key()
    request.session[MFA_SESSION_KEY] = {
        "user_id": user.pk,
        "backend": getattr(
            user,
            "backend",
            "django.contrib.auth.backends.ModelBackend",
        ),
        "expires_at": int(time.time()) + MFA_CHALLENGE_TTL_SECONDS,
    }


def _read_mfa_challenge(request):
    challenge = request.session.get(MFA_SESSION_KEY)
    if not isinstance(challenge, dict):
        return None

    if int(challenge.get("expires_at") or 0) < int(time.time()):
        _clear_mfa_challenge(request)
        return None

    return challenge


def _serialize_authenticated_user(user):
    client = getattr(user, "client_profile", None)
    return {
        "id": user.id,
        "username": user.get_username(),
        "display_name": _get_user_display_name(user),
        "email": user.email,
        "mfa_enabled": _is_recovery_authenticator_enabled(client),
        "recovery_authenticator_enabled": _is_recovery_authenticator_enabled(client),
    }


def _create_password_reset_token(user_id, email):
    nonce = secrets.token_urlsafe(32)
    cache.set(
        f"password-reset:{_auth_subject_digest(nonce)}",
        user_id,
        timeout=PASSWORD_RESET_TTL_SECONDS,
    )
    payload = {"user_id": user_id, "email": email, "nonce": nonce}
    return signing.dumps(payload, salt=PASSWORD_RESET_SALT)


def _read_password_reset_token(token, *, max_age=PASSWORD_RESET_TTL_SECONDS):
    return signing.loads(token, salt=PASSWORD_RESET_SALT, max_age=max_age)


def _consume_password_reset_token(token_data):
    nonce = token_data.get("nonce") or ""
    if not nonce:
        return False

    nonce_key = f"password-reset:{_auth_subject_digest(nonce)}"
    expected_user_id = cache.get(nonce_key)
    if expected_user_id != token_data.get("user_id"):
        return False

    return bool(cache.delete(nonce_key))


def _validate_new_password(password, user):
    try:
        validate_password(password, user=user)
    except ValidationError as exc:
        raise ValueError(" ".join(exc.messages)) from exc


def _load_json_body(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON payload.")


def _get_client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    return (
        request.META.get("HTTP_X_REAL_IP")
        or request.META.get("REMOTE_ADDR")
        or ""
    ).strip()


def _get_login_rate_limit(ip_address):
    if not ip_address:
        return None

    return LoginRateLimit.objects.filter(ip_address=ip_address).first()


def _get_lockout_error(rate_limit):
    if not rate_limit or not rate_limit.locked_until:
        return None

    now = timezone.now()
    if rate_limit.locked_until <= now:
        if rate_limit.failed_attempts or rate_limit.last_failed_at or rate_limit.locked_until:
            rate_limit.failed_attempts = 0
            rate_limit.last_failed_at = None
            rate_limit.locked_until = None
            rate_limit.save(update_fields=["failed_attempts", "last_failed_at", "locked_until"])
        return None

    remaining_minutes = max(
        1,
        int((rate_limit.locked_until - now).total_seconds() // 60),
    )
    return _json_error(
        f"Too many failed login attempts. Try again in about {remaining_minutes} minutes.",
        status=429,
    )


def _record_failed_login_attempt(ip_address):
    if not ip_address:
        return None

    now = timezone.now()
    rate_limit, _ = LoginRateLimit.objects.get_or_create(ip_address=ip_address)

    if rate_limit.locked_until and rate_limit.locked_until <= now:
        rate_limit.failed_attempts = 0
        rate_limit.locked_until = None

    rate_limit.failed_attempts += 1
    rate_limit.last_failed_at = now

    if rate_limit.failed_attempts >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS:
        rate_limit.locked_until = now + timedelta(seconds=LOGIN_RATE_LIMIT_LOCKOUT_SECONDS)

    rate_limit.save(update_fields=["failed_attempts", "last_failed_at", "locked_until"])
    return rate_limit


def _clear_failed_login_attempts(ip_address):
    if not ip_address:
        return

    LoginRateLimit.objects.filter(ip_address=ip_address).update(
        failed_attempts=0,
        last_failed_at=None,
        locked_until=None,
    )


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

    active_tokens = get_active_api_tokens()
    token_exists = provided_token in active_tokens

    if not token_exists:
        preload_active_api_tokens()
        token_exists = provided_token in get_active_api_tokens()

    if not token_exists:
        return _json_error("Invalid API token.", status=401)

    return None


def _refresh_dialer_route_map():
    preload_dialer_route_map()
    return get_dialer_route_map()


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


def _parse_dialer_batch_values(raw_batch):
    if raw_batch in (None, ""):
        return []

    values = []
    for item in str(raw_batch).split(","):
        normalized = item.strip()
        if not normalized:
            continue

        try:
            values.append(int(normalized))
        except ValueError as exc:
            raise ValueError("Dialer batch must contain comma-separated integers.") from exc

    return values


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


def _build_call_recording_link(call_uuid):
    base_url = getattr(settings, "CALL_RECORDINGS_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        return None

    file_extension = (
        getattr(settings, "CALL_RECORDINGS_FILE_EXTENSION", "wav").strip().lstrip(".")
        or "wav"
    )
    return f"{base_url}/{call_uuid}.{file_extension}"


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

    if not require_status and "flow" in payload:
        normalized["flow"] = _normalize_optional_string(payload.get("flow"), "flow", 255)

    if not require_status and "batch" in payload:
        normalized["batch"] = _normalize_int(payload.get("batch"), "batch")

    if "call_recording_link" in payload or require_status:
        normalized["call_recording_link"] = _normalize_recording_link(
            payload.get("call_recording_link")
        )

    return normalized


def _get_call_log_flow_and_batch(dialer_id):
    weighted_assignment = select_weighted_call_assignment(dialer_id)
    if weighted_assignment is not None:
        return weighted_assignment

    with transaction.atomic():
        dialer = (
            Dialer.objects.select_for_update()
            .only("id", "flow", "batch", "batch_cursor")
            .get(id=dialer_id)
        )

        batch_values = _parse_dialer_batch_values(dialer.batch)
        selected_batch = batch_values[0] if batch_values else 0

        if batch_values:
            selected_index = dialer.batch_cursor % len(batch_values)
            selected_batch = batch_values[selected_index]
            dialer.batch_cursor = (dialer.batch_cursor + 1) % len(batch_values)
            dialer.save(update_fields=["batch_cursor"])

        return {
            "flow": dialer.flow or "",
            "batch": selected_batch,
        }


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
        "client_name": client.client_name,
        "recovery_authenticator_enabled": _is_recovery_authenticator_enabled(client),
        "authenticator_devices": [
            {
                "id": device.id,
                "name": device.name,
                "created_at": device.created_at.isoformat(),
                "last_used_at": (
                    device.last_used_at.isoformat() if device.last_used_at else None
                ),
            }
            for device in client.authenticator_devices.filter(enabled=True)
        ],
    }


def _is_recovery_authenticator_enabled(client):
    if client is None:
        return False
    if client.authenticator_devices.filter(enabled=True).exists():
        return True
    return bool(client.recovery_totp_enabled and client.recovery_totp_secret)


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


def _get_client_by_email(email):
    if not email:
        return None

    User = get_user_model()
    user = User.objects.filter(email__iexact=email).select_related("client_profile").first()
    if user is None:
        return None

    return getattr(user, "client_profile", None)


def _get_user_by_email(email):
    if not email:
        return None

    User = get_user_model()
    return User.objects.filter(email__iexact=email).select_related("client_profile").order_by("id").first()


@require_POST
def login_options_view(request):
    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    try:
        email = _normalize_email(payload.get("email"), "email", required=True)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    # Retained for rolling-deployment compatibility without exposing account state.
    return _json_response(
        {
            "authenticator_enabled": False,
            "password_fallback_enabled": True,
            "password_required": True,
        }
    )


@require_POST
def login_view(request):
    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    client_ip = _get_client_ip(request)
    rate_limit = _get_login_rate_limit(client_ip)
    lockout_error = _get_lockout_error(rate_limit)
    if lockout_error:
        return lockout_error

    password = payload.get("password") or ""
    otp = (payload.get("otp") or "").strip()

    if otp:
        challenge = _read_mfa_challenge(request)
        if challenge is None:
            _record_failed_login_attempt(client_ip)
            return _json_error("Invalid or expired verification code.", status=401)

        user_record = (
            get_user_model()
            .objects.select_related("client_profile")
            .filter(pk=challenge.get("user_id"), is_active=True)
            .first()
        )
        account_subject = user_record.email if user_record else str(challenge.get("user_id"))
        if _is_auth_subject_locked("login", account_subject):
            return _json_error("Too many authentication attempts. Try again later.", status=429)

        client = getattr(user_record, "client_profile", None) if user_record else None
        mfa_valid = bool(
            user_record
            and _is_recovery_authenticator_enabled(client)
            and _consume_client_totp_code(client, otp)
        )

        if not mfa_valid:
            _record_failed_login_attempt(client_ip)
            _record_auth_subject_failure("login", account_subject)
            return _json_error("Invalid or expired verification code.", status=401)

        backend = challenge.get("backend") or "django.contrib.auth.backends.ModelBackend"
        _clear_mfa_challenge(request)
        login(request, user_record, backend=backend)
        _clear_failed_login_attempts(client_ip)
        _clear_auth_subject_failures("login", account_subject)

        return _json_response(
            {
                "message": "Login successful.",
                "login_method": "password_mfa",
                "mfa_required": False,
                "user": _serialize_authenticated_user(user_record),
            }
        )

    _clear_mfa_challenge(request)

    try:
        email = _normalize_email(payload.get("email"), "email", required=True)
    except ValueError:
        return _json_error("Invalid email or password.", status=401)

    if not password or _is_auth_subject_locked("login", email):
        if _is_auth_subject_locked("login", email):
            return _json_error("Too many authentication attempts. Try again later.", status=429)
        return _json_error("Invalid email or password.", status=401)

    user_record = _get_user_by_email(email)
    username = user_record.get_username() if user_record else email

    user = authenticate(request, username=username, password=password)
    if user is None:
        _record_failed_login_attempt(client_ip)
        _record_auth_subject_failure("login", email)
        return _json_error("Invalid email or password.", status=401)

    client = getattr(user, "client_profile", None)
    if _is_recovery_authenticator_enabled(client):
        _start_mfa_challenge(request, user)
        return _json_response(
            {
                "message": "Enter the code from your authenticator app.",
                "mfa_required": True,
                "challenge_expires_in": MFA_CHALLENGE_TTL_SECONDS,
            }
        )

    login(request, user)
    _clear_failed_login_attempts(client_ip)
    _clear_auth_subject_failures("login", email)

    return _json_response(
        {
            "message": "Login successful.",
            "login_method": "password",
            "mfa_required": False,
            "user": _serialize_authenticated_user(user),
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


@ensure_csrf_cookie
@require_GET
def csrf_token_view(request):
    get_token(request)
    return _json_response({"message": "CSRF cookie set."})


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
def account_authenticator_setup_view(request):
    client, error_response = _get_authenticated_client(request)
    if error_response:
        return error_response

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    current_password = payload.get("current_password") or ""
    account_subject = client.user.email or str(client.user_id)
    if _is_auth_subject_locked("mfa-setup", account_subject):
        return _json_error("Too many verification attempts. Try again later.", status=429)

    if not current_password or not client.user.check_password(current_password):
        _record_auth_subject_failure("mfa-setup", account_subject)
        return _json_error("Current password is incorrect.", status=400)

    _clear_auth_subject_failures("mfa-setup", account_subject)

    try:
        device_name = _normalize_optional_string(
            payload.get("name"),
            "name",
            100,
        )
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    secret = _generate_totp_secret()
    try:
        with transaction.atomic():
            locked_client = Client.objects.select_for_update().get(pk=client.pk)
            enabled_count = locked_client.authenticator_devices.filter(enabled=True).count()
            if not device_name:
                device_name = f"Authenticator {enabled_count + 1}"

            if locked_client.authenticator_devices.filter(
                name__iexact=device_name,
                enabled=True,
            ).exists():
                return _json_error(
                    "An authenticator with this name already exists.",
                    status=409,
                )

            if enabled_count >= MAX_TOTP_DEVICES_PER_CLIENT:
                return _json_error(
                    f"A maximum of {MAX_TOTP_DEVICES_PER_CLIENT} authenticators is allowed.",
                    status=400,
                )

            # Keep setup state unambiguous and discard abandoned, unverified secrets.
            locked_client.authenticator_devices.filter(enabled=False).delete()
            device = ClientTOTPDevice.objects.create(
                client=locked_client,
                name=device_name,
                secret=secret,
            )
    except IntegrityError:
        return _json_error("An authenticator with this name already exists.", status=409)

    account_name = client.user.email or client.user.get_username()
    return _json_response(
        {
            "message": "Multi-factor authentication setup started.",
            "device_id": device.id,
            "device_name": device.name,
            "setup_key": secret,
            "otpauth_url": _build_totp_uri(
                secret,
                f"{account_name} ({device.name})",
            ),
        }
    )


@require_POST
def account_authenticator_verify_view(request):
    client, error_response = _get_authenticated_client(request)
    if error_response:
        return error_response

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    otp = payload.get("otp") or ""
    try:
        device_id = _normalize_int(payload.get("device_id"), "device_id", minimum=1)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    pending_devices = client.authenticator_devices.filter(enabled=False)
    if device_id is not None:
        pending_devices = pending_devices.filter(pk=device_id)
    device = pending_devices.order_by("-created_at", "-id").first()
    if device is None:
        return _json_error("Authenticator setup has not been started.", status=400)

    account_subject = client.user.email or str(client.user_id)
    if _is_auth_subject_locked("mfa-setup", account_subject):
        return _json_error("Too many verification attempts. Try again later.", status=429)

    if not _consume_totp_code(
        client.user_id,
        device.secret,
        otp,
        scope=f"setup-{device.id}",
    ):
        _record_auth_subject_failure("mfa-setup", account_subject)
        return _json_error("Invalid authenticator code.", status=400)

    device.enabled = True
    device.last_used_at = timezone.now()
    device.save(update_fields=["enabled", "last_used_at"])
    _sync_legacy_totp_fields(client)
    _clear_auth_subject_failures("mfa-setup", account_subject)

    return _json_response(
        {
            "message": "Authenticator added successfully.",
            "profile": _serialize_account_profile(client),
        }
    )


@require_http_methods(["DELETE"])
def account_authenticator_device_view(request, device_id):
    client, error_response = _get_authenticated_client(request)
    if error_response:
        return error_response

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    current_password = payload.get("current_password") or ""
    if not current_password or not client.user.check_password(current_password):
        return _json_error("Current password is incorrect.", status=400)

    device = client.authenticator_devices.filter(pk=device_id, enabled=True).first()
    if device is None:
        return _json_error("Authenticator not found.", status=404)

    device.delete()
    _sync_legacy_totp_fields(client)
    return _json_response(
        {
            "message": "Authenticator removed.",
            "profile": _serialize_account_profile(client),
        }
    )


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

    if new_password == current_password:
        return _json_error("New password must be different from the current password.", status=400)

    try:
        _validate_new_password(new_password, client.user)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    client.user.set_password(new_password)
    client.user.save(update_fields=["password"])
    update_session_auth_hash(request, client.user)

    return _json_response({"message": "Password updated successfully."})


@require_POST
def forgot_password_start_view(request):
    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    try:
        email = _normalize_email(payload.get("email"), "email", required=True)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    client_ip = _get_client_ip(request)
    if _is_auth_subject_locked("recovery", email) or _is_auth_subject_locked(
        "recovery-ip",
        client_ip,
    ):
        return _json_error("Too many recovery attempts. Try again later.", status=429)

    return _json_response(
        {
            "message": (
                "If this account is eligible for authenticator recovery, "
                "enter its current 6-digit code."
            ),
        }
    )


@require_POST
def forgot_password_verify_view(request):
    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    try:
        email = _normalize_email(payload.get("email"), "email", required=True)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    otp = payload.get("otp") or ""
    client_ip = _get_client_ip(request)
    if _is_auth_subject_locked("recovery", email) or _is_auth_subject_locked(
        "recovery-ip",
        client_ip,
    ):
        return _json_error("Too many recovery attempts. Try again later.", status=429)

    client = _get_client_by_email(email)
    recovery_valid = bool(
        client
        and _is_recovery_authenticator_enabled(client)
        and _consume_client_totp_code(client, otp)
    )
    if not recovery_valid:
        _record_auth_subject_failure("recovery", email)
        _record_auth_subject_failure("recovery-ip", client_ip)
        return _json_error(
            "The recovery request is invalid or expired.",
            status=400,
        )

    reset_token = _create_password_reset_token(client.user_id, client.user.email)
    _clear_auth_subject_failures("recovery", email)
    _clear_auth_subject_failures("recovery-ip", client_ip)
    return _json_response(
        {
            "message": "Authenticator code verified successfully.",
            "reset_token": reset_token,
        }
    )


@require_POST
def forgot_password_reset_view(request):
    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    reset_token = payload.get("reset_token") or ""
    new_password = payload.get("new_password") or ""
    confirm_password = payload.get("confirm_password") or ""

    if not reset_token:
        return _json_error("reset_token is required.", status=400)

    if not new_password or not confirm_password:
        return _json_error("Both password fields are required.", status=400)

    if new_password != confirm_password:
        return _json_error("New password and confirmation do not match.", status=400)

    try:
        token_data = _read_password_reset_token(reset_token)
    except signing.SignatureExpired:
        return _json_error("Invalid or expired reset token.", status=400)
    except signing.BadSignature:
        return _json_error("Invalid or expired reset token.", status=400)

    User = get_user_model()
    user = User.objects.filter(id=token_data.get("user_id"), email__iexact=token_data.get("email", "")).first()
    if user is None:
        return _json_error("Invalid or expired reset token.", status=400)

    client = getattr(user, "client_profile", None)
    if client is None or not _is_recovery_authenticator_enabled(client):
        return _json_error("Recovery authenticator is not configured for this account.", status=400)

    if user.check_password(new_password):
        return _json_error("New password must be different from the current password.", status=400)

    try:
        _validate_new_password(new_password, user)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    if not _consume_password_reset_token(token_data):
        return _json_error("Invalid or expired reset token.", status=400)

    user.set_password(new_password)
    user.save(update_fields=["password"])
    logout(request)
    _clear_auth_subject_failures("recovery", user.email)

    return _json_response({"message": "Password reset successful. You can now sign in."})


@require_GET
def preload_dialer_routes_view(request):
    token_error = _require_call_log_api_token(request)
    if token_error:
        return token_error

    route_map = _refresh_dialer_route_map()
    dialers = [
        {
            "dialer_name": details["dialer_name"],
            "route_ips": details["route_ips"],
        }
        for details in sorted(route_map.values(), key=lambda item: item["dialer_name"].lower())
    ]

    return _json_response(
        {
            "message": "Dialer routes preloaded successfully.",
            "dialers": dialers,
            "dialer_count": len(dialers),
        }
    )


@require_GET
def dialer_credentials_view(request):
    token_error = _require_call_log_api_token(request)
    if token_error:
        return token_error

    dialers = list(
        Dialer.objects.order_by("dialer_name", "id").values(
            "dialer_name",
            "api_user",
            "api_password",
            "agent_api_url",
            "non_agent_api_url",
        )
    )
    response = _json_response(
        {
            "dialer_count": len(dialers),
            "dialers": dialers,
        }
    )
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"
    return response


@csrf_exempt
@require_POST
def request_route_view(request):
    token_error = _require_call_log_api_token(request)
    if token_error:
        return token_error

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    dialer_name = (payload.get("dialer_name") or "").strip()
    if not dialer_name:
        return _json_error("dialer_name is required.", status=400)

    normalized_name = dialer_name.lower()
    route_map = get_dialer_route_map()
    dialer_details = route_map.get(normalized_name)

    if dialer_details is None:
        route_map = _refresh_dialer_route_map()
        dialer_details = route_map.get(normalized_name)

    if dialer_details is None:
        return _json_error("No dialer found for the provided dialer_name.", status=404)

    weighted_route = select_weighted_route(dialer_details["dialer_id"])
    if weighted_route is not None:
        selected_route_ip = weighted_route["route_ip"]
        selected_project = weighted_route["project"]
    else:
        route_ips = dialer_details["route_ips"]
        if not route_ips:
            return _json_error(
                "No route IPs are configured for the provided dialer_name.",
                status=404,
            )
        selected_route_ip = random.choice(route_ips)
        selected_project = dialer_details["project"]

    return _json_response(
        {
            "message": "Route IP fetched successfully.",
            "dialer_name": dialer_details["dialer_name"],
            "project": selected_project,
            "xferexten": dialer_details["xferexten"],
            "agent_api_url": dialer_details["agent_api_url"],
            "non_agent_api_url": dialer_details["non_agent_api_url"],
            "api_user": dialer_details["api_user"],
            "api_password": dialer_details["api_password"],
            "route_ip": selected_route_ip,
        }
    )


@csrf_exempt
@require_POST
def check_batchnflow_view(request):
    token_error = _require_call_log_api_token(request)
    if token_error:
        return token_error

    try:
        payload = _load_json_body(request)
    except ValueError as exc:
        return _json_error(str(exc))

    dialer_name = (payload.get("dialer_name") or "").strip()
    if not dialer_name:
        return _json_error("dialer_name is required.", status=400)

    normalized_name = dialer_name.lower()
    route_map = get_dialer_route_map()
    dialer_details = route_map.get(normalized_name)

    if dialer_details is None:
        route_map = _refresh_dialer_route_map()
        dialer_details = route_map.get(normalized_name)

    if dialer_details is None:
        return _json_error("No dialer found for the provided dialer_name.", status=404)

    weighted_assignment = select_weighted_call_assignment(dialer_details["dialer_id"])

    return _json_response(
        {
            "message": "Batch and flow fetched successfully.",
            "dialer_name": dialer_details["dialer_name"],
            "batch": (
                str(weighted_assignment["batch"])
                if weighted_assignment is not None
                else dialer_details["batch"]
            ),
            "flow": (
                weighted_assignment["flow"]
                if weighted_assignment is not None
                else dialer_details["flow"]
            ),
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
        normalized_fields = _validate_call_log_payload(payload, require_status=True)
        resolved_call_id = normalized_fields["call_id"]
        resolved_state = normalized_fields.get("state")
        if resolved_state is None:
            resolved_state = _derive_state_from_call_id(resolved_call_id)
        call_log_assignment = _get_call_log_flow_and_batch(dialer.id)
        recording_link = normalized_fields.get("call_recording_link")
        if not recording_link:
            generated_call_uuid = uuid.uuid4()
            generated_recording_link = _build_call_recording_link(generated_call_uuid)
        else:
            generated_call_uuid = None
            generated_recording_link = None

        call_log = CallLog.objects.create(
            **({"call_uuid": generated_call_uuid} if generated_call_uuid else {}),
            call_id=resolved_call_id,
            dialer=dialer,
            status=normalized_fields["status"],
            state=resolved_state,
            flow=call_log_assignment["flow"],
            batch=call_log_assignment["batch"],
            duration=normalized_fields["duration"],
            call_recording_link=recording_link or generated_recording_link,
        )
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    increment_call_log_rollup(call_log)
    bump_dashboard_cache_version(dialer.client_id)

    return _json_response(
        {
            "message": "Call log created successfully.",
            "call_log": _serialize_call_log(call_log),
        },
        status=201,
    )

from time import perf_counter
@csrf_exempt
@require_http_methods(["PATCH", "POST"])
def update_call_log_view(request, call_uuid):
    update_started_at = perf_counter()

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

    previous_rollup_snapshot = build_call_log_rollup_snapshot(call_log)
    original_client_id = call_log.dialer.client_id

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

    if "flow" in normalized_fields:
        call_log.flow = normalized_fields["flow"] or ""
        update_fields.append("flow")

    if "batch" in normalized_fields:
        call_log.batch = normalized_fields["batch"] or 0
        update_fields.append("batch")

    if "call_recording_link" in normalized_fields:
        call_log.call_recording_link = normalized_fields["call_recording_link"]
        update_fields.append("call_recording_link")
    elif not call_log.call_recording_link:
        generated_recording_link = _build_call_recording_link(call_log.call_uuid)
        if generated_recording_link:
            call_log.call_recording_link = generated_recording_link
            update_fields.append("call_recording_link")

    if "state" in normalized_fields:
        call_log.state = normalized_fields["state"]
        update_fields.append("state")
    elif "call_id" in normalized_fields:
        call_log.state = _derive_state_from_call_id(call_log.call_id)
        update_fields.append("state")

    if update_fields:
        call_log.save(update_fields=update_fields)

        current_rollup_snapshot = build_call_log_rollup_snapshot(call_log)
        adjust_call_log_rollup(previous_rollup_snapshot, current_rollup_snapshot)

    updated_client_id = call_log.dialer.client_id

    bump_dashboard_cache_version(original_client_id)
    if updated_client_id != original_client_id:
        bump_dashboard_cache_version(updated_client_id)

    update_time_seconds = perf_counter() - update_started_at

    return _json_response(
        {
            "message": "Call log updated successfully.",
            "update_time_seconds": round(update_time_seconds, 6),
            "update_time_ms": round(update_time_seconds * 1000, 2),
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
def _get_dashboard_scope(request):
    client, error_response = _get_authenticated_client(request)
    if error_response:
        return None, error_response

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
        return None, _json_error(str(exc), status=400)

    if start_at is None and end_at is None:
        start_at, end_at = _get_today_range()

    if start_at and end_at and start_at > end_at:
        return None, _json_error("The from date must be earlier than the to date.", status=400)

    active_dialer_lookup = {
        dialer["id"]: dialer["dialer_name"]
        for dialer in active_dialers
    }
    active_dialer_ids = list(active_dialer_lookup.keys())

    normalized_dialer_id = None
    selected_dialer = None
    if selected_dialer_id and selected_dialer_id.lower() != "all":
        try:
            normalized_dialer_id = int(selected_dialer_id)
        except ValueError:
            return None, _json_error("dialer_id must be an integer or 'all'.", status=400)

        selected_dialer_name = active_dialer_lookup.get(normalized_dialer_id)
        if selected_dialer_name is None:
            return None, _json_error("The selected dialer is not available for this client.", status=404)

        selected_dialer = {
            "id": normalized_dialer_id,
            "dialer_name": selected_dialer_name,
        }
        active_dialer_ids = [normalized_dialer_id]

    return {
        "client": client,
        "active_dialers": active_dialers,
        "active_dialer_lookup": active_dialer_lookup,
        "active_dialer_ids": active_dialer_ids,
        "normalized_dialer_id": normalized_dialer_id,
        "selected_dialer_name": selected_dialer["dialer_name"] if selected_dialer else "All",
        "start_at": start_at,
        "end_at": end_at,
    }, None


def _build_dashboard_filters_payload(scope, table_statuses=None):
    return {
        "dialer_id": scope["normalized_dialer_id"],
        "dialer_name": scope["selected_dialer_name"],
        "table_statuses": table_statuses or [],
        "date_from": scope["start_at"].isoformat() if scope["start_at"] else None,
        "date_to": scope["end_at"].isoformat() if scope["end_at"] else None,
    }


def _build_dashboard_base_queryset(scope):
    filtered_logs = CallLog.objects.filter(dialer_id__in=scope["active_dialer_ids"])

    if scope["start_at"]:
        filtered_logs = filtered_logs.filter(created_at__gte=scope["start_at"])

    if scope["end_at"]:
        filtered_logs = filtered_logs.filter(created_at__lte=scope["end_at"])

    return filtered_logs


def _build_dashboard_rollup_queryset(scope):
    filtered_rollups = CallLogMinuteRollup.objects.filter(
        client_id=scope["client"].id,
        dialer_id__in=scope["active_dialer_ids"],
    )

    if scope["start_at"]:
        filtered_rollups = filtered_rollups.filter(bucket_start__gte=scope["start_at"])

    if scope["end_at"]:
        filtered_rollups = filtered_rollups.filter(bucket_start__lte=scope["end_at"])

    return filtered_rollups


def _get_dashboard_analytics_cache_ttl(scope):
    now = timezone.now()
    start_at = scope["start_at"]
    end_at = scope["end_at"]

    if start_at is None or end_at is None:
        return LIVE_DASHBOARD_ANALYTICS_CACHE_TTL_SECONDS

    if start_at <= now <= end_at:
        return LIVE_DASHBOARD_ANALYTICS_CACHE_TTL_SECONDS

    if end_at >= now - timedelta(minutes=5):
        return LIVE_DASHBOARD_ANALYTICS_CACHE_TTL_SECONDS

    return DASHBOARD_ANALYTICS_CACHE_TTL_SECONDS


def _build_dashboard_status_chart(filtered_rollups, start_at, end_at):
    if start_at and end_at:
        span = end_at - start_at
    else:
        span = timedelta(days=1)

    if span <= timedelta(hours=6):
        bucket_trunc = TruncMinute
        bucket_label = "Time"
        label_format = "%I:%M %p"
    elif span <= timedelta(days=3):
        bucket_trunc = TruncHour
        bucket_label = "Time"
        label_format = "%b %d, %I:%M %p"
    elif span <= timedelta(days=120):
        bucket_trunc = TruncDay
        bucket_label = "Date"
        label_format = "%b %d"
    else:
        bucket_trunc = TruncMonth
        bucket_label = "Period"
        label_format = "%b %Y"

    chart_rows = list(
        filtered_rollups.annotate(bucket=bucket_trunc("bucket_start"))
        .values("bucket", "status")
        .annotate(count=Sum("call_count"))
        .order_by("bucket", "status")
    )

    if not chart_rows:
        return {
            "bucket_label": bucket_label,
            "statuses": [],
            "series": [],
        }

    status_totals = {}
    bucket_lookup = {}

    for row in chart_rows:
        bucket = row["bucket"]
        status = row["status"] or "unknown"
        count = row["count"]
        status_totals[status] = status_totals.get(status, 0) + count

        if bucket not in bucket_lookup:
            local_bucket = timezone.localtime(bucket)
            bucket_lookup[bucket] = {
                "bucket": local_bucket.isoformat(),
                "label": local_bucket.strftime(label_format),
            }

        bucket_lookup[bucket][status] = count

    statuses = [
        status
        for status, _ in sorted(
            status_totals.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]
    series = []
    for bucket in sorted(bucket_lookup.keys()):
        row = bucket_lookup[bucket]
        for status in statuses:
            row.setdefault(status, 0)
        series.append(row)

    return {
        "bucket_label": bucket_label,
        "statuses": statuses,
        "series": series,
    }


def _build_dashboard_status_chart_from_logs(filtered_logs, start_at, end_at):
    if start_at and end_at:
        span = end_at - start_at
    else:
        span = timedelta(days=1)

    if span <= timedelta(hours=6):
        bucket_trunc = TruncMinute
        bucket_label = "Time"
        label_format = "%I:%M %p"
    elif span <= timedelta(days=3):
        bucket_trunc = TruncHour
        bucket_label = "Time"
        label_format = "%b %d, %I:%M %p"
    elif span <= timedelta(days=120):
        bucket_trunc = TruncDay
        bucket_label = "Date"
        label_format = "%b %d"
    else:
        bucket_trunc = TruncMonth
        bucket_label = "Period"
        label_format = "%b %Y"

    chart_rows = list(
        filtered_logs.annotate(bucket=bucket_trunc("created_at"))
        .values("bucket", "status")
        .annotate(count=Count("id"))
        .order_by("bucket", "status")
    )

    if not chart_rows:
        return {
            "bucket_label": bucket_label,
            "statuses": [],
            "series": [],
        }

    status_totals = {}
    bucket_lookup = {}

    for row in chart_rows:
        bucket = row["bucket"]
        status = row["status"] or "unknown"
        count = row["count"] or 0

        status_totals[status] = status_totals.get(status, 0) + count

        if bucket not in bucket_lookup:
            local_bucket = timezone.localtime(bucket)
            bucket_lookup[bucket] = {
                "bucket": local_bucket.isoformat(),
                "label": local_bucket.strftime(label_format),
            }

        bucket_lookup[bucket][status] = count

    statuses = [
        status
        for status, _ in sorted(
            status_totals.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]

    series = []
    for bucket in sorted(bucket_lookup.keys()):
        row = bucket_lookup[bucket]
        for status in statuses:
            row.setdefault(status, 0)
        series.append(row)

    return {
        "bucket_label": bucket_label,
        "statuses": statuses,
        "series": series,
    }

@require_GET
def dashboard_filters_view(request):
    scope, error_response = _get_dashboard_scope(request)
    if error_response:
        return error_response

    table_selected_statuses = [
        status.strip()
        for status in request.GET.getlist("table_status")
        if status and status.strip()
    ]
    page = request.GET.get("page", "1")
    page_size = request.GET.get("page_size", "10")

    try:
        page_number = int(page)
        page_size_number = int(page_size)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    if page_number < 1:
        return _json_error("page must be a positive integer.", status=400)

    if page_size_number < 1 or page_size_number > 100:
        return _json_error("page_size must be between 1 and 100.", status=400)

    dashboard_cache_key = build_dashboard_cache_key(
        "dashboard_table",
        scope["client"].id,
        {
            "dialer_id": scope["normalized_dialer_id"],
            "table_statuses": sorted(table_selected_statuses),
            "date_from": scope["start_at"].isoformat() if scope["start_at"] else None,
            "date_to": scope["end_at"].isoformat() if scope["end_at"] else None,
            "page": page_number,
            "page_size": page_size_number,
        },
    )
    cached_dashboard_payload = cache.get(dashboard_cache_key)
    if cached_dashboard_payload is not None:
        return _json_response(cached_dashboard_payload)

    if not scope["active_dialer_ids"]:
        response_payload = {
            "dialers": scope["active_dialers"],
            "filters": _build_dashboard_filters_payload(scope, table_selected_statuses),
            "results": {
                "records": [],
                "pagination": {
                    "page": 1,
                    "page_size": page_size_number,
                    "total_pages": 1,
                    "total_records": 0,
                },
            },
        }
        cache.set(dashboard_cache_key, response_payload, DASHBOARD_TABLE_CACHE_TTL_SECONDS)
        return _json_response(response_payload)

    filtered_logs = _build_dashboard_base_queryset(scope)
    table_logs = filtered_logs
    if table_selected_statuses:
        table_logs = table_logs.filter(status__in=table_selected_statuses)

    table_total_count = table_logs.count()
    total_pages = max((table_total_count + page_size_number - 1) // page_size_number, 1)
    effective_page = min(page_number, total_pages)
    offset = (effective_page - 1) * page_size_number
    paginated_logs = list(
        table_logs.order_by("-created_at", "-id")
        .values(
            "call_uuid",
            "call_id",
            "dialer_id",
            "status",
            "state",
            "flow",
            "batch",
            "duration",
            "call_recording_link",
            "created_at",
        )[offset : offset + page_size_number]
    )

    response_payload = {
        "dialers": scope["active_dialers"],
        "filters": _build_dashboard_filters_payload(scope, table_selected_statuses),
        "results": {
            "records": [
                {
                    "call_uuid": str(call_log["call_uuid"]),
                    "call_id": call_log["call_id"],
                    "dialer_id": call_log["dialer_id"],
                    "dialer_name": scope["active_dialer_lookup"].get(call_log["dialer_id"], ""),
                    "status": call_log["status"],
                    "state": call_log["state"],
                    "flow": call_log["flow"],
                    "batch": call_log["batch"],
                    "duration": call_log["duration"],
                    "call_recording_link": call_log["call_recording_link"],
                    "created_at": call_log["created_at"].isoformat(),
                }
                for call_log in paginated_logs
            ],
            "pagination": {
                "page": effective_page,
                "page_size": page_size_number,
                "total_pages": total_pages,
                "total_records": table_total_count,
            },
        },
    }
    cache.set(dashboard_cache_key, response_payload, DASHBOARD_TABLE_CACHE_TTL_SECONDS)
    return _json_response(response_payload)


@require_GET
def dashboard_analytics_view(request):
    scope, error_response = _get_dashboard_scope(request)
    if error_response:
        return error_response

    analytics_cache_ttl = _get_dashboard_analytics_cache_ttl(scope)

    dashboard_cache_key = build_dashboard_cache_key(
        "dashboard_analytics",
        scope["client"].id,
        {
            "dialer_id": scope["normalized_dialer_id"],
            "date_from": scope["start_at"].isoformat() if scope["start_at"] else None,
            "date_to": scope["end_at"].isoformat() if scope["end_at"] else None,
        },
    )
    cached_dashboard_payload = cache.get(dashboard_cache_key)
    if cached_dashboard_payload is not None:
        return _json_response(cached_dashboard_payload)

    if not scope["active_dialer_ids"]:
        response_payload = {
            "filters": _build_dashboard_filters_payload(scope),
            "results": {
                "total_count": 0,
                "status_chart": {
                    "bucket_label": "Time",
                    "statuses": [],
                    "series": [],
                },
                "stats_summary": {
                    "total_calls": 0,
                    "avg_duration": 0.0,
                    "total_duration": 0,
                    "status_counts": [],
                },
                "status_matrix": {
                    "statuses": [],
                    "rows": [],
                },
                "playback_batch_performance": [],
                "flow_breakdown": [],
            },
        }
        cache.set(
            dashboard_cache_key,
            response_payload,
            analytics_cache_ttl,
        )
        return _json_response(response_payload)

    filtered_logs = _build_dashboard_base_queryset(scope)

    overall_summary = filtered_logs.aggregate(
        total_count=Count("id"),
        total_duration=Sum("duration"),
    )

    total_count = int(overall_summary["total_count"] or 0)
    total_duration = int(overall_summary["total_duration"] or 0)
    avg_duration = (total_duration / total_count) if total_count else 0

    status_summary_rows = list(
        filtered_logs.values("status").annotate(count=Count("id"))
    )

    status_matrix_rows = list(
        filtered_logs.values("dialer_id", "status").annotate(count=Count("id"))
    )

    playback_batch_rows = list(
        filtered_logs.filter(status__iexact="RAXFER")
        .values("dialer_id", "flow", "batch")
        .annotate(count=Count("id"))
        .order_by("dialer_id", "flow", "batch")
    )

    playback_sample_rows = filtered_logs.filter(
        status__iexact="RAXFER",
    ).values(
        "dialer_id",
        "flow",
        "batch",
        "call_uuid",
        "call_id",
        "call_recording_link",
    )

    breakdown_rows = list(
        filtered_logs.values("dialer_id", "flow", "batch").annotate(count=Count("id"))
    )

    status_summary_rows = [
        row for row in status_summary_rows if row["count"]
    ]
    status_matrix_rows = [
        row for row in status_matrix_rows if row["count"]
    ]
    playback_batch_rows = [
        row for row in playback_batch_rows if row["count"]
    ]
    breakdown_rows = [
        row for row in breakdown_rows if row["count"]
    ]

    status_summary_rows.sort(key=lambda row: (-row["count"], row["status"] or ""))
    status_matrix_rows.sort(
        key=lambda row: (
            scope["active_dialer_lookup"].get(row["dialer_id"], "").lower(),
            row["status"] or "",
        )
    )
    breakdown_rows.sort(
        key=lambda row: (
            scope["active_dialer_lookup"].get(row["dialer_id"], "").lower(),
            row["flow"] or "",
            row["batch"],
        )
    )

    playback_breakdown_lookup = {}
    playback_sample_lookup = {}

    for row in playback_sample_rows.iterator():
        sample_key = (
            row["dialer_id"],
            row["flow"] or "unknown",
            row["batch"],
        )

        seen_count = playback_sample_lookup.get(sample_key, {}).get("seen_count", 0) + 1
        should_replace = sample_key not in playback_sample_lookup or random.randint(1, seen_count) == 1

        if should_replace:
            recording_link = row["call_recording_link"] or _build_call_recording_link(
                row["call_uuid"]
            )
            playback_sample_lookup[sample_key] = {
                "seen_count": seen_count,
                "sample_recording": {
                    "call_uuid": str(row["call_uuid"]),
                    "call_id": row["call_id"],
                    "call_recording_link": recording_link,
                },
            }
        else:
            playback_sample_lookup[sample_key]["seen_count"] = seen_count

    for row in playback_batch_rows:
        dialer_id = row["dialer_id"]
        dialer_name = scope["active_dialer_lookup"].get(dialer_id, "")
        flow_name = row["flow"] or "unknown"
        batch_value = row["batch"]
        count = row["count"]

        if dialer_id not in playback_breakdown_lookup:
            playback_breakdown_lookup[dialer_id] = {
                "dialer_id": dialer_id,
                "dialer_name": dialer_name,
                "total_count": 0,
                "flows": {},
            }

        dialer_group = playback_breakdown_lookup[dialer_id]
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
                "sample_recording": playback_sample_lookup.get(
                    (dialer_id, flow_name, batch_value),
                    {},
                ).get("sample_recording"),
            }
        )

    playback_batch_performance = []
    for dialer_group in playback_breakdown_lookup.values():
        playback_batch_performance.append(
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

    dialer_lookup = {}
    for row in breakdown_rows:
        dialer_id = row["dialer_id"]
        dialer_name = scope["active_dialer_lookup"].get(dialer_id, "")
        flow_name = row["flow"] or "unknown"
        batch_value = row["batch"]
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

    matrix_statuses = [row["status"] or "unknown" for row in status_summary_rows]
    status_matrix_lookup = {}
    for row in status_matrix_rows:
        dialer_id = row["dialer_id"]
        dialer_name = scope["active_dialer_lookup"].get(dialer_id, "")
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
    response_payload = {
        "filters": _build_dashboard_filters_payload(scope),
        "results": {
            "total_count": total_count,
            "status_chart": _build_dashboard_status_chart_from_logs(
                filtered_logs,
                scope["start_at"],
                scope["end_at"],
            ),
            "stats_summary": {
                "total_calls": total_count,
                "avg_duration": float(avg_duration),
                "total_duration": total_duration,
                "status_counts": [
                    {
                        "status": row["status"] or "unknown",
                        "count": row["count"],
                        "percentage": (row["count"] / total_count * 100) if total_count else 0,
                    }
                    for row in status_summary_rows
                ],
            },
            "status_matrix": {
                "statuses": matrix_statuses,
                "rows": status_matrix,
            },
            "playback_batch_performance": playback_batch_performance,
            "flow_breakdown": flow_breakdown,
        },
    }
    cache.set(
        dashboard_cache_key,
        response_payload,
        analytics_cache_ttl,
    )
    return _json_response(response_payload)


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
