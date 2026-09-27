"""
Iteration 9 tests for 'Rodomisto Rappresentanze':
 - GET /api/clients?giro_id=... now exposes last_collection_at (nullable ISO)
   alongside last_visit_at and last_order_at.
 - The client history of '3 erre Srl' (client_id 8231a742-8d0f-4ea7-ac31-5ce340262567)
   contains the 7 recovered events (1 visit, 3 order Librandi, 1 collection,
   1 note 'TEST_NOTE', plus what was already there).
"""
import re
import requests
from datetime import datetime

TRE_ERRE_ID = "8231a742-8d0f-4ea7-ac31-5ce340262567"
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T")


def _first_giro_with_clients(base_url, headers):
    giri = requests.get(f"{base_url}/api/giri", headers=headers).json()
    for g in giri:
        r = requests.get(f"{base_url}/api/clients", headers=headers,
                         params={"giro_id": g["id"]})
        if r.status_code == 200 and r.json():
            return g["id"], r.json()
    return None, []


# --- Feature 1: last_collection_at + last_order_at on /api/clients -----------
class TestListClientsLastAction:
    def test_each_client_row_has_last_order_and_last_collection(self, base_url, umberto_headers):
        _, clients = _first_giro_with_clients(base_url, umberto_headers)
        assert clients, "expected at least one giro with clients"
        for c in clients:
            assert "last_visit_at" in c, f"missing last_visit_at on {c.get('ragione_sociale')}"
            assert "last_order_at" in c, f"missing last_order_at on {c.get('ragione_sociale')}"
            assert "last_collection_at" in c, f"missing last_collection_at on {c.get('ragione_sociale')}"
            for k in ("last_visit_at", "last_order_at", "last_collection_at"):
                v = c[k]
                assert v is None or (isinstance(v, str) and ISO_RE.match(v)), \
                    f"{k}={v!r} must be null or ISO 8601"

    def test_last_collection_reflects_latest_collection_event(self, base_url, umberto_headers):
        # Find one client with an existing collection event and check the exposed
        # last_collection_at matches the max created_at of type=collection.
        _, clients = _first_giro_with_clients(base_url, umberto_headers)
        target = None
        for c in clients:
            if c.get("last_collection_at"):
                target = c
                break
        if target is None:
            import pytest
            pytest.skip("no client in the sampled giro has a collection yet")
        hist = requests.get(f"{base_url}/api/clients/{target['id']}/history",
                            headers=umberto_headers).json()
        cols = [e["created_at"] for e in hist if e["type"] == "collection"]
        assert cols, "expected at least one 'collection' event in history"
        assert max(cols) == target["last_collection_at"], \
            "last_collection_at must equal max(created_at) of collection events"


# --- Feature 2: '3 erre Srl' recovered events --------------------------------
class TestTreErreRecoveredHistory:
    def test_history_contains_recovered_events(self, base_url, umberto_headers):
        r = requests.get(f"{base_url}/api/clients/{TRE_ERRE_ID}",
                         headers=umberto_headers)
        assert r.status_code == 200, f"'3 erre Srl' not found in DB ({r.status_code})"

        h = requests.get(f"{base_url}/api/clients/{TRE_ERRE_ID}/history",
                         headers=umberto_headers)
        assert h.status_code == 200
        events = h.json()

        # Must have at least the 7 recovered events (some may pre-exist)
        types = [e["type"] for e in events]
        assert types.count("visit") >= 1, f"expected >=1 visit, got {types.count('visit')}"
        assert types.count("order") >= 3, f"expected >=3 orders, got {types.count('order')}"
        assert types.count("collection") >= 1, f"expected >=1 collection, got {types.count('collection')}"

        # Librandi orders in September 2026 (14/09 and 20/09)
        librandi_orders = [
            e for e in events
            if e["type"] == "order" and (e.get("company_name") or "").lower() == "librandi"
        ]
        assert len(librandi_orders) >= 2, \
            f"expected >=2 Librandi orders, got {len(librandi_orders)}"
        librandi_dates = sorted(e["created_at"][:10] for e in librandi_orders)
        assert any(d.startswith("2026-09-14") or d.startswith("2026-09-20")
                   for d in librandi_dates), \
            f"expected Librandi orders on 14/09/2026 or 20/09/2026, got {librandi_dates}"

        # Collection on 14/09/2026
        cols = [e for e in events if e["type"] == "collection"]
        assert any(e["created_at"].startswith("2026-09-14") for e in cols), \
            f"expected collection on 2026-09-14, got {[e['created_at'] for e in cols]}"

        # Recovered TEST_NOTE
        notes = [e for e in events if e["type"] == "note"]
        assert any((e.get("note_text") or "").strip() == "TEST_NOTE" for e in notes), \
            f"expected note 'TEST_NOTE', got {[e.get('note_text') for e in notes]}"

    def test_client_row_last_action_matches_history_max(self, base_url, umberto_headers):
        # Ensure 3 erre Srl now surfaces last_order_at / last_collection_at via
        # the giro listing (if it belongs to a giro).
        cli = requests.get(f"{base_url}/api/clients/{TRE_ERRE_ID}",
                           headers=umberto_headers).json()
        if not cli.get("giro_id"):
            import pytest
            pytest.skip("'3 erre Srl' has no giro assignment")
        rows = requests.get(f"{base_url}/api/clients",
                            headers=umberto_headers,
                            params={"giro_id": cli["giro_id"]}).json()
        row = next((r for r in rows if r["id"] == TRE_ERRE_ID), None)
        assert row is not None, "'3 erre Srl' not in its giro listing"

        hist = requests.get(f"{base_url}/api/clients/{TRE_ERRE_ID}/history",
                            headers=umberto_headers).json()
        orders = [e["created_at"] for e in hist if e["type"] == "order"]
        cols = [e["created_at"] for e in hist if e["type"] == "collection"]
        if orders:
            assert row["last_order_at"] == max(orders)
        if cols:
            assert row["last_collection_at"] == max(cols)
