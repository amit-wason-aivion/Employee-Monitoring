from datetime import datetime
import hashlib
import hmac
import json
import os
import time
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv


load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv("API_KEY", "")
SECRET_KEY = os.getenv("SECRET_KEY", "")
MAX_CLOCK_SKEW_SECONDS = int(os.getenv("MAX_CLOCK_SKEW_SECONDS", "60"))

# In-memory store for activity logs.
MAX_LOGS = 1000
_activities = []


def canonical_payload(payload: dict) -> str:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def verify_hmac_signature(payload: dict, timestamp: int, signature: str) -> bool:
    if not SECRET_KEY or not signature:
        return False
    message = canonical_payload(payload) + str(timestamp)
    expected = hmac.new(
        SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def authorize_request(payload: dict):
    auth_header = request.headers.get("Authorization", "")
    timestamp_header = request.headers.get("X-Timestamp", "")
    signature = request.headers.get("X-Signature", "")

    if SECRET_KEY and timestamp_header and signature:
        try:
            timestamp = int(timestamp_header)
        except (TypeError, ValueError):
            print("AUTH FAIL: invalid timestamp", {"timestamp": timestamp_header, "headers": dict(request.headers)})
            return jsonify({"error": "Invalid timestamp"}), 401

        if abs(time.time() - timestamp) > MAX_CLOCK_SKEW_SECONDS:
            if API_KEY and auth_header == API_KEY:
                return None
            print("AUTH FAIL: expired request", {"timestamp": timestamp, "headers": dict(request.headers)})
            return jsonify({"error": "Request expired"}), 401

        if not verify_hmac_signature(payload, timestamp, signature):
            print(
                "AUTH FAIL: invalid signature",
                {
                    "timestamp": timestamp,
                    "authorization_present": bool(auth_header),
                    "signature_prefix": signature[:12],
                    "payload": payload,
                },
            )
            return jsonify({"error": "Invalid signature"}), 401

        return None

    if API_KEY and auth_header == API_KEY:
        return None

    if SECRET_KEY:
        print(
            "AUTH FAIL: missing hmac headers and api key fallback did not match",
            {
                "authorization_present": bool(auth_header),
                "timestamp_present": bool(timestamp_header),
                "signature_present": bool(signature),
            },
        )
        return jsonify({"error": "Missing or invalid authentication"}), 401

    if not API_KEY:
        print("AUTH FAIL: no authentication configured")
        return jsonify({"error": "No authentication configured"}), 500

    print(
        "AUTH FAIL: unauthorized api key",
        {
            "authorization_present": bool(auth_header),
            "authorization_prefix": auth_header[:8],
        },
    )
    return jsonify({"error": "Unauthorized"}), 401


@app.post("/activity")
def post_activity():
    data = request.get_json(silent=True) or {}
    auth_error = authorize_request(data)
    if auth_error is not None:
        return auth_error

    agent_id = data.get("agent_id")
    username = data.get("username")
    hostname = data.get("hostname")
    active_window = data.get("active_window")

    if not agent_id or not username or not hostname or not active_window:
        return (
            jsonify(
                {
                    "error": "agent_id, username, hostname, and active_window are required",
                }
            ),
            400,
        )

    entry = {
        "agent_id": agent_id,
        "username": username,
        "hostname": hostname,
        "active_window": active_window,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    _activities.append(entry)
    if len(_activities) > MAX_LOGS:
        _activities.pop(0)

    print("Received activity:", entry)

    return jsonify({"status": "ok"}), 200


@app.get("/activities")
def get_activities():
    # Return newest first.
    return jsonify(list(reversed(_activities)))


if __name__ == "__main__":
    # For local dev only. Use a production WSGI server in real deployments.
    app.run(host="0.0.0.0", port=5000, debug=True)
