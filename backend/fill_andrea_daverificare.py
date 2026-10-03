"""
Riempimento Giri di Andrea: sposta i clienti rimasti in "Da Verificare"
(giro_id=None) verso i giri corretti, accodandoli in fondo (position = max+1).

Idempotente e NON distruttivo: sposta un cliente SOLO se è di Andrea ED è
ancora senza giro (giro_id=None). Se è già assegnato, lo lascia invariato.

Mappatura confermata con l'utente (client_id -> nome giro di Andrea):
  Ristorante La Conchiglia (Curinga)      -> Lamezia Terme → Vibo Valentia
  Gi.Bo.Da. (Filadelfia)                  -> Lamezia Terme → Vibo Valentia
  Platonico (Magisano)                    -> Lamezia Terme → Tiriolo
  Vecchio Monastero (Pianopoli)           -> Lamezia Terme
  Hotel Ristorante 2000 (Pianopoli)       -> Lamezia Terme
  Pizzeria 400 Gradi (San Vito sullo I.)  -> Lamezia Terme → San Vito

Legge MONGO_URL/DB_NAME da env (così può girare sia su preview sia su Atlas).
"""
import os
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
db = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)[DB_NAME]

# Risolviamo i clienti per PREFISSO id (primi 8 char) per robustezza fra ambienti.
PREFIX_MAPPING = {
    "fdf1b5f1": "Lamezia Terme → Vibo Valentia",   # Ristorante La Conchiglia (Curinga)
    "82daf7eb": "Lamezia Terme → Vibo Valentia",   # Gi.Bo.Da. (Filadelfia)
    "78e2991d": "Lamezia Terme → Tiriolo",         # Platonico (Magisano)
    "5c380871": "Lamezia Terme",                   # Vecchio Monastero (Pianopoli)
    "d02e321c": "Lamezia Terme",                   # Hotel Ristorante 2000 (Pianopoli)
    "15d6c0a9": "Lamezia Terme → San Vito",        # Pizzeria 400 Gradi (San Vito sullo Ionio)
}


def andrea_giro_id(name):
    g = db.giri.find_one({"name": name, "agent": "andrea", "active": True})
    return g["id"] if g else None


def next_position(giro_id):
    top = db.clients.find_one(
        {"giro_id": giro_id, "deleted_at": None},
        {"_id": 0, "position": 1},
        sort=[("position", -1)],
    )
    return ((top or {}).get("position") or 0) + 1


moved = 0
for c in db.clients.find({"agent": "andrea", "giro_id": None, "deleted_at": None}, {"_id": 0, "id": 1, "ragione_sociale": 1}):
    prefix = c["id"][:8]
    name = PREFIX_MAPPING.get(prefix)
    if not name:
        print(f"  (nessuna mappatura per {c.get('ragione_sociale','')} [{prefix}]) -> resta in Da Verificare")
        continue
    gid = andrea_giro_id(name)
    if not gid:
        print(f"  (ATTENZIONE: giro '{name}' non trovato per Andrea) -> salto {c.get('ragione_sociale','')}")
        continue
    pos = next_position(gid)
    db.clients.update_one(
        {"id": c["id"]},
        {"$set": {"giro_id": gid, "position": pos}, "$unset": {"extra.needs_review": ""}},
    )
    print(f"  spostato: {c.get('ragione_sociale','')} -> {name} (pos {pos})")
    moved += 1

print(f"\nTotale clienti spostati: {moved}")
print("=== Giri di Andrea dopo il riempimento ===")
for g in db.giri.find({"agent": "andrea", "active": True}, {"_id": 0}).sort("order", 1):
    n = db.clients.count_documents({"agent": "andrea", "giro_id": g["id"], "deleted_at": None})
    print(f"  {g['order']}  {g['name']:<34} clienti={n}")
daver = db.clients.count_documents({"agent": "andrea", "giro_id": None, "deleted_at": None})
print("  Da Verificare (giro_id=None):", daver)
print("Fatto.")
