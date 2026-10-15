"""
Test suite for the new 'SEDI DI SCARICO multiple' feature.
Covers:
 - client creation with primary + additional sites, each with its own giro & position
 - GET /api/clients?giro_id= returns separate rows per site (row_id, site_id, site_nominativo)
 - POST /api/events with site_id persists site info and appears in client history
 - PUT /api/clients/{id} persists sites edits
Executed against both umberto (admin) and andrea (agent).
"""

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") \
    or "https://route-manager-126.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

ACCOUNTS = [
    ("umberto", "Umberto2774!"),
    ("andrea", "Andrea1606!"),
]

TEST_PREFIX = "__TEST_SITES_"


def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": username, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok and data.get("user", {}).get("username") == username
    return tok, data["user"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _get_two_giri(tok):
    r = requests.get(f"{BASE_URL}/api/giri", headers=_headers(tok), timeout=20)
    assert r.status_code == 200, r.text
    giri = [g for g in r.json() if g.get("active", True)]
    assert len(giri) >= 2, "serve almeno 2 giri attivi per il test"
    return giri[0], giri[1]


def _get_company(tok):
    r = requests.get(f"{BASE_URL}/api/companies", headers=_headers(tok), timeout=20)
    assert r.status_code == 200, r.text
    comps = [c for c in r.json() if c.get("active", True)]
    assert comps, "serve almeno un'azienda attiva"
    return comps[0]


_created_ids = []


@pytest.fixture(scope="module")
def creds():
    return {u: _login(u, p) for u, p in ACCOUNTS}


@pytest.fixture(scope="module", autouse=True)
def cleanup(creds):
    yield
    # tenta cleanup con TUTTI i token (admin vede tutto, agente solo i suoi)
    for cid in list(set(_created_ids)):
        for u, (tok, _user) in creds.items():
            r = requests.delete(f"{BASE_URL}/api/clients/{cid}", headers=_headers(tok), timeout=20)
            if r.status_code in (200, 204):
                break


@pytest.mark.parametrize("username,password", ACCOUNTS)
class TestSitesMultiPerAccount:

    def _create_client_with_sites(self, tok, username, giro_a, giro_b, suffix):
        ragione = f"{TEST_PREFIX}{suffix}_{uuid.uuid4().hex[:6]}"
        payload = {
            "ragione_sociale": ragione,
            "partita_iva": "",
            "sede_nome": "Sede Principale ACME",
            "provincia": "CZ",
            "citta": "Catanzaro",
            "zona": "Centro",
            "indirizzo": "Via Roma 1",
            "cap": "88100",
            "telefono": "",
            "email": "",
            "giro_id": giro_a["id"],
            "position": 5,
            "sites": [
                {
                    "nominativo": "Deposito Nord",
                    "indirizzo": "Via Nord 10",
                    "cap": "88046",
                    "citta": "Lamezia Terme",
                    "provincia": "CZ",
                    "zona": "Nord",
                    "giro_id": giro_b["id"],
                    "position": 2,
                },
            ],
        }
        # admin deve specificare l'agent assegnatario
        if username == "umberto":
            payload["agent"] = "umberto"
        r = requests.post(f"{BASE_URL}/api/clients", headers=_headers(tok),
                          json=payload, timeout=20)
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        c = r.json()
        _created_ids.append(c["id"])
        return c, ragione

    def test_create_client_with_additional_site(self, creds, username, password):
        tok, _ = creds[username]
        ga, gb = _get_two_giri(tok)
        c, ragione = self._create_client_with_sites(tok, username, ga, gb, "CREATE")
        assert c["ragione_sociale"] == ragione
        assert c.get("giro_id") == ga["id"]
        assert c.get("position") == 5
        sites = c.get("sites") or []
        assert len(sites) == 1
        s = sites[0]
        assert s.get("id"), "sede aggiuntiva deve avere id generato"
        assert s["nominativo"] == "Deposito Nord"
        assert s["giro_id"] == gb["id"]
        assert s["position"] == 2

    def test_list_clients_returns_separate_rows(self, creds, username, password):
        tok, _ = creds[username]
        ga, gb = _get_two_giri(tok)
        c, _ = self._create_client_with_sites(tok, username, ga, gb, "LIST")

        # Giro A (principale)
        rA = requests.get(f"{BASE_URL}/api/clients?giro_id={ga['id']}",
                          headers=_headers(tok), timeout=20)
        assert rA.status_code == 200, rA.text
        rows_a = rA.json()
        matchA = [r for r in rows_a if r.get("id") == c["id"]]
        assert matchA, "il cliente deve apparire nel giro principale"
        row_a = matchA[0]
        assert row_a.get("row_id") == f"{c['id']}:principal"
        assert row_a.get("site_id") == "principal"
        assert row_a.get("position") == 5

        # Giro B (sede aggiuntiva)
        rB = requests.get(f"{BASE_URL}/api/clients?giro_id={gb['id']}",
                          headers=_headers(tok), timeout=20)
        assert rB.status_code == 200, rB.text
        rows_b = rB.json()
        site_id = c["sites"][0]["id"]
        matchB = [r for r in rows_b if r.get("row_id") == f"{c['id']}:{site_id}"]
        assert matchB, f"la sede aggiuntiva deve apparire nel giro B. rows={len(rows_b)}"
        row_b = matchB[0]
        assert row_b["site_id"] == site_id
        assert row_b["site_nominativo"] == "Deposito Nord"
        assert row_b["citta"] == "Lamezia Terme"
        assert row_b["indirizzo"] == "Via Nord 10"
        assert row_b["position"] == 2

        # row_id univoci (nessun duplicato chiave React) nel giro B
        all_ids = [r.get("row_id") for r in rows_b]
        assert len(all_ids) == len(set(all_ids)), "row_id devono essere univoci"

        # Ordinamento ascendente per position nel giro B
        positions = [r.get("position") for r in rows_b if r.get("position") is not None]
        assert positions == sorted(positions), f"non ordinato: {positions}"

    def test_event_persists_site(self, creds, username, password):
        tok, _ = creds[username]
        ga, gb = _get_two_giri(tok)
        c, _ = self._create_client_with_sites(tok, username, ga, gb, "EVENT")
        site_id = c["sites"][0]["id"]
        site_nom = c["sites"][0]["nominativo"]
        comp = _get_company(tok)

        body = {
            "client_id": c["id"],
            "type": "order",
            "company_id": comp["id"],
            "payment_mode": "bonifico_30",
            "site_id": site_id,
            "site_nominativo": site_nom,
            "site_indirizzo": c["sites"][0]["indirizzo"],
        }
        r = requests.post(f"{BASE_URL}/api/events", headers=_headers(tok),
                          json=body, timeout=20)
        assert r.status_code in (200, 201), f"event create failed: {r.status_code} {r.text}"
        ev = r.json()
        assert ev.get("type") == "order"
        assert ev.get("site_id") == site_id
        assert ev.get("site_nominativo") == site_nom

        # history endpoint
        rh = requests.get(f"{BASE_URL}/api/clients/{c['id']}/history",
                          headers=_headers(tok), timeout=20)
        assert rh.status_code == 200, rh.text
        events = rh.json()
        # trova l'ordine appena creato
        found = [e for e in events if e.get("id") == ev["id"]]
        assert found, "l'evento deve comparire nello storico cliente"
        assert found[0].get("site_nominativo") == site_nom

    def test_update_client_persists_sites(self, creds, username, password):
        tok, _ = creds[username]
        ga, gb = _get_two_giri(tok)
        c, _ = self._create_client_with_sites(tok, username, ga, gb, "EDIT")

        # Aggiorna la sede aggiuntiva (cambia nominativo + position)
        new_sites = [{
            **c["sites"][0],
            "nominativo": "Deposito Nord MODIFICATO",
            "position": 7,
        }]
        rp = requests.put(f"{BASE_URL}/api/clients/{c['id']}",
                         headers=_headers(tok),
                         json={"sites": new_sites}, timeout=20)
        assert rp.status_code in (200, 204), rp.text

        # GET per verificare
        rg = requests.get(f"{BASE_URL}/api/clients/{c['id']}",
                          headers=_headers(tok), timeout=20)
        assert rg.status_code == 200, rg.text
        got = rg.json()
        assert len(got.get("sites") or []) == 1
        s = got["sites"][0]
        assert s["nominativo"] == "Deposito Nord MODIFICATO"
        assert s["position"] == 7
        # giro_id non modificato
        assert s["giro_id"] == gb["id"]
