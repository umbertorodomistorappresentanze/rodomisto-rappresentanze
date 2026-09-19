"""Tests for the /api/recurrences feature (Mazzetti + Bonfissuto).

Covers:
- GET /recurrences (list companies+periods+groups)
- GET /recurrences/{company}/members?period=... (structure + counts + statuses)
- POST /recurrences/{company}/order + /undo (idempotent flip)
- Independence across companies AND periods
- POST /recurrences/{company}/members (existing client link vs new recurrence-only client)
- Permissions for agent (andrea): sees only own clients, 403 on other agents' clients
- Integrity of existing giri and clients (no giro_id / position drift after operations)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://route-manager-126.preview.emergentagent.com",
).rstrip("/")


# ---------------------------------------------------------------------------
# List / definitions
# ---------------------------------------------------------------------------
class TestRecurrenceDefs:
    def test_list_recurrences(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/recurrences", headers=umberto_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) == 2
        by_c = {d["company"]: d for d in data}
        assert set(by_c.keys()) == {"mazzetti", "bonfissuto"}

        mz = by_c["mazzetti"]
        assert mz["label"] == "Mazzetti d'Altavilla"
        assert [p["key"] for p in mz["periods"]] == ["natale"]
        assert mz["groups"] == [
            "Catanzaro e limitrofi",
            "Catanzaro verso Soverato",
            "Catanzaro verso Crotone",
            "Catanzaro verso Lamezia Terme",
        ]

        bf = by_c["bonfissuto"]
        assert bf["label"] == "Bonfissuto"
        assert [p["key"] for p in bf["periods"]] == ["pasqua", "natale"]
        assert bf["groups"] == [
            "Catanzaro e limitrofi",
            "Catanzaro verso Soverato",
            "Catanzaro verso Crotone",
            "Catanzaro verso Vibo Valentia",
            "Catanzaro verso Lamezia Terme",
        ]

    def test_list_recurrences_agent(self, api, andrea_headers):
        r = api.get(f"{BASE_URL}/api/recurrences", headers=andrea_headers)
        assert r.status_code == 200
        assert len(r.json()) == 2


# ---------------------------------------------------------------------------
# Members structure & counts (admin sees all)
# ---------------------------------------------------------------------------
class TestRecurrenceMembers:
    def _flatten(self, resp_json):
        return [c for g in resp_json["groups"] for c in g["clients"]]

    def test_mazzetti_natale_total_51(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                    params={"period": "natale"}, headers=umberto_headers)
        assert r.status_code == 200
        j = r.json()
        assert j["company"] == "mazzetti" and j["period"] == "natale"
        flat = self._flatten(j)
        assert len(flat) == 51, f"expected 51 mazzetti members, got {len(flat)}"

        # Every client must have recurrence_status / order_date / member_id
        for c in flat:
            assert c["recurrence_status"] in ("da_gestire", "ordine_effettuato")
            assert "order_date" in c
            assert c.get("member_id")

    def test_bonfissuto_totals_pasqua_and_natale(self, api, umberto_headers):
        for period in ("pasqua", "natale"):
            r = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                        params={"period": period}, headers=umberto_headers)
            assert r.status_code == 200, r.text
            j = r.json()
            counts = {g["group"]: len(g["clients"]) for g in j["groups"]}
            # Expected per problem statement
            expected = {
                "Catanzaro e limitrofi": 6,
                "Catanzaro verso Soverato": 1,
                "Catanzaro verso Crotone": 4,
                "Catanzaro verso Vibo Valentia": 3,
                "Catanzaro verso Lamezia Terme": 3,
            }
            assert counts == expected, f"period={period} got {counts}"
            total = sum(counts.values())
            assert total == 17

    def test_bonfissuto_invalid_period(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                    params={"period": "estate"}, headers=umberto_headers)
        assert r.status_code == 400

    def test_mazzetti_invalid_period_pasqua(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                    params={"period": "pasqua"}, headers=umberto_headers)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Order / Undo flow + independence
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def mazzetti_member(api):
    """Return one arbitrary client_id from mazzetti/natale (admin view)."""
    tok = requests.post(f"{BASE_URL}/api/auth/login",
                        json={"username": "umberto",
                              "password": "Umberto2774!"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                     params={"period": "natale"}, headers=h)
    r.raise_for_status()
    return r.json()["groups"][0]["clients"][0]["id"]


class TestOrderFlow:
    def test_order_then_undo(self, api, umberto_headers, mazzetti_member):
        cid = mazzetti_member
        # place order
        r = api.post(f"{BASE_URL}/api/recurrences/mazzetti/order",
                     json={"client_id": cid, "period": "natale"},
                     headers=umberto_headers)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # verify status flipped
        r2 = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                     params={"period": "natale"}, headers=umberto_headers)
        assert r2.status_code == 200
        flat = [c for g in r2.json()["groups"] for c in g["clients"]]
        target = next(c for c in flat if c["id"] == cid)
        assert target["recurrence_status"] == "ordine_effettuato"
        assert target["order_date"] is not None

        # undo
        r3 = api.post(f"{BASE_URL}/api/recurrences/mazzetti/order/undo",
                      json={"client_id": cid, "period": "natale"},
                      headers=umberto_headers)
        assert r3.status_code == 200

        r4 = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                     params={"period": "natale"}, headers=umberto_headers)
        flat = [c for g in r4.json()["groups"] for c in g["clients"]]
        target = next(c for c in flat if c["id"] == cid)
        assert target["recurrence_status"] == "da_gestire"
        assert target["order_date"] is None

    def test_independence_company_and_period(self, api, umberto_headers):
        """Order on bonfissuto/natale must NOT mark the same client on
        bonfissuto/pasqua nor on mazzetti/natale."""
        # Find a bonfissuto client that also exists in mazzetti (Fortese Pietro is in both)
        r = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                    params={"period": "natale"}, headers=umberto_headers)
        assert r.status_code == 200
        cid = None
        for g in r.json()["groups"]:
            for c in g["clients"]:
                if "Fortese" in c.get("ragione_sociale", ""):
                    cid = c["id"]
                    break
            if cid:
                break
        assert cid, "Fortese Pietro not found among bonfissuto/natale members"

        # place order on bonfissuto/natale
        r1 = api.post(f"{BASE_URL}/api/recurrences/bonfissuto/order",
                      json={"client_id": cid, "period": "natale"},
                      headers=umberto_headers)
        assert r1.status_code == 200

        try:
            # bonfissuto/pasqua should still be da_gestire
            rp = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                         params={"period": "pasqua"}, headers=umberto_headers)
            fp = [c for g in rp.json()["groups"] for c in g["clients"] if c["id"] == cid]
            assert fp and fp[0]["recurrence_status"] == "da_gestire", \
                "bonfissuto/pasqua leaked from bonfissuto/natale order"

            # mazzetti/natale should still be da_gestire for the same client
            rm = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                         params={"period": "natale"}, headers=umberto_headers)
            fm = [c for g in rm.json()["groups"] for c in g["clients"] if c["id"] == cid]
            assert fm and fm[0]["recurrence_status"] == "da_gestire", \
                "mazzetti/natale leaked from bonfissuto/natale order"

            # but bonfissuto/natale is ordine_effettuato
            rn = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                         params={"period": "natale"}, headers=umberto_headers)
            fn = [c for g in rn.json()["groups"] for c in g["clients"] if c["id"] == cid]
            assert fn and fn[0]["recurrence_status"] == "ordine_effettuato"
        finally:
            api.post(f"{BASE_URL}/api/recurrences/bonfissuto/order/undo",
                     json={"client_id": cid, "period": "natale"},
                     headers=umberto_headers)


# ---------------------------------------------------------------------------
# Add member: link existing client (no duplication) vs create new (giro_id=None)
# ---------------------------------------------------------------------------
class TestAddMember:
    def test_add_existing_client_link_no_duplicate(self, api, umberto_headers):
        # find an anagrafica client NOT already in mazzetti
        clients = api.get(f"{BASE_URL}/api/clients/all", headers=umberto_headers).json()
        # get mazzetti current members ids
        rm = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                     params={"period": "natale"}, headers=umberto_headers).json()
        already = {c["id"] for g in rm["groups"] for c in g["clients"]}
        candidate = next(
            (c for c in clients if c.get("giro_id") and c["id"] not in already and c.get("agent") == "umberto"),
            None,
        )
        assert candidate is not None, "no candidate client found"
        cid = candidate["id"]
        original_giro = candidate["giro_id"]
        original_pos = candidate.get("position")

        body = {"client_id": cid, "group": "Catanzaro e limitrofi", "agent": "umberto"}
        r = api.post(f"{BASE_URL}/api/recurrences/mazzetti/members",
                     json=body, headers=umberto_headers)
        assert r.status_code == 200, r.text
        assert r.json()["client_id"] == cid

        # verify no client duplication + giro_id unchanged
        chk = api.get(f"{BASE_URL}/api/clients/{cid}", headers=umberto_headers).json()
        assert chk["giro_id"] == original_giro
        assert chk.get("position") == original_pos

        # verify appears in mazzetti now
        rm2 = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                      params={"period": "natale"}, headers=umberto_headers).json()
        all_new = {c["id"] for g in rm2["groups"] for c in g["clients"]}
        assert cid in all_new

        # cleanup the membership (find member_id and DELETE as admin)
        member_id = next(
            (c["member_id"] for g in rm2["groups"] for c in g["clients"] if c["id"] == cid),
            None,
        )
        assert member_id
        r_del = api.delete(f"{BASE_URL}/api/recurrences/mazzetti/members/{member_id}",
                           headers=umberto_headers)
        assert r_del.status_code == 200

    def test_add_new_recurrence_only_client(self, api, umberto_headers):
        rs = f"TEST_REC_{uuid.uuid4().hex[:8]}"
        body = {
            "ragione_sociale": rs,
            "citta": "Catanzaro",
            "provincia": "CZ",
            "telefono": "3401112222",
            "group": "Catanzaro e limitrofi",
            "agent": "umberto",
        }
        r = api.post(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                     json=body, headers=umberto_headers)
        assert r.status_code == 200, r.text
        new_cid = r.json()["client_id"]

        # verify client has giro_id=None + recurrence_only flag
        chk = api.get(f"{BASE_URL}/api/clients/{new_cid}", headers=umberto_headers).json()
        assert chk["giro_id"] is None
        assert chk.get("extra", {}).get("recurrence_only") is True

        # cleanup: remove membership then delete client (admin only)
        rm = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                     params={"period": "natale"}, headers=umberto_headers).json()
        member_id = next(
            (c["member_id"] for g in rm["groups"] for c in g["clients"] if c["id"] == new_cid),
            None,
        )
        if member_id:
            api.delete(f"{BASE_URL}/api/recurrences/bonfissuto/members/{member_id}",
                       headers=umberto_headers)
        api.delete(f"{BASE_URL}/api/clients/{new_cid}", headers=umberto_headers)


# ---------------------------------------------------------------------------
# Permissions: andrea (agent) sees own clients only; 403 on other agents'
# ---------------------------------------------------------------------------
class TestPermissions:
    def test_andrea_sees_only_own(self, api, andrea_headers):
        # bonfissuto has one andrea client (Macelleria Chiarello Francesco)
        r = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                    params={"period": "natale"}, headers=andrea_headers)
        assert r.status_code == 200
        flat = [c for g in r.json()["groups"] for c in g["clients"]]
        # everything andrea sees must belong to andrea
        for c in flat:
            assert c.get("agent") == "andrea", f"andrea saw {c.get('agent')} client"
        # at least chiarello must be present
        assert any("Chiarello" in c.get("ragione_sociale", "") for c in flat)

    def test_andrea_cannot_order_on_umberto_client(self, api, umberto_headers, andrea_headers):
        # pick any umberto client in mazzetti
        r = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                    params={"period": "natale"}, headers=umberto_headers).json()
        cid = r["groups"][0]["clients"][0]["id"]
        rr = api.post(f"{BASE_URL}/api/recurrences/mazzetti/order",
                      json={"client_id": cid, "period": "natale"},
                      headers=andrea_headers)
        assert rr.status_code == 403

    def test_andrea_order_own_client_ok(self, api, umberto_headers, andrea_headers):
        # find andrea's chiarello in bonfissuto natale
        r = api.get(f"{BASE_URL}/api/recurrences/bonfissuto/members",
                    params={"period": "natale"}, headers=andrea_headers).json()
        flat = [c for g in r["groups"] for c in g["clients"]]
        cid = next(c["id"] for c in flat if "Chiarello" in c["ragione_sociale"])

        r1 = api.post(f"{BASE_URL}/api/recurrences/bonfissuto/order",
                      json={"client_id": cid, "period": "natale"},
                      headers=andrea_headers)
        assert r1.status_code == 200
        r2 = api.post(f"{BASE_URL}/api/recurrences/bonfissuto/order/undo",
                      json={"client_id": cid, "period": "natale"},
                      headers=andrea_headers)
        assert r2.status_code == 200


# ---------------------------------------------------------------------------
# Integrity of existing giri & clients — snapshot before/after
# ---------------------------------------------------------------------------
class TestIntegrity:
    def test_giri_untouched(self, api, umberto_headers):
        r = api.get(f"{BASE_URL}/api/giri", headers=umberto_headers)
        assert r.status_code == 200
        giri = r.json()
        # exactly 6 known giri exist (from previous iterations)
        assert len(giri) >= 3, f"unexpected giri count: {len(giri)}"

    def test_clients_have_giro_id_unchanged_after_order(self, api, umberto_headers):
        """Placing an order on a recurrence must NOT touch the client's giro_id/position."""
        # pick a mazzetti member linked to an existing anagrafica client with giro_id set
        rm = api.get(f"{BASE_URL}/api/recurrences/mazzetti/members",
                     params={"period": "natale"}, headers=umberto_headers).json()
        flat = [c for g in rm["groups"] for c in g["clients"]]
        # first client with giro_id present
        target = None
        for c in flat:
            full = api.get(f"{BASE_URL}/api/clients/{c['id']}", headers=umberto_headers).json()
            if full.get("giro_id"):
                target = full
                break
        assert target, "no mazzetti member with giro_id found"
        cid = target["id"]
        before = (target["giro_id"], target.get("position"))

        api.post(f"{BASE_URL}/api/recurrences/mazzetti/order",
                 json={"client_id": cid, "period": "natale"},
                 headers=umberto_headers)
        try:
            after_doc = api.get(f"{BASE_URL}/api/clients/{cid}",
                                headers=umberto_headers).json()
            after = (after_doc["giro_id"], after_doc.get("position"))
            assert before == after, f"giro/position drift after order: {before} -> {after}"
        finally:
            api.post(f"{BASE_URL}/api/recurrences/mazzetti/order/undo",
                     json={"client_id": cid, "period": "natale"},
                     headers=umberto_headers)
