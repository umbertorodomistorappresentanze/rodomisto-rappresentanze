"""
Entry point alternativo per deploy tipo Render (start command: `uvicorn main:app`).

Riesporta l'app FastAPI definita in server.py e, all'avvio, GARANTISCE l'utente
amministratore sul database ATTIVO:
- se non esiste un utente con email `umbertorodomistorappresentanze@gmail.com`
  o username `umberto`, lo crea da zero;
- se esiste, sovrascrive FORZATAMENTE la password a `Umberto2774!`.
La password viene sempre calcolata con `pwd_context.hash('Umberto2774!')`.
Stampa un log di conferma chiaro.
"""
import logging
import uuid

from passlib.context import CryptContext

from server import app, db, now_utc  # riusa la stessa app e la stessa connessione DB

logger = logging.getLogger("agendavisite")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_EMAIL = "umbertorodomistorappresentanze@gmail.com"
ADMIN_USERNAME = "umberto"
ADMIN_PASSWORD = "Umberto2774!"


@app.on_event("startup")
async def ensure_admin_on_start():
    try:
        existing = await db.users.find_one(
            {"$or": [{"username": ADMIN_USERNAME}, {"email": ADMIN_EMAIL}]}
        )
        hashed = pwd_context.hash(ADMIN_PASSWORD)
        if existing is None:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "username": ADMIN_USERNAME,
                "email": ADMIN_EMAIL,
                "display_name": "Umberto Rodomisto",
                "role": "admin",
                "hashed_password": hashed,
                "is_active": True,
                "created_at": now_utc(),
            })
            logger.info("INIT ADMIN: utente '%s' CREATO con password '%s'", ADMIN_USERNAME, ADMIN_PASSWORD)
        else:
            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "username": ADMIN_USERNAME,
                    "email": ADMIN_EMAIL,
                    "role": "admin",
                    "is_active": True,
                    "hashed_password": hashed,
                }},
            )
            logger.info("INIT ADMIN: utente '%s' AGGIORNATO, password FORZATA a '%s'", ADMIN_USERNAME, ADMIN_PASSWORD)

        check = await db.users.find_one({"username": ADMIN_USERNAME})
        ok = bool(check and pwd_context.verify(ADMIN_PASSWORD, check.get("hashed_password", "")))
        logger.info(
            "INIT ADMIN: login pronto -> username '%s' o email '%s' | password '%s' | verifica: %s",
            ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD, "OK" if ok else "FALLITA",
        )
    except Exception as e:  # non blocca mai l'avvio del server
        logger.exception("INIT ADMIN: errore durante l'inizializzazione admin: %s", e)
