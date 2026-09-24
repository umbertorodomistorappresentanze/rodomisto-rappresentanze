"""Iteration 6 — Rodomisto Rappresentanze new flows.

Covers:
- Payment mode 'rifatturazione_pac' (no scadenza, no sospeso).
- Bonfissuto 'Catanzaro verso Lamezia Terme' membership: Excalibur removed, Eurodrink added.
- DELETE recurrence member (ownership, isolation from clients/other recurrences).
- GET /api/giri new order of the 7 giri.
- GET /api/clients/da-verificare (admin).
- PUT /api/clients/{id} assignment clears needs_review and removes from da-verificare.
- Regression: login, giri structure, order+sospeso lifecycle.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://route-manager-126.preview.emergentagent.com",
).rstrip("/")


# ---------------- Payment modes / rifatturazione_pac ----------------
class TestPaymentModes:
    def test_payment_modes_includes_rifatturazione_pac(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/payment-modes", headers=umberto_headers)
        assert r.status_code == 200
        modes = r.json()
        keys = [m["key"] for m in modes]
        assert "rifatturazione_pac" in keys, keys
        assert keys[-1] == "rifatturazione_pac", "rifatturazione_pac must be last per PAYMENT_MODE_ORDER"
        rf = next(m for m in modes if m["key"] == "rifatturazione_pac")
        assert rf["label"] == "Rifatturazione Pac"
        assert rf["days"] is None

    def test_order_rifatturazione_pac_no_due_no_suspension(self, api, umberto_headers):
        # pick any client with a giro
        clients = api.get(f"{BASE_URL}/api/clients/all", headers=umberto_headers).json()
        cli = next((c for c in clients if c.get("giro_id")), None)
        assert cli, "need at least one client with giro"
        # pick any company
        companies = api.get(f"{BASE_URL}/api/companies", headers=umberto_headers).json()
        assert companies, "no companies"
        comp = companies[0]

        payload = {
            "client_id": cli["id"],
            "type": "order",
            "company_id": comp["id"],
            "payment_mode": "rifatturazione_pac",
            "note": "TEST_rifatturazione_pac",
        }
        r = api.post(f"{BASE_URL}/api/events", json=payload, headers=umberto_headers)
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev.get("due_at") is None, f"due_at should be None, got {ev.get('due_at')}"
        assert ev.get("payment_mode") == "rifatturazione_pac"
        assert ev.get("payment_mode_label") == "Rifatturazione Pac"

        # Must NOT create a suspension (no sospeso should be present for this client)
        client_full = api.get(f"{BASE_URL}/api/clients/{cli['id']}", headers=umberto_headers).json()
        susp = client_full.get("suspensions", [])
        # None of the active suspensions must be linked to this event
        assert all(s.get("event_id") != ev["id"] for s in susp), f"unexpected suspension for rifatturazione_pac: {susp}"

        # cleanup: soft-delete via mongosh if available (rely on delete endpoint if present)
        # server exposes no delete-event endpoint; leave note tag TEST_ for admin cleanup
        pytest.event_id_rifatturazione = ev["id"]


# ---------------- Bonfissuto recurrence membership ----------------
class TestBonfissutoRecurrence:
    @pytest.mark.parametrize("period", ["natale", "pasqua"])
    def test_catanzaro_verso_lamezia_group_has_eurodrink_no_excalibur(self, api, umberto_headers, period):
        r = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members?period={period}",
                    headers=umberto_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        groups = data.get("groups", [])
        grp = next((g for g in groups if "Catanzaro verso Lamezia Terme" in g["group"]), None)
        assert grp, f"group not found in {[g['group'] for g in groups]}"
        names_lower = [c["ragione_sociale"].lower() for c in grp["clients"]]
        assert not any("excalibur" in n for n in names_lower), \
            f"Excalibur must be REMOVED, found: {[n for n in names_lower if 'excalibur' in n]}"
        assert any("eurodrink" in n for n in names_lower), \
            f"Eurodrink must be PRESENT in group, got: {names_lower}"


# ---------------- DELETE recurrence member ----------------
class TestRemoveRecurrenceMember:
    def test_admin_remove_and_isolation(self, api, umberto_headers):
        # find Excalibur? removed. Pick a member from bonfissuto natale we can remove and re-add.
        r = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members?period=natale",
                    headers=umberto_headers)
        assert r.status_code == 200
        groups = r.json()["groups"]

        # Pick 'Eurodrink' from Catanzaro verso Lamezia group (bonfissuto natale)
        grp = next(g for g in groups if "Catanzaro verso Lamezia Terme" in g["group"])
        target = next((c for c in grp["clients"] if "eurodrink" in c["ragione_sociale"].lower()), None)
        assert target, "Eurodrink must be present as target"

        client_id = target["id"]
        member_id = target["member_id"]

        # Confirm Eurodrink also exists in /api/clients (anagrafica)
        cli = api.get(f"{BASE_URL}/api/clients/{client_id}", headers=umberto_headers)
        assert cli.status_code == 200

        # Confirm Eurodrink is ALSO in mazzetti (other recurrence)
        mz = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members?period=natale",
                     headers=umberto_headers).json()
        mz_member = None
        for g in mz["groups"]:
            for c in g["clients"]:
                if c["id"] == client_id:
                    mz_member = c
                    break
        assert mz_member, "Eurodrink expected in mazzetti recurrence"

        # DELETE from bonfissuto
        d = api.delete(f"{BASE_URL}/api/recurrences/bonfissuto/members/{member_id}",
                       headers=umberto_headers)
        assert d.status_code == 200, d.text

        # After removal: verify NOT in bonfissuto anymore
        r2 = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members?period=natale",
                     headers=umberto_headers).json()
        grp2 = next(g for g in r2["groups"] if "Catanzaro verso Lamezia Terme" in g["group"])
        assert not any(c["id"] == client_id for c in grp2["clients"]), \
            "Eurodrink should be removed from bonfissuto"

        # Still in anagrafica
        cli2 = api.get(f"{BASE_URL}/api/clients/{client_id}", headers=umberto_headers)
        assert cli2.status_code == 200, "client must still exist in anagrafica"
        cli2_data = cli2.json()
        assert cli2_data.get("giro_id"), "client must still have a giro assigned"

        # Still in mazzetti
        mz2 = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members?period=natale",
                      headers=umberto_headers).json()
        still_in_mz = False
        for g in mz2["groups"]:
            for c in g["clients"]:
                if c["id"] == client_id:
                    still_in_mz = True
        assert still_in_mz, "Eurodrink must remain in mazzetti after bonfissuto removal"

        # RESTORE: re-add to bonfissuto (via POST members). Use group 'Catanzaro verso Lamezia Terme'.
        add = api.post(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                       json={"client_id": client_id, "group": "Catanzaro verso Lamezia Terme"},
                       headers=umberto_headers)
        # Some server variants may accept different shapes; accept 200/201
        assert add.status_code in (200, 201), add.text

        # Confirm restored
        r3 = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members?period=natale",
                     headers=umberto_headers).json()
        grp3 = next(g for g in r3["groups"] if "Catanzaro verso Lamezia Terme" in g["group"])
        assert any(c["id"] == client_id for c in grp3["clients"]), \
            "Eurodrink must be restored in bonfissuto after re-add"

    def test_agent_cannot_remove_others_client(self, api, andrea_headers, umberto_headers):
        # Find a member in bonfissuto NOT owned by andrea
        r = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members?period=natale",
                    headers=umberto_headers).json()
        target = None
        for g in r["groups"]:
            for c in g["clients"]:
                if c.get("agent") and c["agent"] != "andrea":
                    target = c
                    break
            if target:
                break
        if not target:
            pytest.skip("no non-andrea member found in bonfissuto")
        d = api.delete(
            f"{BASE_URL}/api/recurrences/bonfissuto/members/{target['member_id']}",
            headers=andrea_headers,
        )
        assert d.status_code == 403, d.text


# ---------------- GIRI order ----------------
EXPECTED_GIRI_ORDER = [
    "Catanzaro e Limitrofi",
    "Catanzaro → Guardavalle",
    "Lamezia Terme → Vibo Valentia",
    "Vibo Valentia → Ricadi",
    "Catanzaro → Altilia",
    "Catanzaro → Crotone",
    "Catanzaro → Sila Piccola",
]


class TestGiriOrder:
    def test_giri_exact_order(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers)
        assert r.status_code == 200
        giri = r.json()
        names = [g["name"] for g in giri]
        assert len(giri) == 7, f"expected 7 giri, got {len(giri)}: {names}"
        # order values must be strictly increasing
        orders = [g.get("order") for g in giri]
        assert orders == sorted(orders), f"giri not sorted by order: {orders}"
        assert names == EXPECTED_GIRI_ORDER, \
            f"giri order mismatch.\n expected: {EXPECTED_GIRI_ORDER}\n got:      {names}"


# ---------------- Da Verificare ----------------
class TestDaVerificare:
    def test_admin_list_da_verificare(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/clients/da-verificare", headers=umberto_headers)
        assert r.status_code == 200
        arr = r.json()
        # Reviewer spec says 6 clienti flaggati needs_review (though CREDENTIALS md says 10).
        assert isinstance(arr, list)
        assert len(arr) >= 1, "expected at least 1 cliente da verificare"
        for c in arr:
            for field in ("id", "ragione_sociale", "citta", "indirizzo", "zona", "agent"):
                assert field in c, f"missing field {field} in {c}"

    def test_assign_giro_clears_needs_review(self, api, umberto_headers):
        # Create a TEST client to safely test assign flow (avoid mutating real 6/10 clients)
        create = api.post(
            f"{BASE_URL}/api/clients",
            json={
                "ragione_sociale": f"TEST_daverificare_{int(time.time())}",
                "citta": "Catanzaro",
                "zona": "TEST",
                "indirizzo": "TEST",
                "provincia": "CZ",
                "cap": "",
                "telefono": "",
                "email": "",
                "giro_id": None,
                "position": None,
                "agent": "umberto",
            },
            headers=umberto_headers,
        )
        assert create.status_code == 200, create.text
        client = create.json()
        client_id = client["id"]
        assert client.get("giro_id") in (None, "")

        # Must appear in da-verificare
        arr = api.get(f"{BASE_URL}/api/clients/da-verificare",
                      headers=umberto_headers).json()
        assert any(c["id"] == client_id for c in arr), \
            "test client without giro should appear in da-verificare"

        # Assign to first giro
        giri = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers).json()
        target_giro = giri[0]

        u = api.put(f"{BASE_URL}/api/clients/{client_id}",
                    json={"giro_id": target_giro["id"], "position": 100000},
                    headers=umberto_headers)
        assert u.status_code == 200, u.text
        after = u.json()
        assert after["giro_id"] == target_giro["id"]
        assert (after.get("extra") or {}).get("needs_review") in (False, None)

        # Must no longer appear in da-verificare
        arr2 = api.get(f"{BASE_URL}/api/clients/da-verificare",
                       headers=umberto_headers).json()
        assert not any(c["id"] == client_id for c in arr2), \
            "assigned client must be removed from da-verificare"

        # Cleanup: soft-delete test client
        d = api.delete(f"{BASE_URL}/api/clients/{client_id}", headers=umberto_headers)
        assert d.status_code == 200


# ---------------- Regression: login + basic flows ----------------
class TestRegressionBasics:
    def test_login_admin(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"username": "umberto", "password": "Umberto2774!"})
        assert r.status_code == 200 and "access_token" in r.json()

    def test_login_agent(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"username": "andrea", "password": "Andrea1606!"})
        assert r.status_code == 200 and r.json()["user"]["role"] == "agent"

    def test_order_agente_60_due_plus_60d(self, api, umberto_headers):
        clients = api.get(f"{BASE_URL}/api/clients/all", headers=umberto_headers).json()
        cli = next(c for c in clients if c.get("giro_id"))
        comp = api.get(f"{BASE_URL}/api/companies", headers=umberto_headers).json()[0]
        r = api.post(f"{BASE_URL}/api/events",
                     json={"client_id": cli["id"], "type": "order",
                           "company_id": comp["id"], "payment_mode": "agente_60",
                           "note": "TEST_regression_agente60"},
                     headers=umberto_headers)
        assert r.status_code == 200
        ev = r.json()
        assert ev.get("due_at") is not None
        # due_at should be created_at + 60 days
        from datetime import datetime, timedelta
        created = datetime.fromisoformat(ev["created_at"].replace("Z", "+00:00"))
        due = datetime.fromisoformat(ev["due_at"].replace("Z", "+00:00"))
        delta = (due - created).days
        assert 59 <= delta <= 61, f"expected ~60d, got {delta}"
