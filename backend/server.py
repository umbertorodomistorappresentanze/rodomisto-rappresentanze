"""
PONTE per l'anteprima Emergent (supervisor: `uvicorn server:app`).

Il codice REALE del backend vive ora in `frontend/api/index.py` (fonte unica,
così da poter pubblicare Frontend + Backend in un unico progetto Vercel).
Questo file mette la cartella `frontend/api` nel path e riesporta l'app FastAPI,
così l'ambiente di anteprima continua a funzionare senza duplicare il codice.
"""
import os
import sys

_API_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "api"))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from index import *  # noqa: F401,F403  (riesporta funzioni/costanti per i test)
from index import app  # noqa: F401  (ASGI app usata da uvicorn server:app)
