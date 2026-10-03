"""Iteration 11 — new features backend tests.

Covers:
 - GET /api/activities with from_date / to_date (YYYY-MM-DD, Europe/Rome)
   combined with scope/type, and permission that forces agent to own scope.
 - GET /api/suspensions?scope=all|umberto|andrea:
   * admin can filter by scope
   * agent (andrea) can only see own (scope ignored)
   * each item carries required fields
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://route-manager-126.preview.emergentagent.com").rstrip("/")

VALID_KINDS = {"overdue", "due_soon"}
VALID_AGENTS = {"umberto", "andrea"}


# ---------------------------------------------------------------- helpers
def _parse_iso(s):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ============================================================
# Activities — period filter
# ============================================================
class TestActivitiesPeriod:
    def test_no_period_params_returns_data(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/activities?scope=all&type=all&limit=1000",
                    headers=umberto_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        # Shape sanity check on first row.
        row = data[0]
        for k in ("id", "type", "type_label", "created_at", "agent",
                  "client_ragione_sociale", "context"):
            assert k in row, (k, row)

    def test_september_2026_window_filters_correctly(self, api, umberto_headers):
        # Range provided by main agent: 2026-09-01..2026-09-30 should contain ~92.
        r = api.get(
            f"{BASE_URL}/api/activities?scope=all&type=all&limit=1000"
            f"&from_date=2026-09-01&to_date=2026-09-30",
            headers=umberto_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # Every created_at must fall within [2026-09-01 00:00 Rome, 2026-10-01 00:00 Rome).
        lo = datetime(2026, 9, 1, tzinfo=timezone(timedelta(hours=2)))  # CEST
        hi = datetime(2026, 10, 1, tzinfo=timezone(timedelta(hours=2)))
        for row in data:
            dt = _parse_iso(row["created_at"])
            assert dt is not None
            assert lo <= dt < hi, (row["created_at"], row["type"])

    def test_narrow_window_subset_of_wider_window(self, api, umberto_headers):
        wide = api.get(
            f"{BASE_URL}/api/activities?scope=all&type=all&limit=2000"
            f"&from_date=2026-09-01&to_date=2026-09-30",
            headers=umberto_headers,
        ).json()
        narrow = api.get(
            f"{BASE_URL}/api/activities?scope=all&type=all&limit=2000"
            f"&from_date=2026-09-10&to_date=2026-09-20",
            headers=umberto_headers,
        ).json()
        wide_ids = {a["id"] for a in wide}
        narrow_ids = {a["id"] for a in narrow}
        assert narrow_ids.issubset(wide_ids)
        assert len(narrow_ids) <= len(wide_ids)

    def test_empty_future_range_returns_empty(self, api, umberto_headers):
        r = api.get(
            f"{BASE_URL}/api/activities?scope=all&type=all"
            f"&from_date=2099-01-01&to_date=2099-01-31",
            headers=umberto_headers,
        )
        assert r.status_code == 200
        assert r.json() == []

    def test_invalid_date_ignored_not_500(self, api, umberto_headers):
        # parse_day_bound returns None on bad input: should behave as unfiltered.
        r = api.get(
            f"{BASE_URL}/api/activities?scope=all&type=all"
            f"&from_date=NOT-A-DATE&to_date=also-bad",
            headers=umberto_headers,
        )
        assert r.status_code == 200, r.text
        base = api.get(f"{BASE_URL}/api/activities?scope=all&type=all",
                       headers=umberto_headers).json()
        assert len(r.json()) == len(base)

    def test_combines_with_type_filter(self, api, umberto_headers):
        r = api.get(
            f"{BASE_URL}/api/activities?scope=all&type=collection&limit=1000"
            f"&from_date=2026-09-01&to_date=2026-09-30",
            headers=umberto_headers,
        )
        assert r.status_code == 200, r.text
        for row in r.json():
            assert row["type"] == "collection"

    def test_combines_with_scope_filter_admin(self, api, umberto_headers):
        r = api.get(
            f"{BASE_URL}/api/activities?scope=andrea&type=all&limit=1000"
            f"&from_date=2026-09-01&to_date=2026-09-30",
            headers=umberto_headers,
        )
        assert r.status_code == 200
        for row in r.json():
            assert row["agent"] == "andrea"

    def test_agent_scope_ignored(self, api, andrea_headers):
        # Agent sees only own activities regardless of scope=umberto.
        r = api.get(
            f"{BASE_URL}/api/activities?scope=umberto&type=all&limit=1000"
            f"&from_date=2026-09-01&to_date=2026-09-30",
            headers=andrea_headers,
        )
        assert r.status_code == 200
        for row in r.json():
            assert row["agent"] == "andrea"


# ============================================================
# Suspensions
# ============================================================
class TestSuspensionsEndpoint:
    def _check_shape(self, items):
        for it in items:
            for k in ("client_id", "ragione_sociale", "citta", "agent",
                      "giro_name", "company_name", "kind", "due_at", "since"):
                assert k in it, (k, it)
            assert it["kind"] in VALID_KINDS, it["kind"]
            assert it["agent"] in VALID_AGENTS, it["agent"]

    def test_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/suspensions?scope=all")
        assert r.status_code == 401

    def test_admin_all_returns_items(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/suspensions?scope=all", headers=umberto_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        self._check_shape(data)
        # Admin preview reports at least 2 overdue (per task note).
        overdue = [x for x in data if x["kind"] == "overdue"]
        assert len(overdue) >= 1, data
        # Ordering: overdue first, then due_soon.
        kinds = [x["kind"] for x in data]
        if "due_soon" in kinds and "overdue" in kinds:
            assert kinds.index("overdue") < kinds.index("due_soon")

    def test_admin_scope_andrea_only_andrea(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/suspensions?scope=andrea", headers=umberto_headers)
        assert r.status_code == 200
        data = r.json()
        self._check_shape(data)
        for it in data:
            assert it["agent"] == "andrea"

    def test_admin_scope_umberto_only_umberto(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/suspensions?scope=umberto", headers=umberto_headers)
        assert r.status_code == 200
        data = r.json()
        self._check_shape(data)
        for it in data:
            assert it["agent"] == "umberto"

    def test_agent_sees_only_own(self, api, andrea_headers):
        r_all = api.get(f"{BASE_URL}/api/suspensions?scope=all", headers=andrea_headers)
        assert r_all.status_code == 200
        for it in r_all.json():
            assert it["agent"] == "andrea"
        # scope=umberto must be ignored for an agent.
        r_u = api.get(f"{BASE_URL}/api/suspensions?scope=umberto", headers=andrea_headers)
        assert r_u.status_code == 200
        for it in r_u.json():
            assert it["agent"] == "andrea"

    def test_overdue_item_fields_coherent(self, api, umberto_headers):
        data = api.get(f"{BASE_URL}/api/suspensions?scope=all",
                       headers=umberto_headers).json()
        for it in data:
            if it["kind"] == "overdue":
                # Must have either a due_at in the past OR a `since` (manual).
                due = _parse_iso(it["due_at"])
                since = _parse_iso(it["since"])
                assert due is not None or since is not None, it
                if due is not None:
                    assert due <= datetime.now(timezone.utc) + timedelta(minutes=1)
            else:  # due_soon
                due = _parse_iso(it["due_at"])
                assert due is not None
                # In scadenza entro ~ DUE_SOON_DAYS (<= ~30 giorni di default).
                assert due > datetime.now(timezone.utc) - timedelta(minutes=1)
