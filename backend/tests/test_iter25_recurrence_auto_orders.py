"""Iter 25: Recurrence periods + auto 'Gestiti' via real brand orders; suspension flags."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://route-manager-126.preview.emergentagent.com").rstrip("/")

CREATED = []


def _companies(api, h):
    r = api.get(f"{BASE_URL}/api/companies", headers=h)
    r.raise_for_status()
    d = r.json()
    d = d if isinstance(d, list) else d.get("items", d)
    by = {}
    for c in d:
        n = c["name"].lower()
        if "mazzetti" in n:
            by["mazzetti"] = c["id"]
        elif "bonfissuto" in n:
            by["bonfissuto"] = c["id"]
        elif n.startswith("men"):
            by["menu"] = c["id"]
    return by


def _members(api, h, company, period):
    r = api.get(f"{BASE_URL}/api/recurrences/{company}/members?period={period}", headers=h)
    assert r.status_code == 200, r.text
    return [c for g in r.json()["groups"] for c in g["clients"]]


def _find(api, h, company, period, cid):
    return next(c for c in _members(api, h, company, period) if c["id"] == cid)


def _first_da_gestire(api, h, company, period):
    for c in _members(api, h, company, period):
        if c["recurrence_status"] == "da_gestire":
            return c
    pytest.skip(f"no da_gestire member in {company}/{period}")


def _post_event(api, h, payload):
    r = api.post(f"{BASE_URL}/api/events", headers=h, json=payload)
    assert r.status_code in (200, 201), r.text
    ev = r.json()
    eid = ev.get("id") or ev.get("event", {}).get("id")
    CREATED.append(eid)
    return eid


def _delete_event(api, h, eid):
    r = api.delete(f"{BASE_URL}/api/events/{eid}", headers=h)
    assert r.status_code in (200, 204), r.text
    if eid in CREATED:
        CREATED.remove(eid)


@pytest.fixture(scope="module", autouse=True)
def cleanup(api, umberto_token):
    yield
    h = {"Authorization": f"Bearer {umberto_token}"}
    for eid in list(CREATED):
        api.delete(f"{BASE_URL}/api/events/{eid}", headers=h)


# Periods definitions
class TestPeriods:
    def test_period_windows(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/recurrences", headers=umberto_headers)
        assert r.status_code == 200
        by = {d["company"]: {p["key"]: (p["start"], p["end"]) for p in d["periods"]} for d in r.json()}
        assert by["mazzetti"] == {"natale": ("09-01", "12-31")}
        assert by["bonfissuto"]["pasqua"] == ("02-01", "05-31")
        assert by["bonfissuto"]["natale"] == ("09-01", "12-31")


# Real order -> auto Gestiti
class TestAutoOrder:
    @pytest.mark.parametrize("company", ["mazzetti", "bonfissuto"])
    def test_brand_order_moves_to_gestiti_and_delete_reverts(self, api, umberto_headers, company):
        comps = _companies(api, umberto_headers)
        m = _first_da_gestire(api, umberto_headers, company, "natale")
        pas_before = _find(api, umberto_headers, company, "pasqua", m["id"]) if company == "bonfissuto" else None
        eid = _post_event(api, umberto_headers, {"client_id": m["id"], "type": "order",
                                                 "company_id": comps[company], "payment_mode": "contrassegno"})
        after = _find(api, umberto_headers, company, "natale", m["id"])
        assert after["recurrence_status"] == "ordine_effettuato"
        assert after["order_auto"] is True
        assert after["order_date"]
        if company == "bonfissuto":
            # October order must NOT count for Pasqua (Feb-May)
            pas = _find(api, umberto_headers, company, "pasqua", m["id"])
            assert pas["recurrence_status"] == pas_before["recurrence_status"]
            assert pas["order_auto"] is False
        _delete_event(api, umberto_headers, eid)
        back = _find(api, umberto_headers, company, "natale", m["id"])
        assert back["recurrence_status"] == "da_gestire"
        assert back["order_auto"] is False

    def test_other_company_order_does_not_move(self, api, umberto_headers):
        comps = _companies(api, umberto_headers)
        m = _first_da_gestire(api, umberto_headers, "mazzetti", "natale")
        eid = _post_event(api, umberto_headers, {"client_id": m["id"], "type": "order",
                                                 "company_id": comps["menu"], "payment_mode": "contrassegno"})
        after = _find(api, umberto_headers, "mazzetti", "natale", m["id"])
        assert after["recurrence_status"] == "da_gestire"
        _delete_event(api, umberto_headers, eid)

    def test_order_outside_period_not_counted(self, api, umberto_headers):
        comps = _companies(api, umberto_headers)
        m = _first_da_gestire(api, umberto_headers, "mazzetti", "natale")
        eid = _post_event(api, umberto_headers, {"client_id": m["id"], "type": "order",
                                                 "company_id": comps["mazzetti"], "payment_mode": "contrassegno",
                                                 "activity_date": "2026-08-15"})
        after = _find(api, umberto_headers, "mazzetti", "natale", m["id"])
        assert after["recurrence_status"] == "da_gestire"
        _delete_event(api, umberto_headers, eid)

    def test_manual_order_and_undo(self, api, umberto_headers):
        m = _first_da_gestire(api, umberto_headers, "mazzetti", "natale")
        r = api.post(f"{BASE_URL}/api/recurrences/mazzetti/order", headers=umberto_headers,
                     json={"client_id": m["id"], "period": "natale"})
        assert r.status_code == 200 and r.json()["ok"] is True
        after = _find(api, umberto_headers, "mazzetti", "natale", m["id"])
        assert after["recurrence_status"] == "ordine_effettuato"
        assert after["order_auto"] is False
        r = api.post(f"{BASE_URL}/api/recurrences/mazzetti/order/undo", headers=umberto_headers,
                     json={"client_id": m["id"], "period": "natale"})
        assert r.status_code == 200
        back = _find(api, umberto_headers, "mazzetti", "natale", m["id"])
        assert back["recurrence_status"] == "da_gestire"
