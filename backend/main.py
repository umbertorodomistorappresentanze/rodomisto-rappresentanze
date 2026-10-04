"""
Entry point alternativo per deploy tipo Render (start command: `uvicorn main:app`).

Riesporta semplicemente l'app FastAPI definita in server.py.
NB: l'ADMIN SEED che sovrascriveva la password all'avvio è stato RIMOSSO
(richiesta esplicita). Le credenziali vivono solo nel database.
"""
from server import app  # noqa: F401  (riesporta l'app FastAPI)
