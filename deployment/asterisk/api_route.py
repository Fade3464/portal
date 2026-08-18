#!/usr/bin/env python3
import json
import sys
import urllib.request
import urllib.error


def read_agi_env():
    while True:
        line = sys.stdin.readline()
        if not line or line in ("\n", "\r\n"):
            break


def agi_cmd(cmd):
    sys.stdout.write(cmd + "\n")
    sys.stdout.flush()
    return sys.stdin.readline()


def set_var(name, value):
    value = "" if value is None else str(value)
    value = value.replace("\\", "\\\\").replace('"', '\\"')
    agi_cmd(f'SET VARIABLE {name} "{value}"')


def post_json(url, token, payload, timeout=8):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace").strip()
        data = json.loads(raw) if raw else {}
        return resp.getcode(), data


def normalize_call_id(call_id):
    call_id = (call_id or "").strip()
    cleaned = "".join(ch for ch in call_id if ch.isdigit())
    if cleaned:
        try:
            return int(cleaned)
        except Exception:
            return cleaned
    return call_id


def fail(status, reason):
    set_var("LOOKUP_OK", "0")
    set_var("API_STATUS", status)
    set_var("API_REASON", reason)


def main():
    read_agi_env()

    set_var("LOOKUP_OK", "0")
    set_var("API_STATUS", "init")
    set_var("API_REASON", "")
    set_var("CALL_UUID", "")
    set_var("CALL_FLOW", "")
    set_var("CALL_BATCH", "")
    set_var("ROUTE_PROJECT", "")
    set_var("ROUTE_XFEREXTEN", "")
    set_var("TARGET_SERVER_IP", "")
    set_var("TARGET_SIP_USER", "")
    set_var("TARGET_SIP_PORT", "")

    call_id = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    dialer_name = sys.argv[2].strip() if len(sys.argv) > 2 else ""
    calllog_url = sys.argv[3].strip() if len(sys.argv) > 3 else ""
    route_url = sys.argv[4].strip() if len(sys.argv) > 4 else ""
    api_token = sys.argv[5].strip() if len(sys.argv) > 5 else ""
    default_sip_user = sys.argv[6].strip() if len(sys.argv) > 6 else "911"
    default_sip_port = sys.argv[7].strip() if len(sys.argv) > 7 else "5060"

    if not call_id:
        fail("bad_input", "missing call_id")
        return

    if not dialer_name:
        fail("bad_input", "missing dialer_name")
        return

    if not calllog_url:
        fail("bad_input", "missing calllog_url")
        return

    if not route_url:
        fail("bad_input", "missing route_url")
        return

    try:
        calllog_payload = {
            "call_id": normalize_call_id(call_id),
            "dialer_name": dialer_name,
            "status": "live",
        }

        status_code, calllog_resp = post_json(calllog_url, api_token, calllog_payload)

        if status_code not in (200, 201):
            fail("calllog_http_error", f"http_{status_code}")
            return

        call_uuid = ""
        call_flow = ""
        call_batch = ""

        if isinstance(calllog_resp.get("call_log"), dict):
            call_log = calllog_resp["call_log"]
            call_uuid = str(call_log.get("call_uuid", "")).strip()
            call_flow = str(call_log.get("flow", "")).strip()
            call_batch = str(call_log.get("batch", "")).strip()

        if not call_uuid:
            call_uuid = str(calllog_resp.get("call_uuid", "")).strip()
        if not call_flow:
            call_flow = str(calllog_resp.get("flow", "")).strip()
        if not call_batch:
            call_batch = str(calllog_resp.get("batch", "")).strip()

        if not call_uuid:
            fail("calllog_bad_response", f"missing call_uuid raw={json.dumps(calllog_resp)}")
            return

        route_payload = {
            "dialer_name": dialer_name,
        }

        status_code, route_resp = post_json(route_url, api_token, route_payload)

        route_ip = str(route_resp.get("route_ip", "")).strip()
        route_project = str(route_resp.get("project", "")).strip()
        route_xferexten = str(route_resp.get("xferexten", "")).strip()

        if status_code != 200 or not route_ip:
            fail("route_lookup_failed", f"raw={json.dumps(route_resp)}")
            return

        set_var("LOOKUP_OK", "1")
        set_var("API_STATUS", "ok")
        set_var("API_REASON", "")
        set_var("CALL_UUID", call_uuid)
        set_var("CALL_FLOW", call_flow)
        set_var("CALL_BATCH", call_batch)
        set_var("ROUTE_PROJECT", route_project)
        set_var("ROUTE_XFEREXTEN", route_xferexten)
        set_var("TARGET_SERVER_IP", route_ip)
        set_var("TARGET_SIP_USER", default_sip_user)
        set_var("TARGET_SIP_PORT", default_sip_port)

    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        fail("http_error", f"{e.code} {body}")

    except urllib.error.URLError as e:
        fail("url_error", str(e.reason))

    except Exception as e:
        fail("exception", repr(e))


if __name__ == "__main__":
    main()
