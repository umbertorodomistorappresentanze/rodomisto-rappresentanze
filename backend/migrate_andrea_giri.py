"""
Migrazione UNA TANTUM: giri per-agente per Andrea.
- Imposta agent='umberto' su tutti i giri esistenti (Umberto invariato).
- Crea i giri di Andrea (owner 'andrea') e sposta i SUOI clienti:
    Guardavalle(andrea) -> 'Lamezia Terme → San Vito'
    Falerna(andrea)     -> 'Lamezia Terme'
    'Lamezia Terme → Tiriolo' (vuoto)
    'Lamezia Terme → Nocera Terinese' (vuoto)
    Lamezia→Vibo(andrea) -> 'Lamezia Terme → Vibo Valentia' (giro di Andrea)
    Vibo→Ricadi(andrea)  -> 'Vibo Valentia → Ricadi' (giro di Andrea)
- Clienti di Andrea in 'Sila Piccola' o senza giro -> Da Verificare (giro_id=None).
NON tocca i clienti di Umberto. Idempotente: se i giri di Andrea esistono già, non li duplica.
"""
import os
import uuid
from datetime import datetime, timezone
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
db = MongoClient(MONGO_URL)[DB_NAME]
now = datetime.now(timezone.utc)

def giro_by_name(name, agent):
    return db.giri.find_one({"name": name, "agent": agent})

def ensure_andrea_giro(name, order):
    g = giro_by_name(name, "andrea")
    if g:
        return g["id"]
    gid = str(uuid.uuid4())
    db.giri.insert_one({"id": gid, "name": name, "localities": [], "order": order,
                        "active": True, "agent": "andrea", "created_at": now})
    print(f"  creato giro Andrea: {name}")
    return gid

# 1) Tutti i giri esistenti senza agent -> umberto
r = db.giri.update_many({"agent": {"$exists": False}}, {"$set": {"agent": "umberto"}})
print("giri assegnati a umberto:", r.modified_count)

# id dei giri condivisi (sorgente dei clienti di Andrea)
def shared_id(name):
    g = db.giri.find_one({"name": name, "agent": "umberto"})
    return g["id"] if g else None

GUARDAVALLE = shared_id("Catanzaro → Guardavalle")
FALERNA = shared_id("Catanzaro → Lamezia Terme → Falerna")
LAMEZIA_VIBO = shared_id("Lamezia Terme → Vibo Valentia")
VIBO_RICADI = shared_id("Vibo Valentia → Ricadi")
SILA = shared_id("Catanzaro → Sila Piccola")

# 2) Giri di Andrea
g_sanvito = ensure_andrea_giro("Lamezia Terme → San Vito", 0)
g_lamezia = ensure_andrea_giro("Lamezia Terme", 1)
ensure_andrea_giro("Lamezia Terme → Tiriolo", 2)
ensure_andrea_giro("Lamezia Terme → Nocera Terinese", 3)
g_lamvibo = ensure_andrea_giro("Lamezia Terme → Vibo Valentia", 4)
g_vibric = ensure_andrea_giro("Vibo Valentia → Ricadi", 5)

def move(old_giro_id, new_giro_id, label):
    if not old_giro_id:
        print(f"  (salto {label}: giro sorgente non trovato)")
        return
    r = db.clients.update_many(
        {"agent": "andrea", "giro_id": old_giro_id, "deleted_at": None},
        {"$set": {"giro_id": new_giro_id}},
    )
    print(f"  {label}: spostati {r.modified_count} clienti di Andrea")

# 3) Spostamenti clienti di Andrea
move(GUARDAVALLE, g_sanvito, "Guardavalle -> San Vito")
move(FALERNA, g_lamezia, "Falerna -> Lamezia Terme")
move(LAMEZIA_VIBO, g_lamvibo, "Lamezia→Vibo (Andrea)")
move(VIBO_RICADI, g_vibric, "Vibo→Ricadi (Andrea)")

# 4) Sila Piccola (Andrea) + eventuali altri giri di Umberto dove Andrea avesse clienti -> Da Verificare
# Qualsiasi cliente di Andrea ancora agganciato a un giro di Umberto va in Da Verificare.
umberto_giri_ids = [g["id"] for g in db.giri.find({"agent": {"$ne": "andrea"}}, {"id": 1})]
r = db.clients.update_many(
    {"agent": "andrea", "giro_id": {"$in": umberto_giri_ids}, "deleted_at": None},
    {"$set": {"giro_id": None}},
)
print("clienti di Andrea residui -> Da Verificare:", r.modified_count)

print("\n=== RISULTATO: giri di Andrea ===")
for g in db.giri.find({"agent": "andrea", "active": True}, {"_id": 0}).sort("order", 1):
    n = db.clients.count_documents({"agent": "andrea", "giro_id": g["id"], "deleted_at": None})
    print(f"  {g['order']}  {g['name']:<34} clienti={n}")
daver = db.clients.count_documents({"agent": "andrea", "giro_id": None, "deleted_at": None})
print("  Da Verificare (giro_id=None):", daver)
print("Fatto.")
