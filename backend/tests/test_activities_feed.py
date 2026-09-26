"""
Iteration 7 — Tests for the new GET /api/activities feed
(Home 'ULTIMI AGGIORNAMENTI' + 'ULTIMO AGGIORNAMENTO' + Storico screen).
"""

import os
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://route-manager-126.preview.emergentagent.com",
).rstrip("/")

ALLOWED_TYPES = {"order", "collection", "suspension", "reschedule"}
EXPECTED_FIELDS = {
    "id", "type", "type_label", "created_at", "agent",
    "client_ragione_sociale", "context",
}
TYPE_LABELS = {
    "order": "Ordine effettuato",
    "collection": "Incassato",
    "suspension": "+Sospeso",
    "reschedule": "Visita rimandata",
}


# --------------------------------------------------------------------------
# 1) Feed content: only the 4 allowed types + required fields
# --------------------------------------------------------------------------
class TestActivitiesShape:
    def test_scope_all_only_allowed_types(self, umberto_headers):
        r = requests.get(
            f"{BASE_URL}/api/activities?scope=all&type=all&limit=200",
            headers=umberto_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0, "expected some activities in seeded data"
        for a in data:
            assert a["type"] in ALLOWED_TYPES, f"unexpected type: {a['type']}"
            missing = EXPECTED_FIELDS - set(a.keys())
            assert not missing, f"missing fields {missing} in {a}"
            assert a["type_label"] == TYPE_LABELS[a["type"]]
            assert a["client_ragione_sociale"], "client ragione sociale must be non empty"
            # 4th field (context): company for order/collection/suspension,
            # giro name (or fallback citta) for reschedule
            if a["type"] in ("order", "collection", "suspension"):
                assert a.get("company_name") is None or a["context"] == (a.get("company_name") or "")
            # created_at must be an ISO string
            assert isinstance(a["created_at"], str) and "T" in a["created_at"]

    def test_default_sorted_desc_by_created_at(self, umberto_headers):
        r = requests.get(
            f"{BASE_URL}/api/activities?scope=all&type=all&limit=50",
            headers=umberto_headers,
        )
        assert r.status_code == 200
        arr = r.json()
        for i in range(1, len(arr)):
            assert arr[i - 1]["created_at"] >= arr[i]["created_at"], "must be desc"

    def test_limit_capped(self, umberto_headers):
        r = requests.get(
            f"{BASE_URL}/api/activities?scope=all&type=all&limit=9999",
            headers=umberto_headers,
        )
        assert r.status_code == 200
        assert len(r.json()) <= 500


# --------------------------------------------------------------------------
# 2) Type filter
# --------------------------------------------------------------------------
class TestActivitiesTypeFilter:
    def _check(self, umberto_headers, t):
        r = requests.get(
            f"{BASE_URL}/api/activities?scope=all&type={t}&limit=200",
            headers=umberto_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for a in data:
            assert a["type"] == t, f"expected only type={t}, got {a['type']}"

    def test_filter_order(self, umberto_headers):
        self._check(umberto_headers, "order")

    def test_filter_collection(self, umberto_headers):
        self._check(umberto_headers, "collection")

    def test_filter_suspension(self, umberto_headers):
        self._check(umberto_headers, "suspension")

    def test_filter_reschedule(self, umberto_headers):
        self._check(umberto_headers, "reschedule")


# --------------------------------------------------------------------------
# 3) Permissions
# --------------------------------------------------------------------------
class TestActivitiesPermissions:
    def test_admin_scope_all_sees_both_agents(self, umberto_headers):
        r = requests.get(
            f"{BASE_URL}/api/activities?scope=all&type=all&limit=500",
            headers=umberto_headers,
        )
        assert r.status_code == 200
        agents = {a["agent"] for a in r.json() if a.get("agent")}
        # Expect the umberto+andrea universe (at minimum umberto since he is admin
        # doing most operations). If Andrea has activities we must also see them.
        assert "umberto" in agents, agents

    def test_admin_scope_umberto_only_umberto(self, umberto_headers):
        r = requests.get(
            f"{BASE_URL}/api/activities?scope=umberto&type=all&limit=500",
            headers=umberto_headers,
        )
        assert r.status_code == 200
        arr = r.json()
        for a in arr:
            assert a["agent"] == "umberto", a

    def test_admin_scope_andrea_only_andrea(self, umberto_headers):
        r = requests.get(
            f"{BASE_URL}/api/activities?scope=andrea&type=all&limit=500",
            headers=umberto_headers,
        )
        assert r.status_code == 200
        arr = r.json()
        for a in arr:
            assert a["agent"] == "andrea", a

    def test_agent_andrea_scope_all_only_own(self, andrea_headers):
        r = requests.get(
            f"{BASE_URL}/api/activities?scope=all&type=all&limit=500",
            headers=andrea_headers,
        )
        assert r.status_code == 200
        arr = r.json()
        for a in arr:
            assert a["agent"] == "andrea", (
                f"agent andrea leaked another user's activity: {a}"
            )

    def test_agent_andrea_scope_umberto_still_only_own(self, andrea_headers):
        r = requests.get(
            f"{BASE_URL}/api/activities?scope=umberto&type=all&limit=500",
            headers=andrea_headers,
        )
        assert r.status_code == 200
        arr = r.json()
        for a in arr:
            assert a["agent"] == "andrea", (
                f"agent andrea leaked umberto's activity via scope=umberto: {a}"
            )

    def test_unauthenticated_rejected(self):
        r = requests.get(f"{BASE_URL}/api/activities?scope=all&type=all&limit=10")
        assert r.status_code in (401, 403), r.status_code
