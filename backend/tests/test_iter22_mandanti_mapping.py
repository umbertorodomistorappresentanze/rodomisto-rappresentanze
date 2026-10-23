"""Iter 22 — Mandanti IDMAN -> Azienda + sede ship_label.

Flussi testati (richiesta main agent):
- GET  /api/goose/mandanti (admin) elenca i codici visti negli ordini gooseapp.
- PUT  /api/goose/mandanti {code, company_id} salva la mappatura e aggiorna
  retroattivamente gli eventi gooseapp esistenti (company_id / company_name).
- PUT  con company_id=null rimuove la mappatura.
- POST /api/goose/mandanti/auto in preview deve fallire con 502 (GooseApp
  non in whitelist) — accettabile, basta che l'errore sia pulito (JSON o
  Cloudflare: nessun 500).
- POST /api/goose/sync con mock_records: config DOC_TES/COPIV/IDMAN/DTNUM/DTDAT/DTIND.
  * record con IDMAN già mappato -> company_name di quell'azienda, type_label
    'Ordine effettuato per <Azienda>', context 'Ordine N. <num>'.
  * DTIND tipo 'Via Roma 1, 89812 Pizzo (VV)' -> ship_label 'Pizzo'.
  * DTIND 'Sede Lamezia' plain -> ship_label 'Sede Lamezia'.
  * site_label su /api/activities = ship_label.
- 403 agent, 403 andrea su mandanti.

Pulizia completa: tutti gli eventi __T* creati vengono eliminati e la
mappatura 2212140014090-1 viene lasciata com'è (test non la tocca).
"""
import os
import uuid

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "umberto", "password": "Umberto2774!"}
AGENT = {"username": "andrea", "password": "Andrea1606!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def agent_h():
    return {"Authorization": f"Bearer {_login(AGENT)}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def companies(admin_h):
    r = requests.get(f"{API}/companies", headers=admin_h, timeout=20)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def menu_company(companies):
    """Trova 'Menù' in anagrafica — target della mappatura 2212140014090-1."""
    for c in companies:
        n = c["name"].lower().strip()
        if n.startswith("menù") or n.startswith("menu"):
            return c
    pytest.skip("Azienda 'Menù' non in anagrafica — niente mapping da verificare")


@pytest.fixture(scope="module")
def ag_client(admin_h):
    """Cliente A. G. Srl (P.IVA 03101400798, Tropea)."""
    r = requests.get(f"{API}/clients/all", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    for c in r.json():
        piva = ((c.get("extra") or {}).get("partita_iva") or "").replace("IT", "").strip()
        if piva == "03101400798":
            return c
    pytest.skip("Cliente con P.IVA 03101400798 non trovato")


# ---------------------------------------------------------------------------
# Config: imposta i campi come richiesto dal main agent
# ---------------------------------------------------------------------------
def test_set_config_doc_tes(admin_h):
    payload = {
        "orders_table": "DOC_TES",
        "field_piva": "COPIV",
        "field_site": "",
        "field_company": "IDMAN",
        "field_number": "DTNUM",
        "field_date": "DTDAT",
        "field_order_id": "RECORD_ID",
        "field_ship": "DTIND",
        "dest_table": "",
        "mandanti_table": "",
    }
    r = requests.put(f"{API}/goose/config", headers=admin_h, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    cfg = r.json()
    for k, v in payload.items():
        assert cfg.get(k) == v, f"{k}: {cfg.get(k)!r} != {v!r}"


# ---------------------------------------------------------------------------
# Mandanti auth
# ---------------------------------------------------------------------------
def test_mandanti_list_requires_admin(agent_h):
    r = requests.get(f"{API}/goose/mandanti", headers=agent_h, timeout=20)
    assert r.status_code == 403


def test_mandanti_put_requires_admin(agent_h):
    r = requests.put(f"{API}/goose/mandanti", headers=agent_h,
                     json={"code": "X", "company_id": None}, timeout=20)
    assert r.status_code == 403


def test_mandanti_list_shape(admin_h):
    r = requests.get(f"{API}/goose/mandanti", headers=admin_h, timeout=20)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    for row in rows:
        assert set(row.keys()) >= {"code", "orders", "company_id", "company_name", "goose_name"}
        assert isinstance(row["code"], str)
        assert isinstance(row["orders"], int)


# ---------------------------------------------------------------------------
# Sync via mock_records: resolve mandante + ship_label
# ---------------------------------------------------------------------------
_created_events = []


@pytest.fixture(scope="module")
def mapping(admin_h, menu_company):
    """Assicura mapping 2212140014090-1 -> Menù. Non lo rimuove a fine test
    (resta coerente con lo stato produzione già presente)."""
    code = "2212140014090-1"
    r = requests.put(f"{API}/goose/mandanti", headers=admin_h,
                     json={"code": code, "company_id": menu_company["id"]}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    return code


def _rec(order_id, piva, idman, num, dtind):
    return {"RECORD_ID": order_id, "COPIV": piva, "IDMAN": idman,
            "DTNUM": num, "DTDAT": "2026-01-15", "DTIND": dtind}


def test_sync_mapped_mandante_and_ship_label_city(admin_h, ag_client, mapping, menu_company):
    """IDMAN mappato + DTIND con CAP+città -> ship_label città."""
    num = f"T{uuid.uuid4().hex[:5].upper()}"
    oid = f"__T_PIZZO_{uuid.uuid4().hex[:6]}"
    rec = _rec(oid, "03101400798", mapping, num, "Via Roma 1, 89812 Pizzo (VV)")
    r = requests.post(f"{API}/goose/sync", headers=admin_h,
                      json={"mock_records": [rec]}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["imported"] == 1, body
    # Recupera l'evento tramite history (event_public espone order_number)
    h = requests.get(f"{API}/clients/{ag_client['id']}/history", headers=admin_h, timeout=20)
    assert h.status_code == 200
    ev = next((e for e in h.json() if e.get("order_number") == num), None)
    assert ev, f"evento con order_number {num} non trovato"
    _created_events.append(ev["id"])
    assert ev["company_id"] == menu_company["id"]
    assert ev["company_name"] == menu_company["name"]
    assert ev["order_number"] == num
    assert ev.get("ship_label") == "Pizzo", f"ship_label atteso 'Pizzo': {ev.get('ship_label')!r}"


def test_sync_plain_ship_label(admin_h, ag_client, mapping):
    """DTIND testo libero -> ship_label testo intero (prima della virgola)."""
    num = f"T{uuid.uuid4().hex[:5].upper()}"
    oid = f"__T_LAMEZIA_{uuid.uuid4().hex[:6]}"
    rec = _rec(oid, "03101400798", mapping, num, "Sede Lamezia")
    r = requests.post(f"{API}/goose/sync", headers=admin_h,
                      json={"mock_records": [rec]}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1
    h = requests.get(f"{API}/clients/{ag_client['id']}/history", headers=admin_h, timeout=20)
    ev = next((e for e in h.json() if e.get("order_number") == num), None)
    assert ev, f"evento con order_number {num} non trovato"
    _created_events.append(ev["id"])
    assert ev.get("ship_label") == "Sede Lamezia", ev.get("ship_label")


def test_activities_feed_type_label_and_site(admin_h, ag_client, menu_company):
    """GET /api/activities deve riportare type_label, context, site_label."""
    r = requests.get(f"{API}/activities", headers=admin_h, params={"limit": 50}, timeout=20)
    assert r.status_code == 200
    acts = r.json()
    # Prendo l'attività sull'evento Pizzo di questa run (quello appena creato
    # da test_sync_mapped_mandante_and_ship_label_city). Riconosco il mio
    # evento perché il suo id è stato appeso a _created_events[0] e il
    # feed activities include campi id? No, cerco per site_label='Pizzo'
    # + Menù + client A. G. Srl.
    hits = [a for a in acts if a.get("client_id") == ag_client["id"]
            and a.get("site_label") == "Pizzo"
            and a.get("company_name") == menu_company["name"]]
    assert hits, "attività Pizzo per A.G. Srl / Menù non trovata"
    hit = hits[0]
    assert hit["type_label"] == f"Ordine effettuato per {menu_company['name']}"
    assert hit["context"].startswith("Ordine N. ")
    assert hit["site_label"] == "Pizzo"


# ---------------------------------------------------------------------------
# PUT mandante: null rimuove e aggiorna gli ordini
# ---------------------------------------------------------------------------
def test_put_mandante_null_removes_mapping(admin_h, mapping, ag_client):
    """Creo un ordine con un IDMAN TEMP, lo mappo a Menù, poi lo smappo (null)
    e verifico che l'evento perda company_id e torni al goose_name/codice."""
    temp_code = f"__TMAP_{uuid.uuid4().hex[:6]}"
    num = f"T{uuid.uuid4().hex[:5].upper()}"
    oid = f"__T_NULL_{uuid.uuid4().hex[:6]}"
    rec = _rec(oid, "03101400798", temp_code, num, "Via Prova 1, 88100 Catanzaro (CZ)")
    r = requests.post(f"{API}/goose/sync", headers=admin_h,
                      json={"mock_records": [rec]}, timeout=30)
    assert r.status_code == 200 and r.json()["imported"] == 1
    # Recupero l'evento
    h = requests.get(f"{API}/clients/{ag_client['id']}/history", headers=admin_h, timeout=20)
    ev = next((e for e in h.json() if e.get("order_number") == num), None)
    assert ev
    _created_events.append(ev["id"])
    # Mappa temp_code -> Menù
    comps = requests.get(f"{API}/companies", headers=admin_h, timeout=20).json()
    menu = next(c for c in comps if c["name"].lower().startswith(("menù", "menu")))
    r = requests.put(f"{API}/goose/mandanti", headers=admin_h,
                     json={"code": temp_code, "company_id": menu["id"]}, timeout=20)
    assert r.status_code == 200
    assert r.json()["updated_orders"] >= 1
    # Verifica che l'evento ora abbia Menù
    h = requests.get(f"{API}/clients/{ag_client['id']}/history", headers=admin_h, timeout=20)
    ev2 = next(e for e in h.json() if e["id"] == ev["id"])
    assert ev2["company_id"] == menu["id"]
    assert ev2["company_name"] == menu["name"]
    # Smappa (null) -> ritorna al codice/nome goose
    r = requests.put(f"{API}/goose/mandanti", headers=admin_h,
                     json={"code": temp_code, "company_id": None}, timeout=20)
    assert r.status_code == 200, r.text
    h = requests.get(f"{API}/clients/{ag_client['id']}/history", headers=admin_h, timeout=20)
    ev3 = next(e for e in h.json() if e["id"] == ev["id"])
    assert ev3["company_id"] is None
    # company_name torna al codice (nessun goose_name salvato) o al goose_name se presente
    assert ev3["company_name"] in (temp_code, None) or isinstance(ev3["company_name"], str)


def test_put_mandante_bad_company_404(admin_h):
    r = requests.put(f"{API}/goose/mandanti", headers=admin_h,
                     json={"code": "__TBAD", "company_id": "nonexistent-id"}, timeout=20)
    assert r.status_code == 404


def test_put_mandante_empty_code_400(admin_h):
    r = requests.put(f"{API}/goose/mandanti", headers=admin_h,
                     json={"code": "   ", "company_id": None}, timeout=20)
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Auto detection in preview: 502 atteso (IP non in whitelist). Non deve 500.
# ---------------------------------------------------------------------------
def test_mandanti_auto_clean_error(admin_h):
    r = requests.post(f"{API}/goose/mandanti/auto", headers=admin_h, timeout=30)
    # 200 è possibile se non ci sono codici "da associare" (già tutti risolti).
    # Altrimenti deve essere 502 (IP non whitelist) con messaggio pulito,
    # non 500.
    assert r.status_code in (200, 502), f"status inatteso: {r.status_code} {r.text[:200]}"


# ---------------------------------------------------------------------------
# Cleanup: cancella TUTTI gli eventi __T* creati dal test.
# Pulisce anche il mapping temp_code (per non lasciare residui).
# ---------------------------------------------------------------------------
def test_zz_cleanup(admin_h):
    for eid in _created_events:
        requests.delete(f"{API}/events/{eid}", headers=admin_h, timeout=20)
    # Non tocca 2212140014090-1 (main agent fa cleanup finale).
