import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://route-manager-126.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, username, password):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def umberto_token(api):
    return _login(api, "umberto", "Umberto2026!")


@pytest.fixture(scope="session")
def andrea_token(api):
    return _login(api, "andrea", "Andrea2026!")


@pytest.fixture
def umberto_headers(umberto_token):
    return {"Authorization": f"Bearer {umberto_token}",
            "Content-Type": "application/json"}


@pytest.fixture
def andrea_headers(andrea_token):
    return {"Authorization": f"Bearer {andrea_token}",
            "Content-Type": "application/json"}
