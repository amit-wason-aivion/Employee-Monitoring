# Agent

## Overview

The agent runs on an employee laptop and periodically sends system activity
(agent ID, username, hostname, active window title) to the backend API.

## Setup

1) (Optional) Create and activate a virtual environment.
2) Install dependencies:
   pip install -r requirements.txt

## Run

python agent.py

When you package it as `agent.exe`, the first launch can install itself for the
current Windows user. The packaged agent will copy itself to
`%LOCALAPPDATA%\EMSAgent\agent.exe`, preserve an existing installed `.env`,
register that installed copy in Windows startup, relaunch from there, and exit
the original file. After that, the startup flow no longer depends on the
original downloaded `.exe`.

## Environment Variables

Set these in `agent/.env` (or your system environment):

SERVER_URL=<http://localhost:5000/activity>
POLL_INTERVAL=5
HEARTBEAT_INTERVAL=60
API_KEY=abc123
SECRET_KEY=your_shared_secret
QUEUE_PATH=failed_queue.jsonl

### Meaning

- SERVER_URL: backend endpoint the agent posts to.
- POLL_INTERVAL: how often the agent checks the active window (seconds).
- HEARTBEAT_INTERVAL: forced update interval even if the window does not change (seconds).
- API_KEY: fallback shared secret for legacy authorization mode.
- SECRET_KEY: HMAC key used to sign requests when secure mode is enabled.
- QUEUE_PATH: local file used to persist failed events (JSON Lines).

### Example (multi-device setup)

SERVER_URL=<http://192.168.31.159:5000/activity>

## Notes

- Tested on Windows (uses `pywin32` for active window detection).
- Failed posts are queued locally and retried on the next loop iteration.
- Startup registration uses `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- Install/runtime logs are written to `%LOCALAPPDATA%\EMSAgent\agent.log`.
- Current packaged agent version is defined in code as `1.0.0`.
- If `SECRET_KEY` is set, the agent sends `X-Timestamp` and `X-Signature` headers.
