"""Iter 24 — 'Da gestire' -> 'Gestiti' solo con azioni reali (ordine/incasso/nota) nel mese.
Visite e 'Visita rimandata' (reschedule) / sospesi NON spostano il cliente in Gestiti."""
import os

import pytest
import requests
from pymongo import MongoClient

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
API = f"{BASE_URL}/api"
GIRO_PREFIX = "826d2605"


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def _mongo_db():
    env = {}
    with open("/app/backend/.env") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k] = v.strip('"')
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


@pytest.fixture(scope="module")
def h():
    return _login("umberto", "Umberto2774!")


@pytest.fixture(scope="module")
def giro(h):
    r = requests.get(f"{API}/giri", headers=h, timeout=20)
    assert r.status_code == 200
    giri = r.json()
    g = next((x for x in giri if x["id"].startswith(GIRO_PREFIX)), None) or (giri[0] if giri else None)
    if not g:
        pytest.skip("Nessun giro")
    return g


def _clients(h, giro_id):
    r = requests.get(f"{API}/clients", params={"giro_id": giro_id}, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _status(h, giro_id, cid):
    rows = [c for c in _clients(h, giro_id) if c["id"] == cid]
    assert rows, "client not in giro"
    return rows[0]


@pytest.fixture(scope="module")
def target(h, giro):
    da = [c for c in _clients(h, giro["id"]) if c["status"] == "da_visitare"]
    if not da:
        pytest.skip("Nessun cliente da_visitare")
    c = da[-1]
    db = _mongo_db()
    orig = db.clients.find_one({"id": c["id"]}, {"_id": 0, "snoozed_until": 1, "last_visit_at": 1})
    yield c
    # restore snoozed_until / last_visit_at modified by reschedule/visit
    db.clients.update_one({"id": c["id"]}, {"$set": {"snoozed_until": orig.get("snoozed_until"),
                                                     "last_visit_at": orig.get("last_visit_at")}})


@pytest.fixture(scope="module")
def company(h):
    r = requests.get(f"{API}/companies", headers=h, timeout=20)
    assert r.status_code == 200 and r.json()
    return r.json()[0]


def _create(h, payload):
    r = requests.post(f"{API}/events", json=payload, headers=h, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _delete(h, eid):
    r = requests.delete(f"{API}/events/{eid}", headers=h, timeout=20)
    assert r.status_code == 200, r.text


class TestNonCountingActions:
    # reschedule / visit / suspension must NOT move to gestito
    @pytest.mark.parametrize("payload_extra", [
        {"type": "reschedule", "reschedule_days": 7},
        {"type": "visit", "note_text": "TEST_visit"},
        {"type": "suspension"},
    ])
    def test_not_gestito(self, h, giro, target, company, payload_extra):
        payload = {"client_id": target["id"], **payload_extra}
        if payload["type"] == "suspension":
            payload["company_id"] = company["id"]
        eid = _create(h, payload)
        try:
            c = _status(h, giro["id"], target["id"])
            assert c["status"] == "da_visitare", f"{payload['type']} moved client to {c['status']}"
            assert c["handled_this_month"] is False
        finally:
            _delete(h, eid)


class TestCountingActions:
    # order / collection / note move to gestito; delete restores da_visitare
    @pytest.mark.parametrize("kind", ["note", "order", "collection"])
    def test_gestito_then_revert(self, h, giro, target, company, kind):
        payload = {"client_id": target["id"], "type": kind}
        if kind == "note":
            payload["note_text"] = "TEST_nota iter24"
        else:
            payload["company_id"] = company["id"]
        if kind == "order":
            payload["payment_mode"] = "bonifico_30"
        if kind == "collection":
            payload["collection_method"] = "contanti"
        before = _clients(h, giro["id"])
        n_da_before = sum(1 for c in before if c["status"] == "da_visitare")
        eid = _create(h, payload)
        try:
            after = _clients(h, giro["id"])
            row = next(c for c in after if c["id"] == target["id"])
            assert row["status"] == "gestito"
            assert row["handled_this_month"] is True
            n_rows = sum(1 for c in before if c["id"] == target["id"])
            assert sum(1 for c in after if c["status"] == "da_visitare") == n_da_before - n_rows
        finally:
            _delete(h, eid)
        assert _status(h, giro["id"], target["id"])["status"] == "da_visitare"

    def test_order_with_past_month_activity_date_does_not_count(self, h, giro, target, company):
        eid = _create(h, {"client_id": target["id"], "type": "order", "company_id": company["id"],
                          "payment_mode": "bonifico_30", "activity_date": "2025-01-15"})
        try:
            assert _status(h, giro["id"], target["id"])["status"] == "da_visitare"
        finally:
            _delete(h, eid)

    def test_empty_note_rejected(self, h, target):
        r = requests.post(f"{API}/events", json={"client_id": target["id"], "type": "note", "note_text": "  "},
                          headers=h, timeout=20)
        assert r.status_code == 400
