"""climatePrep compute engine (FastAPI).

Mirrors the WSC ffa-service structure. Stateless POST/GET, JSON in/out, no auth
and no business DB writes — pure compute behind the swappable §3.5 contract.
The Next.js Node layer owns auth, CRUD, and persistence.

Run locally:  npm run engine:dev   (uvicorn app.main:app --port 8000)
"""

from __future__ import annotations

import logging
import os
import platform

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from core_engine import engine_version
except ModuleNotFoundError:  # pragma: no cover - fallback if core-engine not installed
    def engine_version() -> str:
        return "0.0.0"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="climatePrep Compute Engine", version=engine_version())

allowed_origins = [o for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o]
if not allowed_origins:
    allowed_origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

from .pfa_routes import router as pfa_router  # noqa: E402
from .qc_routes import router as qc_router  # noqa: E402

app.include_router(qc_router)
app.include_router(pfa_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/engine/ping")
def ping() -> dict:
    """M0 liveness + version proof consumed by the Next.js proxy."""
    return {
        "ok": True,
        "service": "climateprep-engine",
        "engineVersion": engine_version(),
        "python": platform.python_version(),
    }
