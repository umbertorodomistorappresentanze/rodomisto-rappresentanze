"""Iteration 8 tests:
 - GET /api/clients?giro_id=... must include last_order_at (plus preserving last_visit_at) for every client
 - DELETE /api/recurrences/{company}/members/{member_id}: removes membership only, client remains in anagrafica
"""
import os
import uuid
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://route-manager-126.preview.emergentagent.com",
).rstrip("/")


# ---------------------------------------------------------------------------
# GET /api/clients: last_order_at field present
# ---------------------------------------------------------------------------
class TestClientsLastOrderAt:
    def test_umberto_giro_clients_have_last_order_at(self, umberto_headers):
        # find a giro that has clients for umberto
        r = requests.get(f"{BASE_URL}/api/giri", headers=umberto_headers)
        assert r.status_code == 200
        giri = r.json()
        assert len(giri) > 0

        found_any = False
        for giro in giri[:8]:
            r = requests.get(
                f"{BASE_URL}/api/clients?giro_id={giro['id']}",
                headers=umberto_headers,
            )
            assert r.status_code == 200
            clients = r.json()
            if not clients:
                continue
            found_any = True
            for c in clients:
                # Field MUST be present (may be None), alongside last_visit_at
                assert "last_order_at" in c, f"missing last_order_at in {c.get('id')}"
                assert "last_visit_at" in c
                # If not None must be a valid iso 8601 string
                if c["last_order_at"] is not None:
                    assert isinstance(c["last_order_at"], str)
                    assert "T" in c["last_order_at"]
            break
        assert found_any, "no giro with clients found for umberto"

    def test_last_order_at_reflects_new_order(self, umberto_headers):
        # Pick a giro & client, verify baseline, create an order, verify last_order_at updates
        r = requests.get(f"{BASE_URL}/api/giri", headers=umberto_headers)
        giri = r.json()
        target_client = None
        giro_id = None
        for giro in giri:
            r = requests.get(f"{BASE_URL}/api/clients?giro_id={giro['id']}", headers=umberto_headers)
            clients = r.json()
            if clients:
                target_client = clients[0]
                giro_id = giro["id"]
                break
        assert target_client is not None
        baseline_last_order = target_client.get("last_order_at")

        # find a company id
        r = requests.get(f"{BASE_URL}/api/companies", headers=umberto_headers)
        assert r.status_code == 200
        companies = r.json()
        assert len(companies) > 0
        company_id = companies[0]["id"]

        # create an order event
        payload = {
            "client_id": target_client["id"],
            "type": "order",
            "company_id": company_id,
            "payment_mode": "anticipato",
        }
        r = requests.post(f"{BASE_URL}/api/events", headers=umberto_headers, json=payload)
        assert r.status_code == 200, r.text

        # re-fetch and check last_order_at moved forward
        r = requests.get(f"{BASE_URL}/api/clients?giro_id={giro_id}", headers=umberto_headers)
        assert r.status_code == 200
        refreshed = next((c for c in r.json() if c["id"] == target_client["id"]), None)
        assert refreshed is not None
        assert refreshed["last_order_at"] is not None
        if baseline_last_order:
            assert refreshed["last_order_at"] >= baseline_last_order


# ---------------------------------------------------------------------------
# DELETE /api/recurrences/{company}/members/{member_id}
# ---------------------------------------------------------------------------
class TestRecurrenceMemberDelete:
    def test_delete_returns_ok_and_removes_only_membership(self, umberto_headers):
        # 1) List recurrences and pick 'mazzetti' if present; else first one
        r = requests.get(f"{BASE_URL}/api/recurrences", headers=umberto_headers)
        assert r.status_code == 200
        defs = r.json()
        assert len(defs) > 0
        d = next((x for x in defs if x["company"] == "mazzetti"), defs[0])
        company = d["company"]
        period = d["periods"][0]["key"]

        # 2) Add a fresh member to safely remove (avoid touching seeded ones)
        group = d["groups"][0]
        rag = f"TEST_iter8_member_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{BASE_URL}/api/recurrences/{company}/members",
            headers=umberto_headers,
            json={"group": group, "ragione_sociale": rag, "citta": "TestCity", "agent": "umberto"},
        )
        assert r.status_code == 200, r.text
        created_client_id = r.json()["client_id"]

        # 3) Find the member_id from members listing
        r = requests.get(
            f"{BASE_URL}/api/recurrences/{company}/members?period={period}",
            headers=umberto_headers,
        )
        assert r.status_code == 200
        payload = r.json()
        member_id = None
        for g in payload["groups"]:
            for c in g["clients"]:
                if c["id"] == created_client_id:
                    member_id = c.get("member_id")
                    break
            if member_id:
                break
        assert member_id, "member_id not found in listing after add"

        # 4) DELETE the membership
        r = requests.delete(
            f"{BASE_URL}/api/recurrences/{company}/members/{member_id}",
            headers=umberto_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        # 5) Verify it's gone from the listing
        r = requests.get(
            f"{BASE_URL}/api/recurrences/{company}/members?period={period}",
            headers=umberto_headers,
        )
        assert r.status_code == 200
        still_there = False
        for g in r.json()["groups"]:
            for c in g["clients"]:
                if c["id"] == created_client_id:
                    still_there = True
        assert not still_there, "client still visible in recurrence after delete"

        # 6) Second DELETE returns 404 (idempotency style: not found)
        r = requests.delete(
            f"{BASE_URL}/api/recurrences/{company}/members/{member_id}",
            headers=umberto_headers,
        )
        assert r.status_code == 404

        # 7) Client remains in anagrafica (not deleted)
        r = requests.get(f"{BASE_URL}/api/clients/{created_client_id}", headers=umberto_headers)
        assert r.status_code == 200
        assert r.json()["ragione_sociale"] == rag

        # cleanup: delete the created client (admin only)
        requests.delete(f"{BASE_URL}/api/clients/{created_client_id}", headers=umberto_headers)

    def test_delete_unknown_member_returns_404(self, umberto_headers):
        r = requests.get(f"{BASE_URL}/api/recurrences", headers=umberto_headers)
        company = r.json()[0]["company"]
        r = requests.delete(
            f"{BASE_URL}/api/recurrences/{company}/members/{uuid.uuid4()}",
            headers=umberto_headers,
        )
        assert r.status_code == 404
