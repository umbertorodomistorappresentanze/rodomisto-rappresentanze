"""
Migrazione UNA TANTUM: Preview -> Produzione (upsert per _id).

Sicurezza:
- NON droppa e NON svuota alcuna collection.
- Per ogni documento fa replace_one({_id}, doc, upsert=True):
  -> se esiste in produzione viene aggiornato, altrimenti inserito.
- Le collection presenti solo in produzione NON vengono toccate.

Uso (da eseguire da chi ha accesso alla PRODUZIONE):
    export SOURCE_MONGO_URL="mongodb://localhost:27017"     # Preview (sorgente)
    export SOURCE_DB_NAME="test_database"
    export PROD_MONGO_URL="<connection string PRODUZIONE>"   # OBBLIGATORIA
    export PROD_DB_NAME="<nome db produzione>"               # default: test_database
    python migrate_to_prod.py

Facoltativo:
    export DRY_RUN="1"    # simula senza scrivere nulla
"""
import os
import sys
from pymongo import MongoClient, ReplaceOne

SOURCE_MONGO_URL = os.environ.get("SOURCE_MONGO_URL", "mongodb://localhost:27017")
SOURCE_DB_NAME = os.environ.get("SOURCE_DB_NAME", "test_database")
PROD_MONGO_URL = os.environ.get("PROD_MONGO_URL")
PROD_DB_NAME = os.environ.get("PROD_DB_NAME", "test_database")
DRY_RUN = os.environ.get("DRY_RUN") == "1"

if not PROD_MONGO_URL:
    print("ERRORE: variabile PROD_MONGO_URL mancante. Imposta la connection string di produzione.")
    sys.exit(1)

src = MongoClient(SOURCE_MONGO_URL)[SOURCE_DB_NAME]
dst = MongoClient(PROD_MONGO_URL)[PROD_DB_NAME]

print(f"Sorgente : {SOURCE_MONGO_URL} / {SOURCE_DB_NAME}")
print(f"Destinazione: {PROD_MONGO_URL[:30]}... / {PROD_DB_NAME}")
print(f"DRY_RUN  : {DRY_RUN}\n")

report = []
for col_name in src.list_collection_names():
    docs = list(src[col_name].find({}))
    if not docs:
        report.append((col_name, 0, 0, 0))
        continue

    existing_ids = set()
    if not DRY_RUN:
        ids = [d["_id"] for d in docs]
        existing_ids = {d["_id"] for d in dst[col_name].find({"_id": {"$in": ids}}, {"_id": 1})}
    else:
        ids = [d["_id"] for d in docs]
        existing_ids = {d["_id"] for d in dst[col_name].find({"_id": {"$in": ids}}, {"_id": 1})}

    to_insert = sum(1 for d in docs if d["_id"] not in existing_ids)
    to_update = len(docs) - to_insert

    if not DRY_RUN:
        ops = [ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in docs]
        dst[col_name].bulk_write(ops, ordered=False)

    report.append((col_name, len(docs), to_insert, to_update))
    print(f"[{col_name}] sorgente={len(docs)}  nuovi={to_insert}  aggiornati={to_update}")

print("\n===== REPORT MIGRAZIONE =====")
print(f"{'collection':<22}{'sorgente':>10}{'nuovi':>8}{'aggiornati':>12}")
for name, total, ins, upd in report:
    print(f"{name:<22}{total:>10}{ins:>8}{upd:>12}")
print("\nFatto." + (" (DRY RUN: nessuna scrittura effettuata)" if DRY_RUN else ""))
