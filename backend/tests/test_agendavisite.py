"""Complete backend test suite for AgendaVisite."""
import os
import time
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://route-manager-126.preview.emergentagent.com").rstrip("/")


# ===================== AUTH =====================
class TestAuth:
    def test_login_umberto(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"username": "umberto", "password": "Umberto2026!"})
        assert r.status_code == 200
        j = r.json()
        assert "access_token" in j
        assert j["user"]["username"] == "umberto"
        assert j["user"]["display_name"] == "Umberto Rodomisto"

    def test_login_andrea(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"username": "andrea", "password": "Andrea2026!"})
        assert r.status_code == 200
        assert r.json()["user"]["username"] == "andrea"

    def test_login_wrong_password(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"username": "umberto", "password": "wrong"})
        assert r.status_code == 401

    def test_login_unknown_user(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"username": "nobody", "password": "x"})
        assert r.status_code == 401

    def test_me_valid(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/auth/me", headers=umberto_headers)
        assert r.status_code == 200
        assert r.json()["username"] == "umberto"

    def test_me_no_token(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me",
                    headers={"Authorization": "Bearer garbage"})
        assert r.status_code == 401


# ===================== GIRI =====================
class TestGiri:
    def test_list_giri(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers)
        assert r.status_code == 200
        giri = r.json()
        assert len(giri) == 7
        # sorted by order
        orders = [g["order"] for g in giri]
        assert orders == sorted(orders)
        for g in giri:
            assert "localities" in g and isinstance(g["localities"], list)
        # Locality counts
        by_name = {g["name"]: g for g in giri}
        # Fuzzy locate
        lam = next((g for g in giri if "Lamezia" in g["name"] and "Vibo" in g["name"]), None)
        vibo = next((g for g in giri if g["name"].startswith("Vibo Valentia") and "Ricadi" in g["name"]), None)
        assert lam is not None, f"Missing Lamezia→Vibo giro: {list(by_name)}"
        assert vibo is not None, f"Missing Vibo→Ricadi giro: {list(by_name)}"
        # Lamezia → Vibo must include Rombiolo & Nicotera; Joppolo only here.
        assert "Rombiolo" in lam["localities"]
        assert "Nicotera" in lam["localities"]
        assert "Joppolo" in lam["localities"]
        # Vibo → Ricadi should NOT contain Vibo Valentia and must not have Joppolo.
        assert "Vibo Valentia" not in vibo["localities"]
        assert "Joppolo" not in vibo["localities"]
        assert len(vibo["localities"]) >= 8

    def test_update_giro(self, api, umberto_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        g = giri[0]
        new_locs = list(reversed(g["localities"]))
        r = api.put(f"{BASE_URL}/api/giri/{g['id']}",
                    json={"localities": new_locs, "name": g["name"]},
                    headers=umberto_headers)
        assert r.status_code == 200
        # Verify
        giri2 = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        g2 = next(x for x in giri2 if x["id"] == g["id"])
        assert g2["localities"] == new_locs
        # Restore
        api.put(f"{BASE_URL}/api/giri/{g['id']}",
                json={"localities": g["localities"]}, headers=umberto_headers)


# ===================== COMPANIES =====================
class TestCompanies:
    def test_list_companies(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/companies", headers=umberto_headers)
        assert r.status_code == 200
        comps = r.json()
        assert len(comps) == 16
        assert all(c["active"] for c in comps)

    def test_create_and_deactivate(self, api, umberto_headers):
        name = f"TEST_COMPANY_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/companies",
                     json={"name": name}, headers=umberto_headers)
        assert r.status_code == 200
        cid = r.json()["id"]
        # Deactivate
        r2 = api.put(f"{BASE_URL}/api/companies/{cid}",
                     json={"active": False}, headers=umberto_headers)
        assert r2.status_code == 200
        assert r2.json()["active"] is False
        # Not in default list
        active = api.get(f"{BASE_URL}/api/companies", headers=umberto_headers).json()
        assert not any(c["id"] == cid for c in active)
        # In include_inactive list
        allc = api.get(f"{BASE_URL}/api/companies?include_inactive=true",
                       headers=umberto_headers).json()
        assert any(c["id"] == cid for c in allc)


# ===================== CLIENTS =====================
class TestClients:
    def test_list_clients_by_giro(self, api, umberto_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        g = giri[0]
        r = api.get(f"{BASE_URL}/api/clients?giro_id={g['id']}", headers=umberto_headers)
        assert r.status_code == 200
        clients = r.json()
        for c in clients:
            assert c["giro_id"] == g["id"]
            assert c["agent"] == "umberto"
            assert "status" in c and c["status"] in ("da_visitare", "gestito")
            assert "handled_today" in c
        # Sorted by position then name
        positions = [(c["position"] if c.get("position") is not None else 999,
                      c["ragione_sociale"].lower()) for c in clients]
        assert positions == sorted(positions)

    def test_da_verificare(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/clients/da-verificare", headers=umberto_headers)
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)
        for d in docs:
            assert d["giro_id"] is None
            assert d["agent"] == "umberto"

    def test_data_isolation(self, api, umberto_headers, andrea_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        g = giri[0]
        u = api.get(f"{BASE_URL}/api/clients?giro_id={g['id']}",
                    headers=umberto_headers).json()
        a = api.get(f"{BASE_URL}/api/clients?giro_id={g['id']}",
                    headers=andrea_headers).json()
        u_ids = {c["id"] for c in u}
        a_ids = {c["id"] for c in a}
        assert u_ids.isdisjoint(a_ids)

    def test_create_client_assigned_to_agent(self, api, umberto_headers):
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": "TEST_Client_XYZ", "citta": "TestCity"},
                     headers=umberto_headers)
        assert r.status_code == 200
        c = r.json()
        assert c["agent"] == "umberto"
        assert c["giro_id"] is None
        # cleanup skipped (no delete endpoint), but flagged as TEST_

    def test_update_client_assign_giro_and_note(self, api, umberto_headers):
        # Get a da-verificare client
        dv = api.get(f"{BASE_URL}/api/clients/da-verificare", headers=umberto_headers).json()
        assert dv, "No da-verificare clients"
        cid = dv[0]["id"]
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        gid = giri[0]["id"]
        r = api.put(f"{BASE_URL}/api/clients/{cid}",
                    json={"giro_id": gid, "position": 500,
                          "permanent_note": "TEST_NOTE_permanent"},
                    headers=umberto_headers)
        assert r.status_code == 200
        assert r.json()["giro_id"] == gid
        assert r.json()["permanent_note"] == "TEST_NOTE_permanent"
        # Restore
        api.put(f"{BASE_URL}/api/clients/{cid}",
                json={"giro_id": None, "permanent_note": ""},
                headers=umberto_headers)


# ===================== EVENTS =====================
class TestEvents:
    def _get_client(self, api, umberto_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        for g in giri:
            cs = api.get(f"{BASE_URL}/api/clients?giro_id={g['id']}",
                         headers=umberto_headers).json()
            if cs:
                return cs[0]
        return None

    def test_visit_updates_last_visit(self, api, umberto_headers):
        c = self._get_client(api, umberto_headers)
        assert c is not None
        r = api.post(f"{BASE_URL}/api/events",
                     json={"client_id": c["id"], "type": "visit"},
                     headers=umberto_headers)
        assert r.status_code == 200
        # Verify handled_today true + status gestito
        clients = api.get(f"{BASE_URL}/api/clients?giro_id={c['giro_id']}",
                          headers=umberto_headers).json()
        updated = next(x for x in clients if x["id"] == c["id"])
        assert updated["handled_today"] is True
        assert updated["status"] == "gestito"
        assert updated["last_visit_at"] is not None

    def test_order_requires_company(self, api, umberto_headers):
        c = self._get_client(api, umberto_headers)
        r = api.post(f"{BASE_URL}/api/events",
                     json={"client_id": c["id"], "type": "order"},
                     headers=umberto_headers)
        assert r.status_code == 400

    def test_order_success_stores_company_name(self, api, umberto_headers):
        c = self._get_client(api, umberto_headers)
        comp = api.get(f"{BASE_URL}/api/companies", headers=umberto_headers).json()[0]
        r = api.post(f"{BASE_URL}/api/events",
                     json={"client_id": c["id"], "type": "order",
                           "company_id": comp["id"]},
                     headers=umberto_headers)
        assert r.status_code == 200
        assert r.json()["company_name"] == comp["name"]

    def test_reschedule_7_days(self, api, umberto_headers):
        # Use a different client to preserve last_visit assertions
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        cs = api.get(f"{BASE_URL}/api/clients?giro_id={giri[1]['id']}",
                     headers=umberto_headers).json()
        assert cs
        c = cs[0]
        prev_lv = c.get("last_visit_at")
        r = api.post(f"{BASE_URL}/api/events",
                     json={"client_id": c["id"], "type": "reschedule",
                           "reschedule_days": 7},
                     headers=umberto_headers)
        assert r.status_code == 200
        # Verify last_visit_at unchanged, status gestito
        after = api.get(f"{BASE_URL}/api/clients?giro_id={giri[1]['id']}",
                        headers=umberto_headers).json()
        upd = next(x for x in after if x["id"] == c["id"])
        assert upd["last_visit_at"] == prev_lv
        assert upd["snoozed_until"] is not None
        assert upd["status"] == "gestito"

    def test_collection_event(self, api, umberto_headers):
        c = self._get_client(api, umberto_headers)
        r = api.post(f"{BASE_URL}/api/events",
                     json={"client_id": c["id"], "type": "collection"},
                     headers=umberto_headers)
        assert r.status_code == 200

    def test_note_requires_text(self, api, umberto_headers):
        c = self._get_client(api, umberto_headers)
        r = api.post(f"{BASE_URL}/api/events",
                     json={"client_id": c["id"], "type": "note"},
                     headers=umberto_headers)
        assert r.status_code == 400
        r2 = api.post(f"{BASE_URL}/api/events",
                      json={"client_id": c["id"], "type": "note",
                            "note_text": "TEST_NOTE"},
                      headers=umberto_headers)
        assert r2.status_code == 200
        assert r2.json()["note_text"] == "TEST_NOTE"

    def test_history_newest_first(self, api, umberto_headers):
        c = self._get_client(api, umberto_headers)
        r = api.get(f"{BASE_URL}/api/clients/{c['id']}/history",
                    headers=umberto_headers)
        assert r.status_code == 200
        events = r.json()
        assert len(events) >= 1
        # newest first
        times = [e["created_at"] for e in events]
        assert times == sorted(times, reverse=True)


# ===================== EXPORT =====================
class TestExport:
    def test_export_xlsx(self, api, umberto_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        gid = giri[0]["id"]
        r = api.get(f"{BASE_URL}/api/export/monthly?giro_id={gid}&year=2026",
                    headers=umberto_headers)
        assert r.status_code == 200
        assert r.headers["content-type"] == \
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert len(r.content) > 500
        assert r.content[:2] == b"PK"  # xlsx = zip
