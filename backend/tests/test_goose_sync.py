"""Pytest per la nuova feature 'Integrazione GooseApp' — iter20.

Flussi testati:
- Config GET/PUT (solo admin) e 403 per andrea.
- Pipeline di import via mock_records: imported, skipped_duplicates, unmatched.
- Match sede tramite goose_code su sede aggiuntiva; fallback sede principale.
- Chiamata live senza mock_records: HTTP 502 con '#111' (IP non in whitelist).
- Cleanup: elimina clienti __TEST__ e eventi source=gooseapp creati.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "umberto", "password": "Umberto2774!"}
AGENT = {"username": "andrea", "password": "Andrea1606!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login fallito: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def agent_token():
    return _login(AGENT)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def agent_h(agent_token):
    return {"Authorization": f"Bearer {agent_token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Status / config
# ---------------------------------------------------------------------------
def test_status_available_for_agent(agent_h):
    r = requests.get(f"{API}/goose/status", headers=agent_h, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "configured" in body and "ready" in body


def test_config_only_admin(agent_h, admin_h):
    r = requests.get(f"{API}/goose/config", headers=agent_h, timeout=20)
    assert r.status_code == 403, f"andrea non deve leggere config: {r.status_code}"

    r = requests.get(f"{API}/goose/config", headers=admin_h, timeout=20)
    assert r.status_code == 200


def test_put_config_admin(admin_h):
    payload = {
        "orders_table": "T_TEST",
        "field_piva": "COPIV",
        "field_site": "CODES",
        "field_company": "COMAN",
        "field_number": "NUMDOC",
        "field_date": "DATDOC",
        "field_order_id": "RECORD_ID",
    }
    r = requests.put(f"{API}/goose/config", headers=admin_h, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    cfg = r.json()
    for k, v in payload.items():
        assert cfg.get(k) == v, f"campo {k} non salvato: {cfg.get(k)} != {v}"


# ---------------------------------------------------------------------------
# Pipeline di import via mock_records
# ---------------------------------------------------------------------------
_created_clients = []


@pytest.fixture(scope="module")
def test_client(admin_h):
    """Crea un cliente admin con P.IVA univoca + una sede aggiuntiva con goose_code."""
    piva = f"IT{uuid.uuid4().hex[:11].upper()}"
    sede_code = f"S{uuid.uuid4().hex[:6].upper()}"
    body = {
        "ragione_sociale": f"__TEST__ Goose {uuid.uuid4().hex[:6]}",
        "citta": "Roma",
        "provincia": "RM",
        "partita_iva": piva,
        "sede_nome": "Sede Principale",
        "goose_code": "MAIN_TEST",
        "sites": [{
            "nominativo": "Deposito GooseTest",
            "indirizzo": "Via Goose 1",
            "citta": "Milano",
            "provincia": "MI",
            "cap": "20100",
            "goose_code": sede_code,
        }],
        "agent": "umberto",
    }
    r = requests.post(f"{API}/clients", headers=admin_h, json=body, timeout=20)
    assert r.status_code == 200, r.text
    cli = r.json()
    _created_clients.append(cli["id"])
    cli["_piva_norm"] = piva  # già senza "IT" prefix? _norm_piva rimuoverà "IT"
    cli["_sede_code"] = sede_code
    return cli


def test_import_success_and_site_match(admin_h, test_client):
    piva = test_client["_piva_norm"]
    sede_code = test_client["_sede_code"]
    order_id = f"TEST_ORD_{uuid.uuid4().hex[:8]}"

    record = {
        "RECORD_ID": order_id,
        "COPIV": piva,
        "CODES": sede_code,
        "COMAN": "Librandi",
        "NUMDOC": "DOC-001",
        "DATDOC": "2026-01-15",
    }
    r = requests.post(f"{API}/goose/sync", headers=admin_h, json={"mock_records": [record]}, timeout=30)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["imported"] == 1, f"atteso 1 import, risultato: {res}"
    assert res["skipped_duplicates"] == 0
    assert res["unmatched"] == []
    details = res.get("details", [])
    assert details and details[0]["site"] == "Deposito GooseTest", f"site atteso 'Deposito GooseTest': {details}"
    assert details[0]["site_matched"] is True

    # Verifica evento nello storico cliente
    cid = test_client["id"]
    h = requests.get(f"{API}/clients/{cid}/history", headers=admin_h, timeout=20)
    assert h.status_code == 200
    ev = [e for e in h.json() if e["type"] == "order"]
    assert ev, "nessun ordine creato nello storico"
    # L'ultimo ordine deve avere il site_nominativo della sede aggiuntiva
    found = [e for e in ev if e.get("site_nominativo") == "Deposito GooseTest"]
    assert found, f"ordine con sede 'Deposito GooseTest' non trovato: {ev}"


def test_import_dedup_on_rerun(admin_h, test_client):
    """Riesecuzione stesso ordine → skipped_duplicates."""
    piva = test_client["_piva_norm"]
    sede_code = test_client["_sede_code"]
    # Riutilizziamo lo stesso order_id del test precedente? No, serve lo stesso ID che è
    # già presente in events. Facciamo prima un import noto, poi la ripetizione.
    order_id = f"TEST_DEDUP_{uuid.uuid4().hex[:8]}"
    rec = {"RECORD_ID": order_id, "COPIV": piva, "CODES": sede_code, "COMAN": "Librandi",
           "NUMDOC": "DOC-002", "DATDOC": "2026-01-16"}
    r1 = requests.post(f"{API}/goose/sync", headers=admin_h, json={"mock_records": [rec]}, timeout=30)
    assert r1.status_code == 200 and r1.json()["imported"] == 1
    r2 = requests.post(f"{API}/goose/sync", headers=admin_h, json={"mock_records": [rec]}, timeout=30)
    assert r2.status_code == 200
    body = r2.json()
    assert body["imported"] == 0
    assert body["skipped_duplicates"] == 1


def test_import_unmatched_piva(admin_h):
    rec = {"RECORD_ID": f"TEST_UNM_{uuid.uuid4().hex[:6]}",
           "COPIV": "ZZZZZZZZZZZ", "CODES": "X", "COMAN": "X", "NUMDOC": "", "DATDOC": "2026-01-16"}
    r = requests.post(f"{API}/goose/sync", headers=admin_h, json={"mock_records": [rec]}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 0
    assert len(body["unmatched"]) == 1
    assert body["unmatched"][0]["partita_iva"] == "ZZZZZZZZZZZ"


def test_mock_records_forbidden_for_agent(agent_h):
    r = requests.post(f"{API}/goose/sync", headers=agent_h, json={"mock_records": [{"RECORD_ID": "x"}]}, timeout=20)
    assert r.status_code == 403, f"andrea non deve poter usare mock_records: {r.status_code} {r.text}"


# ---------------------------------------------------------------------------
# Chiamata live: ci si aspetta #111 (IP non in whitelist in anteprima)
# ---------------------------------------------------------------------------
def test_live_tables_returns_502(admin_h):
    """La chiamata live deve fallire con 502 (IP non in whitelist → #111).
    Nel preview Emergent, Cloudflare sostituisce il body JSON dell'errore 502
    con una pagina HTML: verifichiamo quindi solo lo status code. Il messaggio
    '#111' è confermato via localhost (verifica interna del backend)."""
    r = requests.get(f"{API}/goose/tables", headers=admin_h, timeout=30)
    assert r.status_code == 502, f"atteso 502, trovato {r.status_code}: {r.text[:200]}"


def test_live_sync_no_mock_returns_502(admin_h):
    # Config con orders_table già salvata in test_put_config_admin.
    r = requests.post(f"{API}/goose/sync", headers=admin_h, json={}, timeout=30)
    assert r.status_code == 502, f"atteso 502, trovato {r.status_code}: {r.text[:200]}"


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
def test_cleanup(admin_h):
    # elimina clienti di test
    for cid in _created_clients:
        requests.delete(f"{API}/clients/{cid}", headers=admin_h, timeout=20)
    # Reset config per non lasciare orders_table valorizzato
    requests.put(f"{API}/goose/config", headers=admin_h, json={
        "orders_table": "", "field_piva": "", "field_site": "", "field_company": "",
        "field_number": "", "field_date": "", "field_order_id": "RECORD_ID",
    }, timeout=20)
