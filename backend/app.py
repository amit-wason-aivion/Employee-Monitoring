from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import Json
from psycopg2 import sql


load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv("API_KEY", "")
SECRET_KEY = os.getenv("SECRET_KEY", "")
MAX_CLOCK_SKEW_SECONDS = int(os.getenv("MAX_CLOCK_SKEW_SECONDS", "60"))
DATABASE_URL = os.getenv("DATABASE_URL", "")
DB_NAME = os.getenv("DB_NAME", "employee-monitoring")
DATABASE_ADMIN_URL = os.getenv("DATABASE_ADMIN_URL", "")
DATA_RETENTION_DAYS = int(os.getenv("DATA_RETENTION_DAYS", "60"))
PURGE_INTERVAL_SECONDS = int(os.getenv("PURGE_INTERVAL_SECONDS", "3600"))

# In-memory store for activity logs.
MAX_LOGS = 1000
_activities = []
_last_purge_at = 0.0



def _build_db_url(base_url: str, db_name: str) -> str:
    parsed = urlparse(base_url)
    return urlunparse(parsed._replace(path=f"/{db_name}"))


def ensure_database_exists():
    if not DATABASE_URL or not DB_NAME:
        return
    # Try connecting to the target DB; if it works, we're done.
    try:
        conn = psycopg2.connect(_build_db_url(DATABASE_URL, DB_NAME))
        conn.close()
        return
    except Exception:
        pass

    admin_url = DATABASE_ADMIN_URL or _build_db_url(DATABASE_URL, "postgres")
    conn = psycopg2.connect(admin_url)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
            exists = cur.fetchone()
            if not exists:
                # Create DB with safe identifier handling (supports hyphens)
                cur.execute(sql.SQL("CREATE DATABASE {}" ).format(sql.Identifier(DB_NAME)))
                conn2 = psycopg2.connect(_build_db_url(DATABASE_URL, DB_NAME))
                try:
                    with conn2:
                        create_activity_table(conn2)
                finally:
                    conn2.close()
    finally:
        conn.close()

def get_db_connection():
    if not DATABASE_URL:
        return None
    ensure_database_exists()
    return psycopg2.connect(_build_db_url(DATABASE_URL, DB_NAME))

def create_activity_table(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_activities (
                id BIGSERIAL PRIMARY KEY,
                received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                agent_id TEXT NOT NULL,
                username TEXT NOT NULL,
                hostname TEXT NOT NULL,
                active_window TEXT NOT NULL,
                idle_seconds INTEGER,
                is_idle BOOLEAN,
                department TEXT,
                role TEXT,
                location TEXT,
                payload JSONB NOT NULL,
                signature TEXT,
                timestamp_header TEXT,
                request_ip TEXT
            )
            """
        )
        cur.execute("ALTER TABLE agent_activities ADD COLUMN IF NOT EXISTS idle_seconds INTEGER")
        cur.execute("ALTER TABLE agent_activities ADD COLUMN IF NOT EXISTS is_idle BOOLEAN")
        cur.execute("ALTER TABLE agent_activities ADD COLUMN IF NOT EXISTS department TEXT")
        cur.execute("ALTER TABLE agent_activities ADD COLUMN IF NOT EXISTS role TEXT")
        cur.execute("ALTER TABLE agent_activities ADD COLUMN IF NOT EXISTS location TEXT")


def ensure_activity_table():
    conn = get_db_connection()
    if conn is None:
        return
    try:
        with conn:
            create_activity_table(conn)
    finally:
        conn.close()


def maybe_purge_db():
    if not DATABASE_URL or DATA_RETENTION_DAYS <= 0:
        return
    global _last_purge_at
    now = time.time()
    if PURGE_INTERVAL_SECONDS > 0 and (now - _last_purge_at) < PURGE_INTERVAL_SECONDS:
        return
    _last_purge_at = now
    conn = get_db_connection()
    if conn is None:
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM agent_activities
                    WHERE received_at < NOW() - (%s * INTERVAL '1 day')
                    """,
                    (DATA_RETENTION_DAYS,),
                )
    finally:
        conn.close()



def store_activity_db(entry: dict, payload: dict):
    conn = get_db_connection()
    if conn is None:
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO agent_activities (
                        agent_id,
                        username,
                        hostname,
                        active_window,
                        idle_seconds,
                        is_idle,
                        department,
                        role,
                        location,
                        payload,
                        signature,
                        timestamp_header,
                        request_ip
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        entry["agent_id"],
                        entry["username"],
                        entry["hostname"],
                        entry["active_window"],
                        entry.get("idle_seconds"),
                        entry.get("is_idle"),
                        entry.get("department"),
                        entry.get("role"),
                        entry.get("location"),
                        Json(payload),
                        request.headers.get("X-Signature"),
                        request.headers.get("X-Timestamp"),
                        request.headers.get("X-Forwarded-For") or request.remote_addr,
                    ),
                )
    finally:
        conn.close()


def fetch_activities_db(limit: int = 200):
    conn = get_db_connection()
    if conn is None:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    agent_id,
                    username,
                    hostname,
                    active_window,
                    received_at,
                    idle_seconds,
                    is_idle,
                    department,
                    role,
                    location
                FROM agent_activities
                ORDER BY received_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
            return [
                {
                    "agent_id": row[0],
                    "username": row[1],
                    "hostname": row[2],
                    "active_window": row[3],
                    "timestamp": row[4].isoformat(),
                    "idle_seconds": row[5],
                    "is_idle": row[6],
                    "department": row[7],
                    "role": row[8],
                    "location": row[9],
                }
                for row in rows
            ]
    finally:
        conn.close()


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
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    _activities.append(entry)
    if len(_activities) > MAX_LOGS:
        _activities.pop(0)

    if DATA_RETENTION_DAYS > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=DATA_RETENTION_DAYS)
        _activities[:] = [item for item in _activities if datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00")).astimezone(timezone.utc) >= cutoff]

    if DATABASE_URL:
        ensure_activity_table()
        try:
            maybe_purge_db()
            store_activity_db(entry, data)
        except Exception as exc:
            print("DB ERROR: failed to store activity", {"error": str(exc)})

    print("Received activity:", entry)

    return jsonify({"status": "ok"}), 200


@app.get("/activities")
def get_activities():
    if DATABASE_URL:
        ensure_activity_table()
        try:
            maybe_purge_db()
            records = fetch_activities_db()
            if records is not None:
                return jsonify(records)
        except Exception as exc:
            print("DB ERROR: failed to fetch activities", {"error": str(exc)})

    # Return newest first.
    return jsonify(list(reversed(_activities)))


if __name__ == "__main__":
    # For local dev only. Use a production WSGI server in real deployments.
    app.run(host="0.0.0.0", port=5000, debug=True)
