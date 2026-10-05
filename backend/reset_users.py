"""
Reset/seed degli utenti admin su MongoDB.

Cancella gli utenti 'umberto' e 'andrea' (per username O email) e li ricrea
da zero con password cifrate bcrypt (stesso schema di frontend/api/index.py).

USO (es. su Atlas di produzione):
  MONGO_URL="mongodb+srv://...." DB_NAME="route-manager-126" \
      python backend/reset_users.py

Legge MONGO_URL e DB_NAME dalle variabili d'ambiente. Nessun valore hardcoded.
"""
import asyncio
import os
import uuid

import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient


def hash_pw(pw: str) -> str:
    # Identico a frontend/api/index.py (troncamento a 72 byte come bcrypt richiede)
    return bcrypt.hashpw(pw.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_pw(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode("utf-8")[:72], hashed.encode("utf-8"))


USERS = [
    {
        "username": "umberto",
        "email": "umbertorodomistorappresentanze@gmail.com",
        "display_name": "Umberto Rodomisto",
        "password": "Umberto2774!",
        "role": "admin",
    },
    {
        "username": "andrea",
        "email": "andreaazzarito.agente@gmail.com",
        "display_name": "Andrea Azzarito",
        "password": "Andrea1606!",
        "role": "agent",
    },
]


async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"DB: {db_name}")
    for u in USERS:
        uname = u["username"].strip().lower()
        email = u["email"].strip().lower()

        # Rimuove eventuali record esistenti (per username O email)
        res = await db.users.delete_many(
            {"$or": [{"username": uname}, {"email": email}]}
        )
        print(f"  [{uname}] rimossi {res.deleted_count} record esistenti")

        doc = {
            "id": str(uuid.uuid4()),
            "username": uname,
            "email": email,
            "display_name": u["display_name"],
            "role": u["role"],
            "is_active": True,
            "hashed_password": hash_pw(u["password"]),
        }
        await db.users.insert_one(doc)

        # Verifica immediata dell'hash
        saved = await db.users.find_one({"username": uname})
        ok = bool(saved) and verify_pw(u["password"], saved["hashed_password"])
        print(
            f"  [{uname}] creato (role={u['role']}, email={email}) "
            f"-> verifica password: {'OK' if ok else 'FALLITA'}"
        )

    total = await db.users.count_documents({})
    print(f"Totale utenti nel DB: {total}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
