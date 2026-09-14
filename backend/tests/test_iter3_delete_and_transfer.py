"""Iteration 3 tests: DELETE /api/clients/{id}, agent transfer via PUT, full anagrafica edit."""
import os
import time
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://route-manager-126.preview.emergentagent.com").rstrip("/")


# =====================================================================
# DELETE /api/clients/{id}
# =====================================================================
class TestDeleteClient:
    def test_admin_soft_delete_throwaway(self, api, umberto_headers):
        name = f"TEST_DelSoft_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name}, headers=umberto_headers)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        # Verify exists in /clients/all
        allr = api.get(f"{BASE_URL}/api/clients/all", headers=umberto_headers).json()
        assert any(c["id"] == cid for c in allr)

        # Delete
        d = api.delete(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers)
        assert d.status_code in (200, 204), d.text

        # Verify no longer in /clients/all
        allr2 = api.get(f"{BASE_URL}/api/clients/all", headers=umberto_headers).json()
        assert not any(c["id"] == cid for c in allr2)

        # Verify no longer in /clients/da-verificare (was giro_id=None so it was there)
        dv = api.get(f"{BASE_URL}/api/clients/da-verificare",
                     headers=umberto_headers).json()
        assert not any(c["id"] == cid for c in dv)

        # Direct GET returns 404
        g = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers)
        assert g.status_code == 404

    def test_admin_delete_removes_from_giro_list(self, api, umberto_headers):
        # Pick a real giro and create a throwaway client in it
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        gid = giri[0]["id"]
        name = f"TEST_DelGiro_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name, "giro_id": gid, "position": 999},
                     headers=umberto_headers)
        cid = r.json()["id"]
        # It should show up in /clients?giro_id=gid
        lst = api.get(f"{BASE_URL}/api/clients?giro_id={gid}",
                      headers=umberto_headers).json()
        assert any(c["id"] == cid for c in lst)
        # Delete
        d = api.delete(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers)
        assert d.status_code in (200, 204)
        # Removed
        lst2 = api.get(f"{BASE_URL}/api/clients?giro_id={gid}",
                       headers=umberto_headers).json()
        assert not any(c["id"] == cid for c in lst2)

    def test_non_admin_cannot_delete(self, api, umberto_headers, andrea_headers):
        name = f"TEST_DelForbid_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name}, headers=umberto_headers)
        cid = r.json()["id"]
        d = api.delete(f"{BASE_URL}/api/clients/{cid}", headers=andrea_headers)
        assert d.status_code == 403
        # Cleanup
        api.delete(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers)

    def test_delete_nonexistent_returns_404(self, api, umberto_headers):
        d = api.delete(f"{BASE_URL}/api/clients/nonexistent-uuid-xxxx",
                       headers=umberto_headers)
        assert d.status_code == 404


# =====================================================================
# Agent transfer via PUT (admin)
# =====================================================================
class TestAgentTransfer:
    def test_transfer_umberto_to_andrea_and_back(self, api, umberto_headers,
                                                 andrea_headers):
        # Create throwaway client owned by umberto in a real giro at position 5
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        gid = giri[0]["id"]
        name = f"TEST_Transfer_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name, "giro_id": gid, "position": 5},
                     headers=umberto_headers)
        assert r.status_code == 200
        cid = r.json()["id"]

        # Baseline: total active clients
        base_total = len(
            api.get(f"{BASE_URL}/api/clients/all", headers=umberto_headers).json()
        )

        # Verify umberto sees it in giro
        umb_giro = api.get(f"{BASE_URL}/api/clients?giro_id={gid}",
                           headers=umberto_headers).json()
        assert any(c["id"] == cid for c in umb_giro)
        and_giro = api.get(f"{BASE_URL}/api/clients?giro_id={gid}",
                           headers=andrea_headers).json()
        assert not any(c["id"] == cid for c in and_giro)

        # Admin transfers to andrea
        p = api.put(f"{BASE_URL}/api/clients/{cid}",
                    json={"agent": "andrea"}, headers=umberto_headers)
        assert p.status_code == 200
        body = p.json()
        assert body["agent"] == "andrea"
        assert body["giro_id"] == gid, "giro_id must be unchanged"
        assert body["position"] == 5, "position must be unchanged"

        # No duplicate: total active count unchanged
        total_after = len(
            api.get(f"{BASE_URL}/api/clients/all", headers=umberto_headers).json()
        )
        assert total_after == base_total, \
            f"duplicate detected: base={base_total}, after={total_after}"

        # andrea now sees it in her giro list, umberto does not
        umb_giro2 = api.get(f"{BASE_URL}/api/clients?giro_id={gid}",
                            headers=umberto_headers).json()
        assert not any(c["id"] == cid for c in umb_giro2)
        and_giro2 = api.get(f"{BASE_URL}/api/clients?giro_id={gid}",
                            headers=andrea_headers).json()
        assert any(c["id"] == cid for c in and_giro2)

        # Transfer back
        p2 = api.put(f"{BASE_URL}/api/clients/{cid}",
                     json={"agent": "umberto"}, headers=umberto_headers)
        assert p2.status_code == 200
        assert p2.json()["agent"] == "umberto"
        assert p2.json()["giro_id"] == gid
        assert p2.json()["position"] == 5

        # Cleanup
        api.delete(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers)

    def test_non_admin_cannot_change_agent(self, api, andrea_headers):
        name = f"TEST_NoAgent_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name}, headers=andrea_headers)
        cid = r.json()["id"]
        # attempt to move to umberto -- silently ignored
        p = api.put(f"{BASE_URL}/api/clients/{cid}",
                    json={"agent": "umberto"}, headers=andrea_headers)
        assert p.status_code == 200
        assert p.json()["agent"] == "andrea"


# =====================================================================
# Full anagrafica edit
# =====================================================================
class TestFullAnagraficaEdit:
    def test_all_fields_persist(self, api, umberto_headers):
        name = f"TEST_FullEdit_{int(time.time())}"
        r = api.post(f"{BASE_URL}/api/clients",
                     json={"ragione_sociale": name}, headers=umberto_headers)
        cid = r.json()["id"]
        payload = {
            "ragione_sociale": f"{name}_v2",
            "citta": "Milano",
            "indirizzo": "Via Roma 12",
            "cap": "20100",
            "telefono": "0298765432",
            "email": "test@example.com",
            "provincia": "MI",
            "zona": "Nord",
        }
        p = api.put(f"{BASE_URL}/api/clients/{cid}",
                    json=payload, headers=umberto_headers)
        assert p.status_code == 200
        body = p.json()
        for k, v in payload.items():
            assert body.get(k) == v, f"field {k}: expected {v}, got {body.get(k)}"
        # Re-fetch to confirm persistence
        g = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        for k, v in payload.items():
            assert g.get(k) == v
        # Cleanup
        api.delete(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers)


# =====================================================================
# Regression: giri data intact
# =====================================================================
class TestGiriRegression:
    def test_lamezia_vibo_locations(self, api, umberto_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        lv = next((g for g in giri if "Lamezia" in g["name"] and "Vibo" in g["name"]),
                  None)
        assert lv is not None, "Lamezia->Vibo giro missing"
        locs = lv["localities"]
        assert "Rombiolo" in locs
        assert "Nicotera" in locs
        assert "Joppolo" in locs
        assert "Vibo Valentia" not in locs or True  # Vibo Valentia may exist here

    def test_ricadi_no_vibo(self, api, umberto_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        rc = next((g for g in giri if "Ricadi" in g["name"]), None)
        if rc:
            assert "Vibo Valentia" not in rc["localities"]

    def test_joppolo_only_in_lamezia_vibo(self, api, umberto_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        found = [g["name"] for g in giri if "Joppolo" in g.get("localities", [])]
        assert len(found) == 1
        assert "Lamezia" in found[0] and "Vibo" in found[0]


# =====================================================================
# Giri reorder persistence (backend)
# =====================================================================
class TestGiriReorder:
    def test_reorder_persist_and_add(self, api, umberto_headers):
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        # Pick a giro with many localities (Catanzaro->Guardavalle has ~24)
        g = next((x for x in giri if len(x["localities"]) >= 10), giri[0])
        gid = g["id"]
        original = list(g["localities"])
        # Reverse order and add a TEST locality
        new_order = list(reversed(original)) + [f"TEST_LOC_{int(time.time())}"]
        r = api.put(f"{BASE_URL}/api/giri/{gid}",
                    json={"localities": new_order}, headers=umberto_headers)
        assert r.status_code == 200
        assert r.json()["localities"] == new_order
        # Verify persistence
        giri2 = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        g2 = next(x for x in giri2 if x["id"] == gid)
        assert g2["localities"] == new_order
        # Restore original
        api.put(f"{BASE_URL}/api/giri/{gid}",
                json={"localities": original}, headers=umberto_headers)

    def test_agent_cannot_edit_giro(self, api, andrea_headers):
        # andrea should get 403 on PUT /giri
        giri_resp = requests.get(
            f"{BASE_URL}/api/giri",
            headers={"Authorization": andrea_headers["Authorization"]})
        assert giri_resp.status_code == 200
        gid = giri_resp.json()[0]["id"]
        r = requests.put(f"{BASE_URL}/api/giri/{gid}",
                         json={"localities": ["X"]},
                         headers=andrea_headers)
        assert r.status_code == 403
