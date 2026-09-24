"""Pre-deployment regression suite (iteration 5).

Covers:
- GET /health (top-level, no /api prefix) -> 200 {"status": "ok"}
- Auth for both umberto (admin) and andrea (agent) + /api/auth/me role.
- Permissions: andrea sees only own clients; giro order preserved (invariant).
- Recurrences invariant: 2 aziende (mazzetti, bonfissuto) with members; order/undo works.
- Orders: POST /api/events type=order with company_id + payment_mode.
    * agente_60 -> due_at = created_at + 60 days, payment_mode_label present.
    * anticipato / contrassegno -> due_at is None.
- Sospesi: manual suspension exposes 'suspensions' on GET /api/clients;
           collection for same company clears the suspension; overdue deferred
           order auto-generates a suspension.
- /api/payment-modes returns 7 modes in canonical order.
"""
import os
import time
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://route-manager-126.preview.emergentagent.com").rstrip("/")

LOCAL_BACKEND = "http://localhost:8001"

# Track created events per client for cleanup at end.
_CREATED_EVENTS: dict[str, list[str]] = {}


def _record(client_id: str, event_id: str):
    _CREATED_EVENTS.setdefault(client_id, []).append(event_id)


# ---------------------------------------------------------------------------
# /health (top-level)
# ---------------------------------------------------------------------------
def test_health_local_backend():
    """Deployment probe hits the pod directly, not through /api ingress."""
    r = requests.get(f"{LOCAL_BACKEND}/health", timeout=10)
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "ok"}


def test_api_health_not_required():
    """/api/health must NOT be required to exist. If exposed, 404 is acceptable."""
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    # only assertion: not 5xx
    assert r.status_code < 500, r.text


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def test_login_umberto_admin(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "umberto", "password": "Umberto2774!"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["role"] == "admin"
    assert body["access_token"]
    me = api.get(f"{BASE_URL}/api/auth/me",
                 headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "admin"
    assert me.json()["username"] == "umberto"


def test_login_andrea_agent(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "andrea", "password": "Andrea1606!"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["role"] == "agent"
    me = api.get(f"{BASE_URL}/api/auth/me",
                 headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "agent"


# ---------------------------------------------------------------------------
# Permissions & Giri invariance
# ---------------------------------------------------------------------------
def test_giri_listing_invariant(api, umberto_headers):
    r = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers)
    assert r.status_code == 200
    giri = r.json()
    assert len(giri) >= 1
    # order attribute should be present and sorted ascending
    orders = [g["order"] for g in giri]
    assert orders == sorted(orders)
    # each giro carries a localities list (ordered)
    for g in giri:
        assert isinstance(g.get("localities"), list)


def test_andrea_sees_only_own_clients(api, andrea_headers, umberto_headers):
    giri = api.get(f"{BASE_URL}/api/giri", headers=andrea_headers).json()
    assert giri, "No giri visible"
    # For each giro, all clients returned must be assigned to andrea
    total = 0
    for g in giri:
        r = api.get(f"{BASE_URL}/api/clients", params={"giro_id": g["id"]},
                    headers=andrea_headers)
        assert r.status_code == 200
        for c in r.json():
            assert c.get("agent") == "andrea", c
            total += 1
    # Andrea should have at least a handful of clients across giri (dataset size).
    assert total > 0


# ---------------------------------------------------------------------------
# Recurrences invariance
# ---------------------------------------------------------------------------
def test_recurrences_two_aziende_with_members(api, umberto_headers):
    r = api.get(f"{BASE_URL}/api/recurrences", headers=umberto_headers)
    assert r.status_code == 200
    defs = r.json()
    keys = sorted(d["company"] for d in defs)
    assert keys == ["bonfissuto", "mazzetti"], keys
    # members endpoint returns groups with clients
    m = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                params={"period": "natale"}, headers=umberto_headers).json()
    assert m["company"] == "mazzetti"
    total = sum(len(g["clients"]) for g in m["groups"])
    assert total >= 40  # expected ~51


def test_recurrence_order_and_undo(api, umberto_headers):
    m = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                params={"period": "natale"}, headers=umberto_headers).json()
    # pick any da-gestire client
    target = None
    for g in m["groups"]:
        for c in g["clients"]:
            if c["recurrence_status"] == "da_gestire":
                target = c
                break
        if target:
            break
    assert target, "No da-gestire recurrence client available"
    # POST order
    r = api.post(f"{BASE_URL}/api/recurrences/mazzetti/order",
                 json={"client_id": target["id"], "period": "natale"},
                 headers=umberto_headers)
    assert r.status_code == 200, r.text
    # verify status flipped
    m2 = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                 params={"period": "natale"}, headers=umberto_headers).json()
    flat = {c["id"]: c for g in m2["groups"] for c in g["clients"]}
    assert flat[target["id"]]["recurrence_status"] == "ordine_effettuato"
    # UNDO
    u = api.post(f"{BASE_URL}/api/recurrences/mazzetti/order/undo",
                 json={"client_id": target["id"], "period": "natale"},
                 headers=umberto_headers)
    assert u.status_code == 200
    m3 = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                 params={"period": "natale"}, headers=umberto_headers).json()
    flat3 = {c["id"]: c for g in m3["groups"] for c in g["clients"]}
    assert flat3[target["id"]]["recurrence_status"] == "da_gestire"


# ---------------------------------------------------------------------------
# Payment modes
# ---------------------------------------------------------------------------
def test_payment_modes_seven(api, umberto_headers):
    r = api.get(f"{BASE_URL}/api/payment-modes", headers=umberto_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 8
    keys = [m["key"] for m in data]
    assert keys == ["anticipato", "contrassegno", "bonifico_30", "bonifico_60",
                    "agente_30", "agente_60", "agente_90", "rifatturazione_pac"]
    # anticipato / contrassegno -> days None
    dmap = {m["key"]: m for m in data}
    assert dmap["anticipato"]["days"] is None
    assert dmap["contrassegno"]["days"] is None
    assert dmap["agente_60"]["days"] == 60


# ---------------------------------------------------------------------------
# Orders w/ payment mode -> due_at
# ---------------------------------------------------------------------------
def _pick_admin_client(api, headers):
    giri = api.get(f"{BASE_URL}/api/giri", headers=headers).json()
    for g in giri:
        cs = api.get(f"{BASE_URL}/api/clients", params={"giro_id": g["id"]},
                     headers=headers).json()
        if cs:
            return cs[0]
    raise AssertionError("No client available for umberto")


def _pick_company(api, headers, index: int = 0):
    comps = api.get(f"{BASE_URL}/api/companies", headers=headers).json()
    assert comps
    return comps[index]


def test_order_agente_60_generates_due_at_plus_60(api, umberto_headers):
    cli = _pick_admin_client(api, umberto_headers)
    comp = _pick_company(api, umberto_headers)
    r = api.post(f"{BASE_URL}/api/events",
                 json={"client_id": cli["id"], "type": "order",
                       "company_id": comp["id"], "payment_mode": "agente_60"},
                 headers=umberto_headers)
    assert r.status_code == 200, r.text
    ev = r.json()
    _record(cli["id"], ev["id"])
    assert ev["payment_mode"] == "agente_60"
    assert ev["payment_mode_label"] == "Pagamento mezzo Agente 60 giorni"
    assert ev["due_at"], "due_at missing"
    created = datetime.fromisoformat(ev["created_at"].replace("Z", "+00:00"))
    due = datetime.fromisoformat(ev["due_at"].replace("Z", "+00:00"))
    delta = due - created
    # allow 1s drift
    assert timedelta(days=60) - timedelta(seconds=2) <= delta <= timedelta(days=60) + timedelta(seconds=2), delta


def test_order_anticipato_no_due_at(api, umberto_headers):
    cli = _pick_admin_client(api, umberto_headers)
    comp = _pick_company(api, umberto_headers)
    r = api.post(f"{BASE_URL}/api/events",
                 json={"client_id": cli["id"], "type": "order",
                       "company_id": comp["id"], "payment_mode": "anticipato"},
                 headers=umberto_headers)
    assert r.status_code == 200, r.text
    ev = r.json()
    _record(cli["id"], ev["id"])
    assert ev["payment_mode"] == "anticipato"
    assert ev["due_at"] is None


def test_order_contrassegno_no_due_at(api, umberto_headers):
    cli = _pick_admin_client(api, umberto_headers)
    comp = _pick_company(api, umberto_headers)
    r = api.post(f"{BASE_URL}/api/events",
                 json={"client_id": cli["id"], "type": "order",
                       "company_id": comp["id"], "payment_mode": "contrassegno"},
                 headers=umberto_headers)
    assert r.status_code == 200, r.text
    ev = r.json()
    _record(cli["id"], ev["id"])
    assert ev["due_at"] is None


# ---------------------------------------------------------------------------
# Sospesi
# ---------------------------------------------------------------------------
def test_suspension_and_collection_full_cycle(api, umberto_headers):
    cli = _pick_admin_client(api, umberto_headers)
    comp = _pick_company(api, umberto_headers)

    # Ensure baseline (no active suspension for this company); if any, clear it first
    # by issuing a collection.
    pre = api.get(f"{BASE_URL}/api/clients", params={"giro_id": cli["giro_id"]},
                  headers=umberto_headers).json()
    pre_row = next((c for c in pre if c["id"] == cli["id"]), None)
    if pre_row and comp["name"] in (pre_row.get("suspensions") or []):
        clr = api.post(f"{BASE_URL}/api/events",
                       json={"client_id": cli["id"], "type": "collection",
                             "company_id": comp["id"]},
                       headers=umberto_headers)
        assert clr.status_code == 200
        _record(cli["id"], clr.json()["id"])

    # Create suspension
    s = api.post(f"{BASE_URL}/api/events",
                 json={"client_id": cli["id"], "type": "suspension",
                       "company_id": comp["id"]},
                 headers=umberto_headers)
    assert s.status_code == 200, s.text
    _record(cli["id"], s.json()["id"])

    # It should appear in /api/clients suspensions
    rows = api.get(f"{BASE_URL}/api/clients", params={"giro_id": cli["giro_id"]},
                   headers=umberto_headers).json()
    row = next(c for c in rows if c["id"] == cli["id"])
    assert comp["name"] in (row.get("suspensions") or []), row.get("suspensions")

    # Collection closes the suspension for the same company
    time.sleep(1.1)  # ensure created_at strictly greater than suspension
    c2 = api.post(f"{BASE_URL}/api/events",
                  json={"client_id": cli["id"], "type": "collection",
                        "company_id": comp["id"]},
                  headers=umberto_headers)
    assert c2.status_code == 200, c2.text
    _record(cli["id"], c2.json()["id"])

    rows2 = api.get(f"{BASE_URL}/api/clients", params={"giro_id": cli["giro_id"]},
                    headers=umberto_headers).json()
    row2 = next(c for c in rows2 if c["id"] == cli["id"])
    assert comp["name"] not in (row2.get("suspensions") or []), row2.get("suspensions")


def test_overdue_deferred_order_auto_suspension(api, umberto_headers):
    """A deferred order (payment_mode with days) whose due_at is past creates
    an automatic suspension exposed via /api/clients (single-client giro row).

    We cannot easily force created_at to the past through the API, so we
    fabricate the past-order event directly in Mongo via the mongo shell CLI.
    If mongo CLI is unavailable, skip.
    """
    import shutil
    mongosh = shutil.which("mongosh") or shutil.which("mongo")
    if not mongosh:
        import pytest
        pytest.skip("mongosh not available")

    cli = _pick_admin_client(api, umberto_headers)
    comp = _pick_company(api, umberto_headers, index=1)  # different from cycle test

    # Insert a past-due order directly.
    from uuid import uuid4
    event_id = str(uuid4())
    past = datetime.now(timezone.utc) - timedelta(days=90)
    due = datetime.now(timezone.utc) - timedelta(days=30)
    import subprocess
    js = f"""
    db.events.insertOne({{
      id: "{event_id}",
      client_id: "{cli['id']}",
      type: "order",
      company_id: "{comp['id']}",
      company_name: "{comp['name']}",
      note_text: null,
      reschedule_until: null,
      payment_mode: "agente_60",
      due_at: ISODate("{due.isoformat().replace('+00:00','Z')}"),
      source: null,
      agent: "umberto",
      created_at: ISODate("{past.isoformat().replace('+00:00','Z')}"),
      deleted_at: null
    }})
    """
    import os as _os
    db_name = _os.environ.get("DB_NAME", "test_database")
    mongo_url = _os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    subprocess.run([mongosh, f"{mongo_url}/{db_name}", "--quiet", "--eval", js],
                   check=True, capture_output=True, timeout=15)
    _record(cli["id"], event_id)

    # Now the client row should expose the automatic suspension.
    rows = api.get(f"{BASE_URL}/api/clients", params={"giro_id": cli["giro_id"]},
                   headers=umberto_headers).json()
    row = next(c for c in rows if c["id"] == cli["id"])
    assert comp["name"] in (row.get("suspensions") or []), row.get("suspensions")

    # A collection closes it.
    time.sleep(1.1)
    c2 = api.post(f"{BASE_URL}/api/events",
                  json={"client_id": cli["id"], "type": "collection",
                        "company_id": comp["id"]},
                  headers=umberto_headers)
    assert c2.status_code == 200
    _record(cli["id"], c2.json()["id"])
    rows2 = api.get(f"{BASE_URL}/api/clients", params={"giro_id": cli["giro_id"]},
                    headers=umberto_headers).json()
    row2 = next(c for c in rows2 if c["id"] == cli["id"])
    assert comp["name"] not in (row2.get("suspensions") or [])


# ---------------------------------------------------------------------------
# Cleanup (runs after all tests in this module)
# ---------------------------------------------------------------------------
def test_zz_cleanup_created_events():
    """Soft-delete every event we created (by mongo update). Uses mongosh if
    available; otherwise leaves data (documented in report)."""
    if not _CREATED_EVENTS:
        return
    import shutil, subprocess, os as _os
    mongosh = shutil.which("mongosh") or shutil.which("mongo")
    if not mongosh:
        return  # cannot clean; not fatal
    ids = [eid for lst in _CREATED_EVENTS.values() for eid in lst]
    if not ids:
        return
    js = f'db.events.updateMany({{id: {{$in: {ids!r}}}}}, {{$set: {{deleted_at: new Date()}}}})'
    js = js.replace("'", '"')
    db_name = _os.environ.get("DB_NAME", "test_database")
    mongo_url = _os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    subprocess.run([mongosh, f"{mongo_url}/{db_name}", "--quiet", "--eval", js],
                   check=False, capture_output=True, timeout=15)
