"""Iter 27: POST /api/events activity_date validation (future / invalid) + valid past date persists."""
import os
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
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


@pytest.fixture(scope="module")
def ctx(api, h):
    comps = api.get(f"{BASE_URL}/api/companies", headers=h).json()
    comps = comps if isinstance(comps, list) else comps.get("items", comps)
    rows = api.get(f"{BASE_URL}/api/clients", params={"giro_id": GIRO}, headers=h).json()
    rows = rows if isinstance(rows, list) else rows.get("items", rows)
    assert comps and rows
    return {"company": comps[0], "client": rows[0]}


def _payload(ctx, date):
    return {"client_id": ctx["client"]["id"], "type": "order",
            "company_id": ctx["company"]["id"], "activity_date": date}


# Future date rejected
def test_future_date_400(api, h, ctx):
    r = api.post(f"{BASE_URL}/api/events", headers=h, json=_payload(ctx, "2026-12-15"))
    if r.status_code in (200, 201):
        CREATED.append(r.json().get("id") or r.json().get("event", {}).get("id"))
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "La data non può essere futura"


# Tomorrow rejected
def test_tomorrow_400(api, h, ctx):
    r = api.post(f"{BASE_URL}/api/events", headers=h, json=_payload(ctx, "2026-11-02"))
    if r.status_code in (200, 201):
        CREATED.append(r.json().get("id"))
    assert r.status_code == 400, r.text
    assert "futura" in r.json()["detail"]


# Garbage date rejected
def test_invalid_date_400(api, h, ctx):
    r = api.post(f"{BASE_URL}/api/events", headers=h, json=_payload(ctx, "abc"))
    if r.status_code in (200, 201):
        CREATED.append(r.json().get("id"))
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Data non valida"


# Valid past date stored
def test_past_date_ok(api, h, ctx):
    r = api.post(f"{BASE_URL}/api/events", headers=h, json=_payload(ctx, "2026-10-05"))
    assert r.status_code in (200, 201), r.text
    ev = r.json()
    ev = ev.get("event", ev)
    CREATED.append(ev["id"])
    assert str(ev["created_at"]).startswith("2026-10-0"), ev["created_at"]
