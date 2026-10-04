"""
PONTE alternativo (start command stile Render: `uvicorn main:app`).
Riesporta l'app FastAPI reale definita in `frontend/api/index.py`.
Nessun ADMIN SEED: le credenziali vivono solo nel database.
"""
from server import app  # noqa: F401
