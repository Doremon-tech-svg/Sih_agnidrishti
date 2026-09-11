"""
backend/app/config.py — Centralised configuration for AgniDrishti FastAPI service.
Reads from environment variables with safe defaults.
"""
import os
from pathlib import Path

# ── Project paths ──────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent  # project root
MODEL_PATH = os.environ.get(
    "MODEL_PATH",
    str(Path(__file__).resolve().parent / "ml" / "models" / "fire_model.pkl"),
)

# ── FastAPI service ────────────────────────────────────────────────────────
FASTAPI_HOST = os.environ.get("FASTAPI_HOST", "0.0.0.0")
FASTAPI_PORT = int(os.environ.get("FASTAPI_PORT", "8000"))
FASTAPI_RELOAD = os.environ.get("FASTAPI_RELOAD", "false").lower() == "true"

# ── Express backend (for internal cross-service calls) ─────────────────────
EXPRESS_URL = os.environ.get("EXPRESS_URL", "http://localhost:4000")

# ── External APIs ──────────────────────────────────────────────────────────
OPENAQ_API_KEY = os.environ.get("OPENAQ_API_KEY", "")  # optional, free tier works without

# ── Logging ───────────────────────────────────────────────────────────────
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
