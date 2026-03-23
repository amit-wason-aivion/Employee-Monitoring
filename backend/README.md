# Backend API

## Setup

1) (Optional) Create and activate a virtual environment.
2) Install dependencies:
   pip install -r requirements.txt
3) Configure authentication in `backend/.env`:
   SECRET_KEY=your_shared_secret
   API_KEY=abc123
   MAX_CLOCK_SKEW_SECONDS=60
4) Run the server:
   python app.py

The API will be available at http://localhost:5000

## Notes

- CORS is enabled for local development.
- In-memory logs are capped at 1000 entries.
- Incoming activity is printed to stdout for debugging.
- If `SECRET_KEY` is set, the server requires `X-Timestamp` + `X-Signature` HMAC auth.
- If `SECRET_KEY` is not set, the server falls back to `Authorization: <API_KEY>`.

## Endpoints

- POST /activity
  Headers with HMAC mode: `X-Timestamp: <unix-seconds>`, `X-Signature: <sha256-hmac>`
  Headers with fallback mode: `Authorization: <API_KEY>`
  Body JSON: {"agent_id":"...","username":"...","hostname":"...","active_window":"..."}
- GET /activities
