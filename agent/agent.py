import getpass
import hashlib
import hmac
import json
import os
import shutil
import ctypes
from ctypes import wintypes
import socket
import subprocess
import sys
import time
import uuid
import winreg
from pathlib import Path
from typing import Dict, List

import requests
import win32gui
from dotenv import load_dotenv


APP_NAME = "EMSAgent"
VERSION = "1.0.0"
RUNNING_DIR = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
DOTENV_PATH = RUNNING_DIR / ".env"
BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", RUNNING_DIR)) if getattr(sys, "frozen", False) else RUNNING_DIR
BUNDLED_DOTENV_DEFAULTS_PATH = BUNDLE_DIR / ".env.defaults"
INSTALL_DIR = Path(os.getenv("LOCALAPPDATA", str(RUNNING_DIR))) / APP_NAME
INSTALLED_EXE_PATH = INSTALL_DIR / "agent.exe"
CURRENT_EXECUTABLE = Path(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))
RUN_KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE_NAME = APP_NAME
LOG_PATH = INSTALL_DIR / "agent.log"
INSTALLED_FLAG_PATH = INSTALL_DIR / "installed.flag"
DETACHED_FLAGS = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS

SERVER_URL = "http://192.168.1.22:5000/activity"
POLL_INTERVAL = 5
HEARTBEAT_INTERVAL = 60
IDLE_THRESHOLD_SECONDS = 120
API_KEY = ""
SECRET_KEY = ""
AGENT_ID = str(uuid.getnode())
QUEUE_PATH = Path("failed_queue.jsonl")


def load_environment(override: bool) -> None:
    if DOTENV_PATH.exists():
        load_dotenv(dotenv_path=DOTENV_PATH, override=override)
    elif BUNDLED_DOTENV_DEFAULTS_PATH.exists():
        load_dotenv(dotenv_path=BUNDLED_DOTENV_DEFAULTS_PATH, override=override)
    load_dotenv(override=override)


def log(message: str) -> None:
    try:
        INSTALL_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with LOG_PATH.open("a", encoding="utf-8") as log_file:
            log_file.write(f"[{timestamp}] {message}\n")
    except OSError:
        pass


def resolve_queue_path() -> Path:
    if QUEUE_PATH.is_absolute():
        return QUEUE_PATH
    return RUNNING_DIR / QUEUE_PATH


def reload_config() -> None:
    global SERVER_URL, POLL_INTERVAL, HEARTBEAT_INTERVAL, API_KEY, SECRET_KEY, AGENT_ID, QUEUE_PATH, QUEUE_FILE
    load_environment(override=True)
    SERVER_URL = os.getenv("SERVER_URL", "http://192.168.1.22:5000/activity")
    POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))
    HEARTBEAT_INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL", "60"))
    global IDLE_THRESHOLD_SECONDS
    IDLE_THRESHOLD_SECONDS = int(os.getenv("IDLE_THRESHOLD_SECONDS", "120"))
    API_KEY = os.getenv("API_KEY", "")
    SECRET_KEY = os.getenv("SECRET_KEY", "")
    AGENT_ID = os.getenv("AGENT_ID") or str(uuid.getnode())
    QUEUE_PATH = Path(os.getenv("QUEUE_PATH", "failed_queue.jsonl"))
    QUEUE_FILE = resolve_queue_path()
    log(f"Loaded env from: {DOTENV_PATH} (exists={DOTENV_PATH.exists()})")
    log(f"Effective SERVER_URL: {SERVER_URL}")


load_environment(override=False)
QUEUE_FILE = resolve_queue_path()


def is_frozen_executable() -> bool:
    return getattr(sys, "frozen", False)


def is_running_from_install_path() -> bool:
    if not is_frozen_executable():
        return False
    try:
        return CURRENT_EXECUTABLE.resolve() == INSTALLED_EXE_PATH.resolve()
    except OSError:
        return False


def safe_copy(source: Path, destination: Path) -> None:
    temp_destination = destination.with_suffix(destination.suffix + ".tmp")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, temp_destination)
    os.replace(temp_destination, destination)


def copy_env_if_missing(source: Path, destination: Path) -> None:
    if not source.exists() or destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def write_default_env_if_missing(destination: Path) -> None:
    if destination.exists() or not BUNDLED_DOTENV_DEFAULTS_PATH.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(BUNDLED_DOTENV_DEFAULTS_PATH.read_text(encoding="utf-8"), encoding="utf-8")


def register_startup(executable_path: Path) -> None:
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, RUN_KEY_PATH) as key:
        winreg.SetValueEx(key, RUN_VALUE_NAME, 0, winreg.REG_SZ, f'"{os.path.abspath(str(executable_path))}"')


def write_installed_flag() -> None:
    try:
        INSTALLED_FLAG_PATH.write_text(VERSION, encoding="utf-8")
    except OSError as exc:
        log(f"Failed to write installed flag: {exc}")


def launch_installed_copy() -> None:
    subprocess.Popen(
        [str(INSTALLED_EXE_PATH)],
        cwd=str(INSTALL_DIR),
        close_fds=True,
        creationflags=DETACHED_FLAGS,
    )


def install_agent() -> None:
    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    current_exe = CURRENT_EXECUTABLE.resolve()
    installed_exe = INSTALLED_EXE_PATH.resolve()

    if current_exe == installed_exe:
        write_default_env_if_missing(DOTENV_PATH)
        register_startup(installed_exe)
        write_installed_flag()
        log(f"Startup already installed for version {VERSION} at {installed_exe}")
        return

    log(f"Installing version {VERSION} from {current_exe} to {installed_exe}")
    safe_copy(current_exe, installed_exe)
    copy_env_if_missing(DOTENV_PATH, INSTALL_DIR / ".env")
    write_default_env_if_missing(INSTALL_DIR / ".env")
    register_startup(installed_exe)
    write_installed_flag()
    log(f"Installed executable at {installed_exe}")
    launch_installed_copy()
    log("Relaunched installed copy")
    sys.exit(0)


def ensure_installed_startup() -> None:
    if not is_frozen_executable():
        return
    if is_running_from_install_path():
        write_default_env_if_missing(DOTENV_PATH)
        register_startup(INSTALLED_EXE_PATH)
        if not INSTALLED_FLAG_PATH.exists():
            write_installed_flag()
        return

    try:
        install_agent()
    except Exception as exc:
        log(f"Install failed: {exc}")


def canonical_payload(payload: Dict[str, str]) -> str:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def generate_signature(payload: Dict[str, str], timestamp: int) -> str:
    if not SECRET_KEY:
        return ""
    message = canonical_payload(payload) + str(timestamp)
    return hmac.new(SECRET_KEY.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def build_auth_headers(payload: Dict[str, str]) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if API_KEY:
        headers["Authorization"] = API_KEY
    if SECRET_KEY:
        timestamp = int(time.time())
        signature = generate_signature(payload, timestamp)
        headers["X-Timestamp"] = str(timestamp)
        headers["X-Signature"] = signature
    return headers


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]


def get_idle_seconds() -> int:
    try:
        lii = LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(lii)
        if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)) == 0:
            return 0
        millis = ctypes.windll.kernel32.GetTickCount() - lii.dwTime
        return int(millis / 1000)
    except Exception:
        return 0


def get_active_window() -> str:
    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return "Unknown"
        title = win32gui.GetWindowText(hwnd) or ""
        return title if title else "Unknown"
    except Exception:
        return "Unknown"


def get_system_info() -> Dict[str, str]:
    return {
        "agent_id": AGENT_ID,
        "username": getpass.getuser(),
        "hostname": socket.gethostname(),
        "active_window": get_active_window(),
    }


def send_data(payload: Dict[str, str]) -> bool:
    try:
        headers = build_auth_headers(payload)
        response = requests.post(SERVER_URL, json=payload, headers=headers, timeout=5)
        if response.status_code == 200:
            return True
        print("[agent] Server returned:", response.status_code, response.text)
        log(f"Server returned {response.status_code}: {response.text}")
        return False
    except requests.RequestException as exc:
        print("[agent] Network error:", exc)
        log(f"Network error: {exc}")
        return False


def load_queue() -> List[Dict[str, str]]:
    if not QUEUE_FILE.exists():
        return []

    queue: List[Dict[str, str]] = []
    try:
        for line in QUEUE_FILE.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict):
                queue.append(item)
    except OSError as exc:
        print("[agent] Failed to read queue file:", exc)
        log(f"Failed to read queue file: {exc}")
    return queue


def persist_queue(queue: List[Dict[str, str]]) -> None:
    try:
        tmp_path = QUEUE_FILE.with_suffix(".tmp")
        lines = [json.dumps(item) for item in queue]
        tmp_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
        tmp_path.replace(QUEUE_FILE)
    except OSError as exc:
        print("[agent] Failed to write queue file:", exc)
        log(f"Failed to write queue file: {exc}")


def flush_queue(queue: List[Dict[str, str]]) -> None:
    while queue:
        if send_data(queue[0]):
            queue.pop(0)
            persist_queue(queue)
        else:
            break


def run_loop() -> None:
    ensure_installed_startup()
    reload_config()
    log(f"Starting agent loop for version {VERSION}. Posting to {SERVER_URL}")
    print("[agent] Starting agent loop. Posting to:", SERVER_URL)
    last_window = None
    last_sent_time = 0.0
    queue = load_queue()
    if queue:
        print(f"[agent] Loaded {len(queue)} queued item(s).")
        log(f"Loaded {len(queue)} queued item(s)")

    while True:
        if queue:
            flush_queue(queue)

        current_window = get_active_window()
        now = time.time()

        should_send = (
            current_window != last_window
            or (now - last_sent_time) > HEARTBEAT_INTERVAL
        )

        if should_send:
            payload = {
                "agent_id": AGENT_ID,
                "username": getpass.getuser(),
                "hostname": socket.gethostname(),
                "active_window": current_window,
            }
            print("[agent] Sending:", payload)
            if send_data(payload):
                last_window = current_window
                last_sent_time = now
            else:
                queue.append(payload)
                persist_queue(queue)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run_loop()
