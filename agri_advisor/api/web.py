"""Production app: the API under /api plus the built web app (frontend/dist) on one origin.

Run: uvicorn agri_advisor.api.web:app   (after `npm run build` in frontend/)
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from .. import config
from .server import app as api

DIST = config.ROOT / "frontend" / "dist"

app = FastAPI(title="Agri Advisory Assistant (web)", docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api", api)


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    # Real files (JS, CSS, images) are served as-is; any other path is a client-side route, so it gets index.html.
    f = (DIST / path).resolve()
    if path and f.is_file() and f.is_relative_to(DIST.resolve()):
        return FileResponse(f)
    return FileResponse(DIST / "index.html")
