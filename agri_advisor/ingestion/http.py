"""Shared HTTP session with retries for the public APIs."""
from __future__ import annotations

import time

import requests

from .. import config

_session: requests.Session | None = None
RETRY_STATUS = {429, 500, 502, 503, 504}


def session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers["User-Agent"] = config.HTTP_USER_AGENT
    return _session


def get(url: str, params=None, retries: int = 2, timeout: float | None = None) -> requests.Response:
    for attempt in range(retries + 1):
        try:
            r = session().get(url, params=params, timeout=timeout or config.HTTP_TIMEOUT)
            if r.status_code in RETRY_STATUS and attempt < retries:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return r
        except (requests.ConnectionError, requests.Timeout):
            if attempt == retries:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")
