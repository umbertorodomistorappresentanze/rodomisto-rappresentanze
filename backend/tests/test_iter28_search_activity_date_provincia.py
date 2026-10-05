"""Iter28 — Backend regression:
  (1) GET /api/clients/search — free client search by name/city, enriched.
  (2) POST /api/events with activity_date — created_at follows local day; due_at offset.
  (3) Provincia normalization on POST/PUT /api/clients (Catanzaro->CZ, etc.).

Credentials: umberto (admin), andrea (agent). BASE_URL from conftest.
"""

import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

try:
    from zoneinfo import ZoneInfo  # py>=3.9
    ROME = ZoneInfo("Europe/Rome")
except Exception:  # pragma: no cover
    ROME = timezone.utc

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                      "https://route-manager-126.preview.emergentagent.com").rstrip("/")


# ---------------------------------------------------------------------------
# (1) /api/clients/search
# ---------------------------------------------------------------------------
class TestClientsSearch:
    def test_empty_q_returns_empty_list_admin(self, umberto_headers):
        r = requests.get(f"{BASE}/api/clients/search?q=", headers=umberto_headers, timeout=20)
        assert r.status_code == 200
        assert r.json() == []

    def test_empty_q_returns_empty_list_agent(self, andrea_headers):
        r = requests.get(f"{BASE}/api/clients/search?q=", headers=andrea_headers, timeout=20)
        assert r.status_code == 200
        assert r.json() == []

    def test_search_bar_admin_returns_enriched_results(self, umberto_headers):
        r = requests.get(f"{BASE}/api/clients/search?q=bar", headers=umberto_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0, "preview DB should have clients matching 'bar'"
        sample = data[0]
        # required enrichment fields
        for k in ("id", "ragione_sociale", "status", "suspensions", "last_order_at", "last_collection_at"):
            assert k in sample, f"missing field '{k}' in search response"
        assert isinstance(sample["suspensions"], list)
        # match actually matches name or citta
        q = "bar"
        for d in data[:10]:
            rs = (d.get("ragione_sociale") or "").lower()
            ct = (d.get("citta") or "").lower()
            assert q in rs or q in ct, f"neither ragione_sociale nor citta contains 'bar': {d}"

    def test_search_scope_agent_only_own_clients(self, andrea_headers):
        r = requests.get(f"{BASE}/api/clients/search?q=a", headers=andrea_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for d in data:
            assert d.get("agent") == "andrea", f"andrea must only see own clients, got {d.get('agent')}"

    def test_search_admin_can_see_other_agents(self, umberto_headers):
        # Admin scope: pulls across all agents.
        r = requests.get(f"{BASE}/api/clients/search?q=a", headers=umberto_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        agents = {d.get("agent") for d in data}
        # at least one of the agents should appear
        assert agents, "admin search must return rows with 'agent'"


# ---------------------------------------------------------------------------
# (2) POST /api/events with activity_date
# ---------------------------------------------------------------------------
def _any_client_for_agent(api_headers):
    # Pick a client via the search endpoint (any letter).
    r = requests.get(f"{BASE}/api/clients/search?q=a", headers=api_headers, timeout=20)
    r.raise_for_status()
    data = r.json()
    assert data, "need at least one client to run the event test"
    return data[0]


def _any_company(api_headers):
    r = requests.get(f"{BASE}/api/companies", headers=api_headers, timeout=20)
    r.raise_for_status()
    data = r.json()
    assert isinstance(data, list) and len(data) > 0, "no companies seeded"
    return data[0]


def _rome_date_str(days_ago: int) -> str:
    d = datetime.now(ROME) - timedelta(days=days_ago)
    return d.strftime("%Y-%m-%d")


def _parse_iso_utc(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


class TestEventActivityDate:
    created_event_ids: list = []

    @classmethod
    def teardown_class(cls):
        # Best-effort cleanup; events deletion endpoint not strictly required but try.
        headers = {"Authorization": f"Bearer {_login('umberto', 'Umberto2774!')}",
                   "Content-Type": "application/json"}
        for eid in cls.created_event_ids:
            try:
                requests.delete(f"{BASE}/api/events/{eid}", headers=headers, timeout=15)
            except Exception:
                pass

    def test_order_with_activity_date_5_days_ago(self, umberto_headers):
        client = _any_client_for_agent(umberto_headers)
        comp = _any_company(umberto_headers)
        target_date = _rome_date_str(5)
        body = {
            "type": "order",
            "client_id": client["id"],
            "company_id": comp["id"],
            "activity_date": target_date,
            # cash: no due_at offset expected
            "payment_mode": "anticipato",
        }
        r = requests.post(f"{BASE}/api/events", headers=umberto_headers, json=body, timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json()
        TestEventActivityDate.created_event_ids.append(ev["id"])
        # Verify created_at matches the target Rome day
        created_utc = _parse_iso_utc(ev["created_at"])
        created_rome = created_utc.astimezone(ROME).strftime("%Y-%m-%d")
        assert created_rome == target_date, f"created_at={created_rome} != {target_date}"

    def test_order_differito_activity_date_sets_due_at_offset(self, umberto_headers):
        """payment_mode agente_30: due_at = activity_date + 30 days."""
        # discover a differito mode via /api/payment-modes
        r = requests.get(f"{BASE}/api/payment-modes", headers=umberto_headers, timeout=15)
        r.raise_for_status()
        modes = r.json()
        differito = next((m for m in modes if m.get("days") is not None and m["days"] >= 30), None)
        assert differito, "no differito payment mode found"

        client = _any_client_for_agent(umberto_headers)
        comp = _any_company(umberto_headers)
        target_date = _rome_date_str(3)
        body = {
            "type": "order",
            "client_id": client["id"],
            "company_id": comp["id"],
            "activity_date": target_date,
            "payment_mode": differito["key"],
        }
        r = requests.post(f"{BASE}/api/events", headers=umberto_headers, json=body, timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json()
        TestEventActivityDate.created_event_ids.append(ev["id"])
        assert ev.get("due_at"), "due_at should be set for differito"
        due_utc = _parse_iso_utc(ev["due_at"])
        created_utc = _parse_iso_utc(ev["created_at"])
        diff_days = round((due_utc - created_utc).total_seconds() / 86400)
        assert diff_days == differito["days"], f"due_at offset={diff_days}, expected={differito['days']}"

    def test_collection_with_activity_date(self, umberto_headers):
        client = _any_client_for_agent(umberto_headers)
        comp = _any_company(umberto_headers)
        target_date = _rome_date_str(2)
        body = {
            "type": "collection",
            "client_id": client["id"],
            "company_id": comp["id"],
            "activity_date": target_date,
        }
        r = requests.post(f"{BASE}/api/events", headers=umberto_headers, json=body, timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json()
        TestEventActivityDate.created_event_ids.append(ev["id"])
        created_rome = _parse_iso_utc(ev["created_at"]).astimezone(ROME).strftime("%Y-%m-%d")
        assert created_rome == target_date

    def test_suspension_with_activity_date(self, umberto_headers):
        client = _any_client_for_agent(umberto_headers)
        comp = _any_company(umberto_headers)
        target_date = _rome_date_str(1)
        body = {
            "type": "suspension",
            "client_id": client["id"],
            "company_id": comp["id"],
            "activity_date": target_date,
        }
        r = requests.post(f"{BASE}/api/events", headers=umberto_headers, json=body, timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json()
        TestEventActivityDate.created_event_ids.append(ev["id"])
        created_rome = _parse_iso_utc(ev["created_at"]).astimezone(ROME).strftime("%Y-%m-%d")
        assert created_rome == target_date

    def test_note_with_activity_date(self, umberto_headers):
        client = _any_client_for_agent(umberto_headers)
        target_date = _rome_date_str(3)
        body = {
            "type": "note",
            "client_id": client["id"],
            "note_text": "TEST_iter28 nota retrodatata",
            "activity_date": target_date,
        }
        r = requests.post(f"{BASE}/api/events", headers=umberto_headers, json=body, timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json()
        TestEventActivityDate.created_event_ids.append(ev["id"])
        created_rome = _parse_iso_utc(ev["created_at"]).astimezone(ROME).strftime("%Y-%m-%d")
        assert created_rome == target_date

    def test_order_without_activity_date_uses_today(self, umberto_headers):
        client = _any_client_for_agent(umberto_headers)
        comp = _any_company(umberto_headers)
        body = {
            "type": "order",
            "client_id": client["id"],
            "company_id": comp["id"],
            "payment_mode": "anticipato",
        }
        r = requests.post(f"{BASE}/api/events", headers=umberto_headers, json=body, timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json()
        TestEventActivityDate.created_event_ids.append(ev["id"])
        today_rome = datetime.now(ROME).strftime("%Y-%m-%d")
        created_rome = _parse_iso_utc(ev["created_at"]).astimezone(ROME).strftime("%Y-%m-%d")
        assert created_rome == today_rome


def _login(username: str, password: str) -> str:
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"username": username, "password": password},
                      timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# (3) Provincia normalization on POST / PUT /api/clients
# ---------------------------------------------------------------------------
class TestProvinciaNormalization:
    created_ids: list = []

    @classmethod
    def teardown_class(cls):
        headers = {"Authorization": f"Bearer {_login('umberto', 'Umberto2774!')}",
                   "Content-Type": "application/json"}
        for cid in cls.created_ids:
            try:
                requests.delete(f"{BASE}/api/clients/{cid}", headers=headers, timeout=15)
            except Exception:
                pass

    @pytest.mark.parametrize("raw,expected", [
        ("Catanzaro", "CZ"),
        ("vibo valentia", "VV"),
        ("kr", "KR"),
        ("Reggio Calabria", "RC"),
    ])
    def test_create_client_normalises_provincia(self, umberto_headers, raw, expected):
        payload = {
            "ragione_sociale": f"TEST_prov_{expected}_{raw[:3]}",
            "citta": "TEST_citta",
            "zona": "",
            "indirizzo": "",
            "cap": "",
            "provincia": raw,
            "giro_id": None,
            "position": 999,
        }
        r = requests.post(f"{BASE}/api/clients", headers=umberto_headers, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        TestProvinciaNormalization.created_ids.append(body["id"])
        assert body["provincia"] == expected, f"POST provincia={body['provincia']} != {expected}"

        # GET after create to confirm persistence
        g = requests.get(f"{BASE}/api/clients/{body['id']}", headers=umberto_headers, timeout=15)
        assert g.status_code == 200
        assert g.json().get("provincia") == expected

    def test_update_client_normalises_provincia(self, umberto_headers):
        # create a client first
        create = requests.post(f"{BASE}/api/clients", headers=umberto_headers, json={
            "ragione_sociale": "TEST_prov_update_src",
            "citta": "TEST", "zona": "", "indirizzo": "", "cap": "",
            "provincia": "MI", "giro_id": None, "position": 999,
        }, timeout=20)
        assert create.status_code == 200, create.text
        cid = create.json()["id"]
        TestProvinciaNormalization.created_ids.append(cid)

        # update with full name
        for raw, expected in (("Catanzaro", "CZ"), ("vibo valentia", "VV"),
                              ("kr", "KR"), ("Reggio Calabria", "RC")):
            r = requests.put(f"{BASE}/api/clients/{cid}", headers=umberto_headers,
                             json={"provincia": raw}, timeout=20)
            assert r.status_code == 200, r.text
            assert r.json().get("provincia") == expected, f"PUT raw={raw} -> {r.json().get('provincia')}, expected {expected}"
