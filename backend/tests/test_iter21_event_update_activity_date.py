"""
Iter 21 — PUT /api/events/{id} must accept {payment_mode, activity_date}
and recalc due_at = activity_date + PAYMENT_MODES[mode].days.
Also smoke-tests on companies / client history endpoints used by the FE flow.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://route-manager-126.preview.emergentagent.com",
).rstrip("/")


# ---------- helpers ----------

def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _parse_iso(s: str) -> datetime:
    # tolerant parser for ISO strings coming from backend (with/without Z)
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


@pytest.fixture(scope="module")
def ctx(api, umberto_token):
    headers = _h(umberto_token)
    r = api.get(f"{BASE_URL}/api/companies", headers=headers)
    r.raise_for_status()
    companies = r.json()
    assert len(companies) > 0, "no companies in DB"
    # pick first non-test company
    main_co = next(c for c in companies if not c["name"].startswith("__TEST"))
    test_cos = [c for c in companies if c["name"].startswith("__TEST")]

    # Need at least one client to attach the order to. Pick any admin client.
    r = api.get(f"{BASE_URL}/api/clients/all", headers=headers)
    r.raise_for_status()
    clients = r.json()
    assert len(clients) > 0, "no clients in DB"
    client = clients[0]

    created_event_ids: list[str] = []
    yield {
        "headers": headers,
        "companies": companies,
        "test_companies": test_cos,
        "main_company": main_co,
        "client": client,
        "created_event_ids": created_event_ids,
    }
    # teardown — delete only events we created
    for eid in created_event_ids:
        try:
            api.delete(f"{BASE_URL}/api/events/{eid}", headers=headers)
        except Exception:
            pass


# ---------- tests ----------

class TestCompaniesList:
    """Companies endpoint used by the three pickers (order/collection/suspension)."""

    def test_companies_min_count(self, ctx):
        """The feature spec says ~28 companies incl. 12 __TEST ones for scroll."""
        assert len(ctx["companies"]) >= 20, f"too few companies: {len(ctx['companies'])}"

    def test_companies_test_entries_present(self, ctx):
        """12 __TEST Azienda N companies should exist to force a scrollable list."""
        assert len(ctx["test_companies"]) >= 10, (
            f"expected ~12 __TEST companies, got {len(ctx['test_companies'])}"
        )

    def test_companies_shape(self, ctx):
        c = ctx["companies"][0]
        assert "id" in c and "name" in c
        # No raw mongo _id leaking
        assert "_id" not in c


class TestPaymentModes:
    def test_payment_modes_contain_vista_fattura(self, api, umberto_token):
        r = api.get(f"{BASE_URL}/api/payment-modes", headers=_h(umberto_token))
        assert r.status_code == 200
        modes = {m["key"]: m for m in r.json()}
        assert "bonifico_vista_fattura" in modes
        assert modes["bonifico_vista_fattura"]["days"] == 15
        assert "bonifico_30" in modes and modes["bonifico_30"]["days"] == 30


class TestUpdateOrderActivityDate:
    """Core of the spec: PUT /events/{id} with activity_date + payment_mode
    must recalc created_at and due_at."""

    def _create_order(self, api, ctx, company_id: str, payment_mode: str, activity_date: str | None = None):
        body = {
            "client_id": ctx["client"]["id"],
            "type": "order",
            "company_id": company_id,
            "payment_mode": payment_mode,
        }
        if activity_date:
            body["activity_date"] = activity_date
        r = api.post(f"{BASE_URL}/api/events", headers=ctx["headers"], json=body)
        assert r.status_code == 200, r.text
        ev = r.json()
        ctx["created_event_ids"].append(ev["id"])
        return ev

    def test_update_order_recalc_due_at_vista_fattura(self, api, ctx):
        # Create order TODAY with bonifico_30, then update to bonifico_vista_fattura (15d) and date=5 days ago.
        today = datetime.now(timezone.utc).date()
        five_days_ago = (today - timedelta(days=5)).isoformat()

        ev = self._create_order(api, ctx, ctx["main_company"]["id"], "bonifico_30")
        assert ev["type"] == "order"
        assert ev["payment_mode"] == "bonifico_30"

        r = api.put(
            f"{BASE_URL}/api/events/{ev['id']}",
            headers=ctx["headers"],
            json={"payment_mode": "bonifico_vista_fattura", "activity_date": five_days_ago},
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["payment_mode"] == "bonifico_vista_fattura"

        # Verify created_at reflects new activity date (Rome noon)
        new_created = _parse_iso(updated["created_at"]).astimezone(timezone.utc).date()
        assert new_created == (today - timedelta(days=5)), (
            f"created_at date {new_created} != {today - timedelta(days=5)}"
        )

        # Verify due_at = created_at + 15 days
        due = _parse_iso(updated["due_at"]).astimezone(timezone.utc).date()
        expected_due = new_created + timedelta(days=15)
        assert due == expected_due, f"due_at {due} != {expected_due}"

    def test_update_order_recalc_due_at_bonifico_30(self, api, ctx):
        today = datetime.now(timezone.utc).date()
        ten_days_ago = (today - timedelta(days=10)).isoformat()

        ev = self._create_order(api, ctx, ctx["main_company"]["id"], "bonifico_vista_fattura")
        r = api.put(
            f"{BASE_URL}/api/events/{ev['id']}",
            headers=ctx["headers"],
            json={"payment_mode": "bonifico_30", "activity_date": ten_days_ago},
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["payment_mode"] == "bonifico_30"
        new_created = _parse_iso(updated["created_at"]).astimezone(timezone.utc).date()
        assert new_created == (today - timedelta(days=10))
        due = _parse_iso(updated["due_at"]).astimezone(timezone.utc).date()
        assert due == new_created + timedelta(days=30)

    def test_update_only_date_keeps_mode_and_recalcs(self, api, ctx):
        """Changing only activity_date must still recompute due_at."""
        today = datetime.now(timezone.utc).date()
        three_ago = (today - timedelta(days=3)).isoformat()

        ev = self._create_order(api, ctx, ctx["main_company"]["id"], "bonifico_vista_fattura")
        r = api.put(
            f"{BASE_URL}/api/events/{ev['id']}",
            headers=ctx["headers"],
            json={"activity_date": three_ago},
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["payment_mode"] == "bonifico_vista_fattura"
        new_created = _parse_iso(updated["created_at"]).astimezone(timezone.utc).date()
        assert new_created == (today - timedelta(days=3))
        due = _parse_iso(updated["due_at"]).astimezone(timezone.utc).date()
        assert due == new_created + timedelta(days=15)

    def test_update_persists_in_history(self, api, ctx):
        today = datetime.now(timezone.utc).date()
        seven_ago = (today - timedelta(days=7)).isoformat()

        ev = self._create_order(api, ctx, ctx["main_company"]["id"], "bonifico_30")
        r = api.put(
            f"{BASE_URL}/api/events/{ev['id']}",
            headers=ctx["headers"],
            json={"payment_mode": "bonifico_vista_fattura", "activity_date": seven_ago},
        )
        assert r.status_code == 200

        # GET history and verify event appears with new values
        r = api.get(
            f"{BASE_URL}/api/clients/{ctx['client']['id']}/history",
            headers=ctx["headers"],
        )
        assert r.status_code == 200
        hist = r.json()
        matched = [h for h in hist if h.get("id") == ev["id"]]
        assert matched, "event not found in client history after update"
        h = matched[0]
        assert h["payment_mode"] == "bonifico_vista_fattura"
        hc = _parse_iso(h["created_at"]).astimezone(timezone.utc).date()
        assert hc == (today - timedelta(days=7))
        hd = _parse_iso(h["due_at"]).astimezone(timezone.utc).date()
        assert hd == hc + timedelta(days=15)


class TestUpdateInvalidPayload:
    def test_invalid_payment_mode_rejected(self, api, ctx):
        # create then try invalid mode
        body = {
            "client_id": ctx["client"]["id"],
            "type": "order",
            "company_id": ctx["main_company"]["id"],
            "payment_mode": "bonifico_30",
        }
        r = api.post(f"{BASE_URL}/api/events", headers=ctx["headers"], json=body)
        assert r.status_code == 200
        eid = r.json()["id"]
        ctx["created_event_ids"].append(eid)
        r = api.put(
            f"{BASE_URL}/api/events/{eid}",
            headers=ctx["headers"],
            json={"payment_mode": "not_a_real_mode"},
        )
        assert r.status_code == 400

    def test_empty_payload_rejected(self, api, ctx):
        body = {
            "client_id": ctx["client"]["id"],
            "type": "order",
            "company_id": ctx["main_company"]["id"],
            "payment_mode": "bonifico_30",
        }
        r = api.post(f"{BASE_URL}/api/events", headers=ctx["headers"], json=body)
        assert r.status_code == 200
        eid = r.json()["id"]
        ctx["created_event_ids"].append(eid)
        r = api.put(f"{BASE_URL}/api/events/{eid}", headers=ctx["headers"], json={})
        assert r.status_code == 400
