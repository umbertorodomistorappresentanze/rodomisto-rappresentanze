"""Iter30 — Pending suspensions banner + collection flow.

Covers:
- GET /api/clients/{id}/pending-suspensions returns ALL open suspensions
  (deferred orders with future due_at => kind "pending"; manual suspensions
  or overdue deferred orders => kind "overdue") with company_name, company_id
  and due_at.
- Agent authorization: andrea gets 403 on umberto's clients.
- POST /api/events type=collection with collection_method and
  collection_ref_date saves the collection and clears the pending list for
  that (client, company) up to the chosen day inclusive.
- Invalid collection_method returns 400.

Test fixtures: creates throw-away clients (prefix TEST_iter30_) via admin,
deletes them at the end of the suite.
"""

import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://route-manager-126.preview.emergentagent.com",
).rstrip("/")


# ---------- helpers ---------------------------------------------------------

def _companies(headers):
    r = requests.get(f"{BASE_URL}/api/companies", headers=headers)
    r.raise_for_status()
    return r.json()


def _create_client(headers, agent, suffix):
    payload = {
        "ragione_sociale": f"TEST_iter30_{suffix}_{int(time.time()*1000)}",
        "citta": "TestCity",
        "zona": "TestZona",
        "indirizzo": "Via Test 1",
        "cap": "00000",
        "telefono": "",
        "email": "",
        "provincia": "RC",
        "giro_id": None,
        "agent": agent,
    }
    r = requests.post(f"{BASE_URL}/api/clients", headers=headers, json=payload)
    r.raise_for_status()
    return r.json()


def _delete_client(headers, cid):
    requests.delete(f"{BASE_URL}/api/clients/{cid}", headers=headers)


def _post_event(headers, body, expected=None):
    r = requests.post(f"{BASE_URL}/api/events", headers=headers, json=body)
    if expected is not None:
        assert r.status_code == expected, (r.status_code, r.text)
    return r


def _pending(headers, client_id, expected=200):
    r = requests.get(
        f"{BASE_URL}/api/clients/{client_id}/pending-suspensions", headers=headers
    )
    assert r.status_code == expected, (r.status_code, r.text)
    return r.json() if r.status_code == 200 else None


# ---------- fixtures --------------------------------------------------------

@pytest.fixture(scope="module")
def tokens():
    s = requests.Session()
    def login(u, p):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"username": u, "password": p})
        r.raise_for_status()
        return r.json()["access_token"]
    return {
        "umberto": login("umberto", "Umberto2774!"),
        "andrea": login("andrea", "Andrea1606!"),
    }


@pytest.fixture(scope="module")
def admin(tokens):
    return {"Authorization": f"Bearer {tokens['umberto']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def andrea(tokens):
    return {"Authorization": f"Bearer {tokens['andrea']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def company(admin):
    comps = _companies(admin)
    assert len(comps) > 0, "no companies seeded"
    return comps[0]


@pytest.fixture(scope="module")
def created_clients():
    tracked = []
    yield tracked
    # cleanup
    # need an admin token to delete
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"username": "umberto", "password": "Umberto2774!"})
    if r.status_code == 200:
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        for cid in tracked:
            try:
                s.delete(f"{BASE_URL}/api/clients/{cid}", headers=h)
            except Exception:
                pass


# ---------- tests -----------------------------------------------------------

class TestPendingSuspensionsEndpoint:
    """GET /api/clients/{id}/pending-suspensions"""

    def test_deferred_order_appears_as_pending(self, admin, company, created_clients):
        cli = _create_client(admin, "andrea", "pending_future")
        created_clients.append(cli["id"])
        # deferred order (bonifico_60 -> due_at = +60 days from today)
        _post_event(admin, {
            "client_id": cli["id"], "type": "order",
            "company_id": company["id"], "payment_mode": "bonifico_60",
        }, expected=200)
        items = _pending(admin, cli["id"])
        assert isinstance(items, list) and len(items) == 1, items
        it = items[0]
        assert it["company_name"] == company["name"]
        assert it["company_id"] == company["id"]
        assert it["kind"] == "pending"
        assert it["due_at"] is not None
        due = datetime.fromisoformat(it["due_at"].replace("Z", "+00:00"))
        assert due > datetime.now(timezone.utc) + timedelta(days=55)

    def test_manual_suspension_appears_as_overdue(self, admin, company, created_clients):
        cli = _create_client(admin, "andrea", "manual_overdue")
        created_clients.append(cli["id"])
        _post_event(admin, {
            "client_id": cli["id"], "type": "suspension",
            "company_id": company["id"],
        }, expected=200)
        items = _pending(admin, cli["id"])
        assert len(items) == 1, items
        it = items[0]
        assert it["kind"] == "overdue"
        assert it["company_name"] == company["name"]
        assert it["company_id"] == company["id"]

    def test_mixed_deferred_and_manual_same_company(self, admin, company, created_clients):
        cli = _create_client(admin, "andrea", "mixed")
        created_clients.append(cli["id"])
        _post_event(admin, {
            "client_id": cli["id"], "type": "order",
            "company_id": company["id"], "payment_mode": "bonifico_60",
        }, expected=200)
        _post_event(admin, {
            "client_id": cli["id"], "type": "suspension",
            "company_id": company["id"],
        }, expected=200)
        items = _pending(admin, cli["id"])
        # Both are keyed on the same company -> single bucket. With a future
        # due_at the aggregate kind is "pending" (future due_at wins over the
        # manual flag per backend logic at index.py:1418).
        assert len(items) == 1, items
        assert items[0]["kind"] == "pending"
        assert items[0]["company_id"] == company["id"]
        assert items[0]["due_at"] is not None

    def test_404_for_unknown_client(self, admin):
        r = requests.get(
            f"{BASE_URL}/api/clients/does-not-exist/pending-suspensions",
            headers=admin,
        )
        assert r.status_code == 404

    def test_agent_forbidden_on_umberto_client(self, admin, andrea, created_clients):
        # Client owned by umberto -> andrea should get 403
        cli = _create_client(admin, "umberto", "umberto_only")
        created_clients.append(cli["id"])
        r = requests.get(
            f"{BASE_URL}/api/clients/{cli['id']}/pending-suspensions",
            headers=andrea,
        )
        assert r.status_code == 403, (r.status_code, r.text)

    def test_agent_sees_own_client(self, admin, andrea, company, created_clients):
        cli = _create_client(admin, "andrea", "andrea_own")
        created_clients.append(cli["id"])
        # andrea creates manual suspension via own token
        r = requests.post(f"{BASE_URL}/api/events", headers=andrea, json={
            "client_id": cli["id"], "type": "suspension", "company_id": company["id"],
        })
        assert r.status_code == 200, r.text
        items = _pending(andrea, cli["id"])
        assert len(items) == 1
        assert items[0]["kind"] == "overdue"


class TestCollectionClearsPending:
    """POST /api/events type=collection with collection_method."""

    def test_contanti_clears_pending(self, admin, company, created_clients):
        cli = _create_client(admin, "andrea", "coll_contanti")
        created_clients.append(cli["id"])
        _post_event(admin, {
            "client_id": cli["id"], "type": "order",
            "company_id": company["id"], "payment_mode": "bonifico_60",
        }, expected=200)
        _post_event(admin, {
            "client_id": cli["id"], "type": "suspension",
            "company_id": company["id"],
        }, expected=200)
        before = _pending(admin, cli["id"])
        # Deferred order (future due_at) + manual suspension on same company
        # yields a single aggregated bucket with kind "pending".
        assert len(before) == 1 and before[0]["kind"] == "pending"

        today_iso = datetime.now(timezone.utc).date().isoformat()
        r = _post_event(admin, {
            "client_id": cli["id"], "type": "collection",
            "company_id": company["id"], "collection_method": "contanti",
            "activity_date": today_iso,
        }, expected=200)
        ev = r.json()
        assert ev["type"] == "collection"
        # NOTE: event_public() does NOT echo collection_method / collection_ref_date
        # (minor serialization gap). Verify effect instead: pending must be empty.

        after = _pending(admin, cli["id"])
        assert after == [], after

    def test_bonifico_with_ref_date(self, admin, company, created_clients):
        cli = _create_client(admin, "andrea", "coll_bonifico")
        created_clients.append(cli["id"])
        _post_event(admin, {
            "client_id": cli["id"], "type": "suspension",
            "company_id": company["id"],
        }, expected=200)
        today_iso = datetime.now(timezone.utc).date().isoformat()
        r = _post_event(admin, {
            "client_id": cli["id"], "type": "collection",
            "company_id": company["id"], "collection_method": "bonifico",
            "collection_ref_date": today_iso,
            "activity_date": today_iso,
        }, expected=200)
        ev = r.json()
        assert ev["type"] == "collection"
        assert _pending(admin, cli["id"]) == []

    def test_assegno_method(self, admin, company, created_clients):
        cli = _create_client(admin, "andrea", "coll_assegno")
        created_clients.append(cli["id"])
        _post_event(admin, {
            "client_id": cli["id"], "type": "suspension",
            "company_id": company["id"],
        }, expected=200)
        today_iso = datetime.now(timezone.utc).date().isoformat()
        r = _post_event(admin, {
            "client_id": cli["id"], "type": "collection",
            "company_id": company["id"], "collection_method": "assegno",
            "activity_date": today_iso,
        }, expected=200)
        assert r.json()["type"] == "collection"
        assert _pending(admin, cli["id"]) == []

    def test_invalid_method_returns_400(self, admin, company, created_clients):
        cli = _create_client(admin, "andrea", "coll_invalid")
        created_clients.append(cli["id"])
        today_iso = datetime.now(timezone.utc).date().isoformat()
        r = requests.post(f"{BASE_URL}/api/events", headers=admin, json={
            "client_id": cli["id"], "type": "collection",
            "company_id": company["id"], "collection_method": "carta",
            "activity_date": today_iso,
        })
        assert r.status_code == 400, (r.status_code, r.text)
        detail = r.json().get("detail", "")
        assert "incasso" in detail.lower() or "non valid" in detail.lower()
