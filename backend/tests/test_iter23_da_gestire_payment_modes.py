"""Iter 23 — Giro 'Da gestire' + nuove modalità di pagamento (manuali + GooseApp field_payment)."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
API = f"{BASE_URL}/api"
PIVA = "03101400798"

EXPECTED_DAYS = {
    "bonifico_30": 30, "bonifico_60": 60, "bonifico_60_fm": 60, "bonifico_90": 90,
    "bonifico_vista_fattura": 15, "bonifico_anticipato": None,
    "agente_30": 30, "agente_60": 60,
    "pos_consegna": None, "contanti_consegna": None, "anticipato": None, "contrassegno": None,
    "rid_60": None, "riba_30": None, "riba_60": None, "riba_90": None, "rifatturazione_pac": None,
    "titolo_vista": None, "titolo_30": None, "titolo_60": None, "titolo_90": None,
}

CREATED_EVENTS = []


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_h():
    return _login("umberto", "Umberto2774!")


@pytest.fixture(scope="module")
def agent_h():
    return _login("andrea", "Andrea1606!")


@pytest.fixture(scope="module")
def company(admin_h):
    r = requests.get(f"{API}/companies", headers=admin_h, timeout=20)
    assert r.status_code == 200 and r.json()
    return r.json()[0]


@pytest.fixture(scope="module")
def ag_client(admin_h):
    r = requests.get(f"{API}/clients/all", headers=admin_h, timeout=60)
    assert r.status_code == 200, r.text
    for c in r.json():
        piva = ((c.get("extra") or {}).get("partita_iva") or "").replace("IT", "").strip()
        if piva == PIVA:
            return c
    pytest.skip("Cliente P.IVA 03101400798 non trovato")


def _parse(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# --- Payment modes catalogue ---
class TestPaymentModes:
    def test_list_21_modes(self, admin_h):
        r = requests.get(f"{API}/payment-modes", headers=admin_h, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 21, [d["key"] for d in data]
        got = {d["key"]: d["days"] for d in data}
        assert got == EXPECTED_DAYS
        assert all(d.get("label") for d in data)


# --- Manual order events: due_at by payment mode ---
class TestManualOrderDue:
    @pytest.mark.parametrize("mode,days", [
        ("riba_60", None), ("agente_60", 60), ("bonifico_vista_fattura", 15),
        ("titolo_30", None), ("bonifico_anticipato", None), ("bonifico_60_fm", 60),
        ("contanti_consegna", None),
    ])
    def test_order_due(self, admin_h, company, ag_client, mode, days):
        act = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        r = requests.post(f"{API}/events", headers=admin_h, timeout=20, json={
            "client_id": ag_client["id"], "type": "order", "company_id": company["id"],
            "payment_mode": mode, "activity_date": act})
        assert r.status_code == 200, r.text
        ev = r.json()
        CREATED_EVENTS.append(ev["id"])
        assert ev["payment_mode"] == mode
        if days is None:
            assert ev["due_at"] is None
        else:
            assert ev["due_at"] is not None
            delta = _parse(ev["due_at"]) - _parse(ev["created_at"])
            assert delta == timedelta(days=days), delta

    def test_invalid_mode_400(self, admin_h, company, ag_client):
        r = requests.post(f"{API}/events", headers=admin_h, timeout=20, json={
            "client_id": ag_client["id"], "type": "order", "company_id": company["id"], "payment_mode": "xxx"})
        assert r.status_code == 400


# --- GooseApp sync with field_payment mapping ---
class TestGooseFieldPayment:
    CASES = [
        ("Bonifico bancario 30 gg", "bonifico_30", 30),
        ("Contanti alla consegna", "contanti_consegna", None),
        ("Ri.Ba. 60 gg", "riba_60", None),
        ("Rimessa diretta 60 giorni mezzo agente", "agente_60", 60),
        ("Bonifico bancario 60 gg fine mese", "bonifico_60_fm", 60),
        ("Bonifico vista fattura", "bonifico_vista_fattura", 15),
        ("Titolo allo scarico 90 giorni", "titolo_90", None),
        ("R.I.D. 60 gg", "rid_60", None),
        ("Bonifico bancario anticipato", "bonifico_anticipato", None),
        ("POS alla consegna", "pos_consegna", None),
    ]

    def test_sync(self, admin_h, agent_h, ag_client):
        orig = requests.get(f"{API}/goose/config", headers=admin_h, timeout=20).json()
        try:
            r = requests.put(f"{API}/goose/config", headers=admin_h, timeout=20, json={
                "orders_table": "DOC_TES", "field_piva": "COPIV", "field_number": "DTNUM",
                "field_date": "DTDAT", "field_payment": "PAG", "field_order_id": "RECORD_ID"})
            assert r.status_code == 200 and r.json()["field_payment"] == "PAG"
            # agent cannot use mock_records
            r = requests.post(f"{API}/goose/sync", headers=agent_h, json={"mock_records": []}, timeout=30)
            assert r.status_code == 403
            tag = uuid.uuid4().hex[:6]
            day = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d")
            recs, nums = [], {}
            for i, (txt, mode, days) in enumerate(self.CASES):
                num = f"9{tag[:3]}{i}"
                nums[num] = (txt, mode, days)
                recs.append({"RECORD_ID": f"__Q{tag}_{i}", "COPIV": PIVA, "DTNUM": num, "DTDAT": day, "PAG": txt})
            r = requests.post(f"{API}/goose/sync", headers=admin_h, json={"mock_records": recs}, timeout=60)
            assert r.status_code == 200, r.text
            res = r.json()
            assert res["imported"] == len(recs), res
            # dedupe on re-sync
            r2 = requests.post(f"{API}/goose/sync", headers=admin_h, json={"mock_records": recs[:1]}, timeout=60)
            assert r2.json()["skipped_duplicates"] == 1
            h = requests.get(f"{API}/clients/{ag_client['id']}/history", headers=admin_h, timeout=30).json()
            evs = h if isinstance(h, list) else (h.get("events") or h.get("items") or [])
            found = {}
            for e in evs:
                if e.get("order_number") in nums and e.get("source", "gooseapp") == "gooseapp":
                    found[e["order_number"]] = e
                    CREATED_EVENTS.append(e["id"])
            errs = []
            for num, (txt, mode, days) in nums.items():
                e = found.get(num)
                if not e:
                    errs.append(f"{txt}: evento non trovato")
                    continue
                if e.get("payment_mode") != mode:
                    errs.append(f"{txt}: mode {e.get('payment_mode')} != {mode}")
                if days is None and e.get("due_at") is not None:
                    errs.append(f"{txt}: due_at atteso null, got {e.get('due_at')}")
                if days is not None:
                    if not e.get("due_at"):
                        errs.append(f"{txt}: due_at mancante")
                    elif _parse(e["due_at"]) - _parse(e["created_at"]) != timedelta(days=days):
                        errs.append(f"{txt}: delta {_parse(e['due_at']) - _parse(e['created_at'])}")
            assert not errs, errs
        finally:
            restore = {k: orig.get(k, "") for k in ("orders_table", "field_piva", "field_number", "field_date",
                                                     "field_payment", "field_order_id")}
            restore["field_payment"] = ""
            requests.put(f"{API}/goose/config", headers=admin_h, json=restore, timeout=20)


# --- Giro status counts (Clienti = Da gestire + Gestiti) ---
class TestGiroStatus:
    def test_counts_consistent(self, admin_h):
        giri = requests.get(f"{API}/giri", headers=admin_h, timeout=20).json()
        g = giri[0]
        cl = requests.get(f"{API}/clients?giro_id={g['id']}", headers=admin_h, timeout=60).json()
        st = {c["status"] for c in cl}
        assert st <= {"da_visitare", "gestito"}, st
        dv = sum(1 for c in cl if c["status"] == "da_visitare")
        assert dv + sum(1 for c in cl if c["status"] == "gestito") == len(cl)


def test_zz_cleanup(admin_h):
    failed = []
    for eid in CREATED_EVENTS:
        r = requests.delete(f"{API}/events/{eid}", headers=admin_h, timeout=20)
        if r.status_code not in (200, 204, 404):
            failed.append((eid, r.status_code))
    final = requests.get(f"{API}/goose/config", headers=admin_h, timeout=20).json()
    assert final["field_payment"] == ""
    assert not failed, failed
