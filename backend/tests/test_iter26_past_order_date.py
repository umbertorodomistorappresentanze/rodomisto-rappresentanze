"""Iter 26: orders with past activity_date (create/edit), last_order_company, recurrences with past dates."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://route-manager-126.preview.emergentagent.com").rstrip("/")
GIRO = "826d2605-6dcc-4e48-a3b2-38c833aa4fd3"
CREATED = []


@pytest.fixture(scope="module")
def h(umberto_token):
    return {"Authorization": f"Bearer {umberto_token}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup(api, umberto_token):
    yield
    hh = {"Authorization": f"Bearer {umberto_token}"}
    for eid in CREATED:
        api.delete(f"{BASE_URL}/api/events/{eid}", headers=hh)


def _companies(api, h):
    d = api.get(f"{BASE_URL}/api/companies", headers=h).json()
    d = d if isinstance(d, list) else d.get("items", d)
    by = {}
    for c in d:
        n = c["name"].lower()
        if "mazzetti" in n:
            by["mazzetti"] = c
        elif "pellegrini" in n:
            by["pellegrini"] = c
        elif n.startswith("men"):
            by["menu"] = c
    return by


def _giro_client(api, h, handled=False):
    r = api.get(f"{BASE_URL}/api/clients", params={"giro_id": GIRO}, headers=h)
    assert r.status_code == 200, r.text
    rows = r.json()
    rows = rows if isinstance(rows, list) else rows.get("items", rows)
    for c in rows:
        if not c.get("handled_this_month") and not c.get("suspensions"):
            return c
    pytest.skip("no free client in giro")


def _client_row(api, h, cid):
    rows = api.get(f"{BASE_URL}/api/clients", params={"giro_id": GIRO}, headers=h).json()
    rows = rows if isinstance(rows, list) else rows.get("items", rows)
    return next(c for c in rows if c["id"] == cid)


def _post(api, h, payload):
    r = api.post(f"{BASE_URL}/api/events", headers=h, json=payload)
    assert r.status_code in (200, 201), r.text
    ev = r.json()
    CREATED.append(ev["id"])
    return ev


class TestPastOrderDate:
    # Create order with past date -> created_at, due_at, history, list fields, not handled this month
    def test_create_past_order(self, api, h):
        comp = _companies(api, h)
        company = comp.get("pellegrini") or comp["menu"]
        cli = _giro_client(api, h)
        ev = _post(api, h, {"type": "order", "client_id": cli["id"], "company_id": company["id"],
                            "activity_date": "2026-10-27"})
        TestPastOrderDate.ev = ev
        TestPastOrderDate.cli = cli
        assert ev["created_at"].startswith("2026-10-27"), ev
        row = _client_row(api, h, cli["id"])
        assert row["last_order_at"].startswith("2026-10-27")
        assert row["last_order_company"] == company["name"]
        assert row["handled_this_month"] is False
        assert row["status"] == "da_visitare"
        hist = api.get(f"{BASE_URL}/api/clients/{cli['id']}/history", headers=h).json()
        hist = hist if isinstance(hist, list) else hist.get("items", hist.get("events", []))
        e = next(x for x in hist if x["id"] == ev["id"])
        assert e["created_at"].startswith("2026-10-27")
        # search includes last_order_company
        q = cli["ragione_sociale"][:8]
        s = api.get(f"{BASE_URL}/api/clients/search", params={"q": q}, headers=h).json()
        s = s if isinstance(s, list) else s.get("items", s)
        hit = next((x for x in s if x["id"] == cli["id"]), None)
        assert hit is not None, f"client not found by search {q}"
        assert hit.get("last_order_company") == company["name"]
        assert hit["last_order_at"].startswith("2026-10-27")
        # activities feed
        acts = api.get(f"{BASE_URL}/api/activities", params={"limit": 500}, headers=h).json()
        acts = acts if isinstance(acts, list) else acts.get("items", acts)
        a = next((x for x in acts if x.get("id") == ev["id"]), None)
        assert a is not None and a["created_at"].startswith("2026-10-27")
        TestPastOrderDate.ev = ev
        TestPastOrderDate.cli = cli

    # Edit date-only on order WITHOUT payment_mode
    def test_edit_date_only_no_payment_mode(self, api, h):
        ev = TestPastOrderDate.ev
        r = api.put(f"{BASE_URL}/api/events/{ev['id']}", headers=h, json={"activity_date": "2026-10-20"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["created_at"].startswith("2026-10-20")
        assert d["due_at"] is None
        row = _client_row(api, h, TestPastOrderDate.cli["id"])
        assert row["last_order_at"].startswith("2026-10-20")

    # Edit date with payment_mode -> due_at recalculated
    def test_edit_date_with_payment_mode_recalc_due(self, api, h):
        pms = api.get(f"{BASE_URL}/api/payment-modes", headers=h).json()
        pm = next(p for p in pms if p.get("days"))
        ev = TestPastOrderDate.ev
        r = api.put(f"{BASE_URL}/api/events/{ev['id']}", headers=h,
                    json={"activity_date": "2026-10-15", "payment_mode": pm["key"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["created_at"].startswith("2026-10-15")
        from datetime import datetime, timedelta
        c = datetime.fromisoformat(d["created_at"].replace("Z", "+00:00"))
        du = datetime.fromisoformat(d["due_at"].replace("Z", "+00:00"))
        assert du - c == timedelta(days=pm["days"])
        r = api.put(f"{BASE_URL}/api/events/{ev['id']}", headers=h, json={"activity_date": "2026-10-10"})
        d = r.json()
        c = datetime.fromisoformat(d["created_at"].replace("Z", "+00:00"))
        du = datetime.fromisoformat(d["due_at"].replace("Z", "+00:00"))
        assert d["created_at"].startswith("2026-10-10") and du - c == timedelta(days=pm["days"])

    # Today order -> handled this month (control)
    def test_today_order_is_handled(self, api, h):
        comp = _companies(api, h)
        company = comp.get("pellegrini") or comp["menu"]
        cli = TestPastOrderDate.cli
        ev = _post(api, h, {"type": "order", "client_id": cli["id"], "company_id": company["id"],
                            "activity_date": "2026-11-01"})
        row = _client_row(api, h, cli["id"])
        assert row["handled_this_month"] is True
        api.delete(f"{BASE_URL}/api/events/{ev['id']}", headers=h)
        row = _client_row(api, h, cli["id"])
        assert row["handled_this_month"] is False


class TestRecurrencePastDate:
    def _members(self, api, h):
        r = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members?period=natale", headers=h)
        assert r.status_code == 200, r.text
        return [c for g in r.json()["groups"] for c in g["clients"]]

    # Order dated inside period (Oct) counts, order_date == chosen date; Aug does not
    def test_recurrence_past_dates(self, api, h):
        comp = _companies(api, h)
        cand = next((c for c in self._members(api, h) if c["recurrence_status"] == "da_gestire"), None)
        if not cand:
            pytest.skip("no da_gestire")
        ev = _post(api, h, {"type": "order", "client_id": cand["id"], "company_id": comp["mazzetti"]["id"],
                            "activity_date": "2026-08-20"})
        m = next(c for c in self._members(api, h) if c["id"] == cand["id"])
        assert m["recurrence_status"] == "da_gestire", m
        api.delete(f"{BASE_URL}/api/events/{ev['id']}", headers=h)
        ev = _post(api, h, {"type": "order", "client_id": cand["id"], "company_id": comp["mazzetti"]["id"],
                            "activity_date": "2026-09-15"})
        m = next(c for c in self._members(api, h) if c["id"] == cand["id"])
        assert m["recurrence_status"] == "ordine_effettuato", m
        assert (m.get("order_date") or "").startswith("2026-09-15"), m
        # edit to Aug -> reverts
        r = api.put(f"{BASE_URL}/api/events/{ev['id']}", headers=h, json={"activity_date": "2026-08-20"})
        assert r.status_code == 200
        m = next(c for c in self._members(api, h) if c["id"] == cand["id"])
        assert m["recurrence_status"] == "da_gestire", m
        api.delete(f"{BASE_URL}/api/events/{ev['id']}", headers=h)
