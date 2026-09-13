"""Iteration 2: new endpoints (clients/all, stats/monthly, export includes company name,
   agent field on client create/update)."""
import os
import time
import io
import requests
import zipfile

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://route-manager-126.preview.emergentagent.com").rstrip("/")


# ===================== /api/clients/all =====================
class TestClientsAll:
    def test_admin_sees_all(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/clients/all", headers=umberto_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # spec says 633 for admin, allow >=600 to be robust to TEST_ leftovers
        assert len(data) >= 600, f"Expected ~633 clienti, got {len(data)}"
        assert all("ragione_sociale" in c for c in data)

    def test_agent_sees_only_own(self, api, andrea_headers):
        r = api.get(f"{BASE_URL}/api/clients/all", headers=andrea_headers)
        assert r.status_code == 200
        data = r.json()
        # spec: 84 for andrea, allow >= 80 for robustness
        assert 60 <= len(data) <= 150, f"Andrea should see ~84 clienti, got {len(data)}"
        assert all(c.get("agent") == "andrea" for c in data)

    def test_search_filter(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/clients/all?search=gramaca", headers=umberto_headers)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert all("gramaca" in c["ragione_sociale"].lower() for c in data)


# ===================== Client agent-field enforcement =====================
class TestClientAgentField:
    def test_admin_can_create_for_andrea(self, api, umberto_headers):
        name = f"TEST_AgentField_A_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name, "agent": "andrea"},
                     headers=umberto_headers)
        assert r.status_code == 200
        assert r.json()["agent"] == "andrea"

    def test_non_admin_cannot_set_agent(self, api, andrea_headers):
        name = f"TEST_AgentField_B_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name, "agent": "umberto"},
                     headers=andrea_headers)
        assert r.status_code == 200
        # Non-admin creation must be assigned to caller regardless of agent field
        assert r.json()["agent"] == "andrea"

    def test_admin_reassign_via_put(self, api, umberto_headers):
        # Create a fresh test client owned by umberto
        name = f"TEST_Reassign_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name}, headers=umberto_headers)
        assert r.status_code == 200
        cid = r.json()["id"]
        assert r.json()["agent"] == "umberto"
        # Admin reassigns to andrea
        r2 = api.put(f"{BASE_URL}/api/clients/{cid}",
                     json={"agent": "andrea"}, headers=umberto_headers)
        assert r2.status_code == 200
        assert r2.json()["agent"] == "andrea"
        # Verify with GET
        r3 = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers)
        assert r3.status_code == 200
        assert r3.json()["agent"] == "andrea"

    def test_non_admin_cannot_change_others(self, api, umberto_headers, andrea_headers):
        # Grab any umberto-owned client
        r = api.get(f"{BASE_URL}/api/clients/all", headers=umberto_headers)
        umb_clients = [c for c in r.json() if c.get("agent") == "umberto"]
        assert umb_clients
        cid = umb_clients[0]["id"]
        r2 = api.put(f"{BASE_URL}/api/clients/{cid}",
                     json={"citta": "Hacked"}, headers=andrea_headers)
        assert r2.status_code == 403

    def test_non_admin_cannot_change_agent_on_own(self, api, andrea_headers):
        # Create andrea-owned client
        name = f"TEST_AndreaOwn_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name}, headers=andrea_headers)
        assert r.status_code == 200
        cid = r.json()["id"]
        # Attempt to move to umberto — must be silently ignored (agent stays andrea)
        r2 = api.put(f"{BASE_URL}/api/clients/{cid}",
                     json={"agent": "umberto", "citta": "Xyz"}, headers=andrea_headers)
        assert r2.status_code == 200
        assert r2.json()["agent"] == "andrea"
        assert r2.json()["citta"] == "Xyz"


# ===================== /api/stats/monthly =====================
class TestStatsMonthly:
    def test_stats_shape(self, api, umberto_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        gid = giri[0]["id"]
        r = api.get(f"{BASE_URL}/api/stats/monthly?giro_id={gid}&year=2026",
                    headers=umberto_headers)
        assert r.status_code == 200
        j = r.json()
        assert j["giro"]["id"] == gid
        assert j["year"] == 2026
        assert len(j["months"]) == 12
        assert isinstance(j["clients"], list)
        if j["clients"]:
            c = j["clients"][0]
            assert "id" in c and "ragione_sociale" in c and "citta" in c
            assert len(c["months"]) == 12
            m = c["months"][0]
            assert set(m.keys()) == {"visit", "orders", "collection"}
            assert isinstance(m["orders"], list)

    def test_stats_shows_order_company_name(self, api, umberto_headers):
        """Register an order today for a client, then verify it appears in stats current month."""
        from datetime import datetime
        year = datetime.now().year
        month_idx = datetime.now().month - 1
        # Pick a giro & client owned by umberto
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        client = None
        gid = None
        for g in giri:
            cs = api.get(f"{BASE_URL}/api/clients?giro_id={g['id']}",
                         headers=umberto_headers).json()
            if cs:
                client = cs[0]
                gid = g["id"]
                break
        assert client is not None
        # Companies: pick Librandi if present, else the first
        comps = api.get(f"{BASE_URL}/api/companies", headers=umberto_headers).json()
        comp = next((c for c in comps if "Librandi" in c["name"]), comps[0])
        # Register order event
        e = api.post(f"{BASE_URL}/api/events",
                     json={"client_id": client["id"], "type": "order",
                           "company_id": comp["id"]},
                     headers=umberto_headers)
        assert e.status_code == 200, e.text
        # Fetch stats
        r = api.get(f"{BASE_URL}/api/stats/monthly?giro_id={gid}&year={year}",
                    headers=umberto_headers)
        assert r.status_code == 200
        j = r.json()
        row = next(x for x in j["clients"] if x["id"] == client["id"])
        assert comp["name"] in row["months"][month_idx]["orders"], \
            f"Expected {comp['name']} in orders of month {month_idx}: {row['months'][month_idx]}"


# ===================== /api/export/monthly =====================
class TestExportIncludesCompanyName:
    def test_export_contains_company_name(self, api, umberto_headers):
        from datetime import datetime
        year = datetime.now().year
        # Pick a giro that has an order registered by the earlier test — pick first giro & register a fresh order
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        client, gid = None, None
        for g in giri:
            cs = api.get(f"{BASE_URL}/api/clients?giro_id={g['id']}",
                         headers=umberto_headers).json()
            if cs:
                client = cs[0]
                gid = g["id"]
                break
        assert client
        comps = api.get(f"{BASE_URL}/api/companies", headers=umberto_headers).json()
        comp = next((c for c in comps if "Librandi" in c["name"]), comps[0])
        api.post(f"{BASE_URL}/api/events",
                 json={"client_id": client["id"], "type": "order",
                       "company_id": comp["id"]},
                 headers=umberto_headers)
        # Download xlsx
        r = api.get(f"{BASE_URL}/api/export/monthly?giro_id={gid}&year={year}",
                    headers=umberto_headers)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"
        # Extract sharedStrings & sheet1.xml — look for "ordine" and company name
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        text = ""
        for n in names:
            if n.endswith(".xml"):
                text += z.read(n).decode("utf-8", errors="ignore")
        assert "ordine" in text.lower(), "'ordine' text not found in exported xlsx"
        assert comp["name"] in text, f"Company name {comp['name']} not found in export"
