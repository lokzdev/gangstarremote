"""Configuracao central Hydra — VPS (PostgreSQL + URLs publicas)."""
from __future__ import annotations

import os
from pathlib import Path

_SERVER_DIR = Path(__file__).resolve().parent

DEFAULT_PUBLIC_URL = "http://151.243.137.239:7771"
DEFAULT_DATABASE_URL = "postgresql://postgres:1111@localhost:5432/rat_db"


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def bootstrap() -> None:
    """Carrega .env / .env.vps e define defaults de producao."""
    _load_env_file(_SERVER_DIR / ".env")
    _load_env_file(_SERVER_DIR / ".env.vps")
    os.environ.setdefault("DATABASE_URL", DEFAULT_DATABASE_URL)
    os.environ.setdefault("SERVER_URL", DEFAULT_PUBLIC_URL)
    os.environ.setdefault("HYDRA_PROFILE", "vps")


bootstrap()


def public_base_url() -> str:
    return os.environ.get("SERVER_URL", DEFAULT_PUBLIC_URL).rstrip("/")


def public_http_url() -> str:
    url = public_base_url()
    if url.startswith("ws://"):
        return "http://" + url[5:].split("/")[0]
    if url.startswith("wss://"):
        return "https://" + url[6:].split("/")[0]
    return url


def public_ws_url(extra_query: str = "") -> str:
    raw = os.environ.get("SERVER_WS_URL", "").strip()
    if raw:
        base = raw.rstrip("/")
        if not base.endswith("/ws"):
            base += "/ws"
    else:
        http = public_http_url()
        if http.startswith("https://"):
            base = http.replace("https://", "wss://", 1) + "/ws"
        else:
            base = http.replace("http://", "ws://", 1) + "/ws"

    if extra_query:
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}{extra_query.lstrip('?')}"
    return base


def database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
