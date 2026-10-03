"""
Pulizia clienti duplicati per Partita IVA.

ATTENZIONE: molte P.IVA risultano duplicate per ERRORE di digitazione su
aziende DIVERSE (es. "Lu.Da. Mondo vino" vs "Treemme srl"). Una fusione cieca
per sola P.IVA distruggerebbe clienti reali e distinti.

Per questo il merge AUTOMATICO avviene SOLO per i gruppi in cui i record sono
chiaramente la STESSA attività: nome normalizzato (senza punteggiatura, forme
societarie, apostrofi) IDENTICO. Tutti gli altri gruppi vengono SOLO segnalati
per revisione manuale (nessuna modifica).

Si può forzare la fusione di gruppi specifici elencando le P.IVA in FORCE_MERGE
(solo quando l'utente ha confermato che sono la stessa azienda).

Preserva lo storico: riassegna gli eventi dei duplicati al record primario,
unisce le membership delle ricorrenze (senza duplicati) e soft-cancella i
duplicati (deleted_at). Idempotente.

Env: MONGO_URL/DB_NAME. Flag: DRY_RUN=1 (default) per sola anteprima; DRY_RUN=0 applica.
"""
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
DRY_RUN = os.environ.get("DRY_RUN", "1") != "0"
db = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)[DB_NAME]
now = datetime.now(timezone.utc)

# P.IVA da fondere ANCHE se il nome non combacia esattamente (confermate dall'utente).
FORCE_MERGE = set(filter(None, (os.environ.get("FORCE_MERGE", "")).replace(" ", "").split(",")))

_SUFFIXES = [
    "srl", "srls", "snc", "sas", "spa", "spa", "ssd", "ss", "scarl", "soc coop",
    "societa cooperativa", "e c", "ec", "di", "s r l", "s n c", "s a s", "s p a",
]


def norm_piva(s):
    return re.sub(r"\s+", "", (s or "").strip().upper())


def norm_name(s):
    s = (s or "").lower()
    s = s.replace("’", "'").replace("`", "'")
    s = re.sub(r"\(cod\.?\s*pac[^)]*\)", "", s)      # rimuove "(cod. Pac 300018)"
    s = re.sub(r"[^a-z0-9]+", " ", s)                 # via punteggiatura/apostrofi
    toks = [t for t in s.split() if t and t not in _SUFFIXES]
    return " ".join(toks).strip()


def events_count(cid):
    return db.events.count_documents({"client_id": cid, "deleted_at": None})


def pick_primary(recs):
    # Preferisci: ha un giro assegnato -> più eventi -> creato prima.
    def rank(c):
        return (
            0 if c.get("giro_id") else 1,
            -events_count(c["id"]),
            str(c.get("created_at") or ""),
        )
    return sorted(recs, key=rank)[0]


def merge_group(primary, dups):
    pid = primary["id"]
    moved_events = 0
    for d in dups:
        did = d["id"]
        r = db.events.update_many({"client_id": did, "deleted_at": None}, {"$set": {"client_id": pid}})
        moved_events += r.modified_count
        # Ricorrenze: sposta le membership evitando doppioni per (company, period).
        for m in db.recurrence_members.find({"client_id": did}):
            exists = db.recurrence_members.find_one({
                "client_id": pid, "company": m.get("company"), "period": m.get("period"),
            })
            if exists:
                db.recurrence_members.delete_one({"_id": m["_id"]})
            else:
                db.recurrence_members.update_one({"_id": m["_id"]}, {"$set": {"client_id": pid}})
        # Completa i campi mancanti del primario con quelli del duplicato.
        fill = {}
        for f in ["telefono", "email", "indirizzo", "cap", "citta", "zona", "provincia", "permanent_note"]:
            if not (primary.get(f) or "").strip() and (d.get(f) or "").strip():
                fill[f] = d[f]
        pextra = dict(primary.get("extra") or {})
        dextra = d.get("extra") or {}
        for k, v in dextra.items():
            if not (pextra.get(k) or "") and v:
                pextra[k] = v
                fill["extra"] = pextra
        if fill:
            db.clients.update_one({"id": pid}, {"$set": fill})
            primary.update(fill)
        # Soft-delete del duplicato.
        db.clients.update_one({"id": did}, {"$set": {"deleted_at": now}})
    return moved_events


def main():
    groups = defaultdict(list)
    for c in db.clients.find({"deleted_at": None}, {"_id": 0}):
        p = norm_piva((c.get("extra") or {}).get("partita_iva"))
        if p and len(p) >= 5:
            groups[p].append(c)
    dups = {k: v for k, v in groups.items() if len(v) > 1}

    print(f"=== {'DRY-RUN (nessuna modifica)' if DRY_RUN else 'APPLICAZIONE MODIFICHE'} ===")
    print(f"DB: {DB_NAME} | gruppi P.IVA duplicati: {len(dups)}")
    merged_groups = 0
    merged_records = 0
    for p, recs in dups.items():
        names = {norm_name(c.get("ragione_sociale")) for c in recs}
        same_business = len(names) == 1
        force = p in FORCE_MERGE
        action = "MERGE" if (same_business or force) else "SKIP (nomi diversi → revisione manuale)"
        print(f"\n[{action}] P.IVA {p}")
        for c in recs:
            print(f"    - {c.get('ragione_sociale','')} ({c.get('citta','')}) agent={c.get('agent')} giro={'Y' if c.get('giro_id') else '-'} events={events_count(c['id'])}")
        if not (same_business or force):
            continue
        primary = pick_primary(recs)
        others = [c for c in recs if c["id"] != primary["id"]]
        print(f"    => primario: {primary.get('ragione_sociale','')} [{primary['id'][:8]}]")
        if not DRY_RUN:
            me = merge_group(primary, others)
            print(f"    => fusi {len(others)} record, {me} eventi riassegnati")
        merged_groups += 1
        merged_records += len(others)

    print(f"\nRiepilogo: gruppi fondibili={merged_groups}, record da eliminare={merged_records}")
    skipped = len(dups) - merged_groups
    print(f"Gruppi SALTATI (revisione manuale): {skipped}")
    if DRY_RUN:
        print("\n(DRY-RUN) Nessuna modifica applicata. Esegui con DRY_RUN=0 per applicare.")


if __name__ == "__main__":
    main()
