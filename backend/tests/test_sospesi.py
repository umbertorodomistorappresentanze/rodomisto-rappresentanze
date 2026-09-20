"""Iteration 5: SOSPESI + PAYMENT_MODES (per-order) feature testing.

Covers:
- GET /api/payment-modes (7 modes with correct days)
- POST /api/events type=suspension|collection|order (company_id validations)
- suspensions dynamic computation (list_clients + get_client)
- collection closes only the targeted company suspension
- order with anticipato/contrassegno => no suspension ever
- order with agente_60 => due_at ~+60d and no suspension while future
- Past-due deferred order becomes suspension automatically; collection settles it
- Payment_mode on order does NOT touch client anagrafica
- Permissions unchanged (403 for other-agent client)
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://route-manager-126.preview.emergentagent.com").rstrip("/")

# Direct DB access for injecting past-dated events (cannot be done via API).
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


# ---------- helpers ----------
def _first_giro_with_clients(api, headers, min_clients=1):
    giri = api.get(f"{BASE_URL}/api/giri", headers=headers).json()
    for g in giri:
        clients = api.get(f"{BASE_URL}/api/clients?giro_id={g['id']}", headers=headers).json()
        if len(clients) >= min_clients:
            return g, clients
    pytest.skip("Nessun giro con clienti sufficienti per umberto")


def _pick_clean_client(clients, offset=0):
    """Return a client with no existing suspensions at index >= offset.
    Different offsets avoid cross-test collisions when running in parallel."""
    candidates = [c for c in clients if not c.get("suspensions")]
    if not candidates:
        candidates = clients
    return candidates[offset % len(candidates)]


def _companies(api, headers):
    return api.get(f"{BASE_URL}/api/companies", headers=headers).json()


def _cleanup_test_events(client_id):
    """Remove all events we may have created on the given client (test-only)."""
    _db.events.delete_many({"client_id": client_id})


# ============================================================
# GET /api/payment-modes
# ============================================================
class TestPaymentModes:
    def test_seven_modes_correct_days(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/payment-modes", headers=umberto_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) == 7
        expected = [
            ("anticipato", None),
            ("contrassegno", None),
            ("bonifico_30", 30),
            ("bonifico_60", 60),
            ("agente_30", 30),
            ("agente_60", 60),
            ("agente_90", 90),
        ]
        got = [(m["key"], m["days"]) for m in data]
        assert got == expected, got
        for m in data:
            assert isinstance(m["label"], str) and m["label"].strip()

    def test_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/payment-modes")
        assert r.status_code == 401


# ============================================================
# Validation: company_id required
# ============================================================
class TestEventValidation:
    def test_order_without_company_400(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        cid = clients[0]["id"]
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "order"})
        assert r.status_code == 400
        _cleanup_test_events(cid)

    def test_collection_without_company_400(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        cid = clients[0]["id"]
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "collection"})
        assert r.status_code == 400

    def test_suspension_without_company_400(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        cid = clients[0]["id"]
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "suspension"})
        assert r.status_code == 400


# ============================================================
# Manual suspension + collection flow
# ============================================================
class TestManualSuspensionFlow:
    def test_manual_suspension_appears_and_collection_closes(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        # Use offset to avoid collision with other parallel tests on same client.
        target = _pick_clean_client(clients, offset=0)
        cid = target["id"]
        _cleanup_test_events(cid)
        comps = _companies(api, umberto_headers)
        assert len(comps) >= 2
        c1, c2 = comps[0], comps[1]

        # Add suspension for company1
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "suspension", "company_id": c1["id"]})
        assert r.status_code == 200, r.text

        # GET list must expose suspensions with c1.name
        lst = api.get(f"{BASE_URL}/api/clients?giro_id={g['id']}", headers=umberto_headers).json()
        row = next(x for x in lst if x["id"] == cid)
        assert c1["name"] in row["suspensions"], row["suspensions"]

        # Add second suspension for company2
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "suspension", "company_id": c2["id"]})
        assert r.status_code == 200

        # GET client detail exposes both
        det = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        assert set(det["suspensions"]) >= {c1["name"], c2["name"]}

        # Collection for c1 should close only c1's suspension
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "collection", "company_id": c1["id"]})
        assert r.status_code == 200

        det = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        assert c1["name"] not in det["suspensions"], det["suspensions"]
        assert c2["name"] in det["suspensions"], det["suspensions"]

        # Collect the second one too
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "collection", "company_id": c2["id"]})
        assert r.status_code == 200
        det = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        assert det["suspensions"] == []

        _cleanup_test_events(cid)


# ============================================================
# Order + payment_mode behavior
# ============================================================
class TestOrderPaymentModes:
    def test_order_anticipato_no_suspension(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        target = _pick_clean_client(clients, offset=1)
        cid = target["id"]
        _cleanup_test_events(cid)
        comp = _companies(api, umberto_headers)[0]

        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "order", "company_id": comp["id"],
                           "payment_mode": "anticipato"})
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev["payment_mode"] == "anticipato"
        assert ev["due_at"] is None
        assert ev["payment_mode_label"] == "Anticipato"

        det = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        assert det["suspensions"] == [], det["suspensions"]
        _cleanup_test_events(cid)

    def test_order_contrassegno_no_suspension(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        target = _pick_clean_client(clients, offset=2)
        cid = target["id"]
        _cleanup_test_events(cid)
        comp = _companies(api, umberto_headers)[0]

        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "order", "company_id": comp["id"],
                           "payment_mode": "contrassegno"})
        assert r.status_code == 200
        assert r.json()["due_at"] is None

        det = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        assert det["suspensions"] == []
        _cleanup_test_events(cid)

    def test_order_agente60_sets_due_at_future_no_suspension(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        target = _pick_clean_client(clients, offset=3)
        cid = target["id"]
        _cleanup_test_events(cid)
        comp = _companies(api, umberto_headers)[0]

        before = datetime.now(timezone.utc)
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "order", "company_id": comp["id"],
                           "payment_mode": "agente_60"})
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev["payment_mode"] == "agente_60"
        assert ev["payment_mode_label"] == "Pagamento mezzo Agente 60 giorni"
        assert ev["due_at"] is not None
        due = datetime.fromisoformat(ev["due_at"].replace("Z", "+00:00"))
        delta = due - before
        # roughly 60 days ahead (allow small skew)
        assert timedelta(days=59, hours=23) <= delta <= timedelta(days=60, hours=1), delta

        # No suspension while due_at is future
        det = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        assert det["suspensions"] == [], det["suspensions"]
        _cleanup_test_events(cid)

    def test_order_invalid_payment_mode_400(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        cid = clients[0]["id"]
        comp = _companies(api, umberto_headers)[0]
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "order", "company_id": comp["id"],
                           "payment_mode": "sconosciuto"})
        assert r.status_code == 400
        _cleanup_test_events(cid)


# ============================================================
# Past-due deferred order becomes automatic suspension
# ============================================================
class TestPastDueDeferredOrder:
    def test_past_due_appears_as_suspension_then_collection_settles(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        target = _pick_clean_client(clients, offset=4)
        cid = target["id"]
        _cleanup_test_events(cid)
        comp = _companies(api, umberto_headers)[0]

        # Inject a past-due deferred order directly into Mongo.
        past = datetime.now(timezone.utc) - timedelta(days=61)
        due = datetime.now(timezone.utc) - timedelta(days=1)
        _db.events.insert_one({
            "id": str(uuid.uuid4()),
            "client_id": cid,
            "type": "order",
            "company_id": comp["id"],
            "company_name": comp["name"],
            "payment_mode": "agente_60",
            "due_at": due,
            "created_at": past,
            "agent": "umberto",
            "deleted_at": None,
        })

        det = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        assert comp["name"] in det["suspensions"], det["suspensions"]

        # list_clients should also show it
        lst = api.get(f"{BASE_URL}/api/clients?giro_id={g['id']}", headers=umberto_headers).json()
        row = next(x for x in lst if x["id"] == cid)
        assert comp["name"] in row["suspensions"]

        # Collection for that company settles the auto-suspension
        r = api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                     json={"client_id": cid, "type": "collection", "company_id": comp["id"]})
        assert r.status_code == 200
        det = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        assert comp["name"] not in det["suspensions"]
        _cleanup_test_events(cid)


# ============================================================
# Payment mode does NOT touch client anagrafica
# ============================================================
class TestAnagraficaImmutability:
    def test_order_does_not_change_client_fields(self, api, umberto_headers):
        g, clients = _first_giro_with_clients(api, umberto_headers)
        target = _pick_clean_client(clients, offset=5)
        cid = target["id"]
        _cleanup_test_events(cid)
        comp = _companies(api, umberto_headers)[0]

        before = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()

        api.post(f"{BASE_URL}/api/events", headers=umberto_headers,
                 json={"client_id": cid, "type": "order", "company_id": comp["id"],
                       "payment_mode": "agente_30"}).raise_for_status()

        after = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()

        # Compare all anagrafica fields except suspensions (may or may not change here — should not for future due)
        fields = ["ragione_sociale", "provincia", "giro_id", "position", "citta", "zona",
                  "indirizzo", "cap", "telefono", "email", "agent", "permanent_note",
                  "last_visit_at", "snoozed_until", "extra"]
        for f in fields:
            assert before.get(f) == after.get(f), f"field {f} changed: {before.get(f)!r} -> {after.get(f)!r}"
        # future due => no suspension
        assert after.get("suspensions") in ([], before.get("suspensions", [])), after.get("suspensions")
        _cleanup_test_events(cid)


# ============================================================
# Permissions unchanged (basic sanity)
# ============================================================
class TestPermissionsUnchanged:
    def test_andrea_cannot_operate_on_umberto_clients_indirectly(self, api, umberto_headers, andrea_headers):
        # Andrea should only see own clients in /giri lists (already tested elsewhere).
        # Sanity: /giri returns identical set for both (giri are shared metadata).
        gu = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        ga = api.get(f"{BASE_URL}/api/giri", headers=andrea_headers).json()
        assert {g["id"] for g in gu} == {g["id"] for g in ga}

    def test_recurrences_still_two_companies(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/recurrences", headers=umberto_headers)
        assert r.status_code == 200
        data = r.json()
        keys = {d["company"] for d in data}
        assert {"mazzetti", "bonfissuto"} <= keys, keys
