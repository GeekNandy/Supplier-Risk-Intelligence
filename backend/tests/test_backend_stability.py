import asyncio
import base64

import pytest
from fastapi.testclient import TestClient

from app import data
from app.access import AccessMiddleware
from app.main import app

client = TestClient(app)


def jury_headers(username="jury", password="a-test-password-123"):
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def configure_jury(monkeypatch):
    monkeypatch.setenv("JURY_USERNAME", "jury")
    monkeypatch.setenv("JURY_PASSWORD", "a-test-password-123")
    monkeypatch.setenv("REQUIRE_JURY_AUTH", "true")


def test_jury_login_protects_api_docs_and_frontend(monkeypatch):
    configure_jury(monkeypatch)
    for path in ("/", "/api/meta", "/api/status", "/api/docs", "/api/openapi.json"):
        response = client.get(path)
        assert response.status_code == 401
        assert response.headers["www-authenticate"].startswith("Basic ")
    assert client.get("/api/meta", headers=jury_headers()).status_code == 200
    assert client.get("/api/docs", headers=jury_headers()).status_code == 200
    assert client.get("/api/meta", headers=jury_headers(password="wrong")).status_code == 401
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/ready").json()["jury_auth_enabled"] is True


@pytest.mark.parametrize(
    "authorization",
    ["Bearer x", "Basic ???", "Basic /w==", "Basic anVyeQ==", "Basic " + "x" * 9000],
)
def test_malformed_login_does_not_crash(monkeypatch, authorization):
    configure_jury(monkeypatch)
    assert client.get("/api/meta", headers={"Authorization": authorization}).status_code == 401


@pytest.mark.parametrize(
    "settings",
    [
        {"JURY_USERNAME": "jury"},
        {"JURY_PASSWORD": "only-a-password"},
        {"JURY_USERNAME": "jury", "JURY_PASSWORD": "short"},
        {"REQUIRE_JURY_AUTH": "true"},
    ],
)
def test_incomplete_jury_configuration_fails_closed(monkeypatch, settings):
    for key, value in settings.items():
        monkeypatch.setenv(key, value)
    assert client.get("/api/meta").status_code == 503
    assert client.get("/api/ready").status_code == 503
    assert client.get("/api/health").status_code == 200


def test_cors_preflight_and_authentication_errors_are_readable(monkeypatch):
    configure_jury(monkeypatch)
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type,Authorization",
    }
    response = client.options("/api/chat", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    response = client.get("/api/meta", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 401 and "access-control-allow-origin" in response.headers


def test_readiness_reports_dataset_and_required_ai_configuration(monkeypatch):
    assert client.get("/api/ready").json()["supplier_count"] == 10_000
    monkeypatch.setenv("REQUIRE_LIVE_AI", "true")
    assert client.get("/api/ready").status_code == 503
    for name, value in {
        "LLM_API_KEY": "test-key",
        "LLM_BASE_URL": "https://model.example.com/v1",
        "LLM_MODEL": "test-model",
        "TAVILY_API_KEY": "test-search",
    }.items():
        monkeypatch.setenv(name, value)
    assert client.get("/api/ready").json()["live_ai_configured"] is True
    monkeypatch.setenv("LLM_EXTRA_BODY", '{"messages": []}')
    assert client.get("/api/ready").status_code == 503


def test_filters_pagination_and_twenty_supplier_comparison():
    first = client.get("/api/suppliers", params={"max_total_risk": 40, "limit": 20}).json()
    second = client.get(
        "/api/suppliers", params={"max_total_risk": 40, "limit": 20, "offset": 20}
    ).json()
    assert len(first["items"]) == len(second["items"]) == 20
    assert all(row["Total_Risk_Index"] <= 40 for row in first["items"] + second["items"])
    assert not {row["supplierID"] for row in first["items"]}.intersection(
        row["supplierID"] for row in second["items"]
    )
    ids = [row["supplierID"] for row in first["items"]]
    result = client.post("/api/compare", json={"supplier_ids": ids}).json()
    assert len(result["suppliers"]) == 20
    expected = [
        row["supplierID"]
        for row in first["items"]
        if row["Total_Risk_Index"] == first["items"][0]["Total_Risk_Index"]
    ]
    assert result["lowest_risk_supplier_ids"] == expected
    assert client.get("/api/suppliers", params={"risk_level": "made up"}).status_code == 400
    assert client.get("/api/suppliers", params={"max_total_risk": 101}).status_code == 422
    assert client.get("/api/suppliers", params={"offset": 20_000}).json()["items"] == []


@pytest.mark.parametrize(
    "payload",
    [
        {"message": "risk", "supplier_ids": ["SUPP_00012", " SUPP_00012 "]},
        {"message": "risk", "supplier_ids": [" "]},
        {"message": "risk", "supplier_ids": ["x" * 101]},
        {"message": "risk", "arbitrary_option": True},
    ],
)
def test_chat_request_boundaries(payload):
    assert client.post("/api/chat", json=payload).status_code == 422


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data",
        "https://example.com:99999/",
        "https://exa mple.com",
        "https://example.com\n/path",
        "https://-bad.example.com/",
    ],
)
def test_invalid_research_urls_are_rejected(url):
    assert (
        client.post("/api/research", json={"company_name": "Acme Rail", "website": url}).status_code
        == 422
    )


@pytest.mark.parametrize(
    "content",
    [
        "supplierID,Supplier Name,Total_Risk_Index\n",
        "supplierID,Supplier Name,Total_Risk_Index\nA,Alpha,101\n",
        "supplierID,Supplier Name,Total_Risk_Index\nA,Alpha,unknown\n",
        "supplierID,Supplier Name,Total_Risk_Index\nA,Alpha,10,extra\n",
        "supplierID,Supplier Name,Total_Risk_Index\nA,Alpha,10\nA,Again,20\n",
        "wrong,columns\nA,B\n",
    ],
)
def test_invalid_dataset_returns_service_unavailable(monkeypatch, tmp_path, content):
    path = tmp_path / "suppliers.csv"
    path.write_text(content)
    data.suppliers.cache_clear()
    monkeypatch.setattr(data, "DATA_PATH", path)
    try:
        assert client.get("/api/ready").status_code == 503
        assert client.get("/api/meta").status_code == 503
    finally:
        data.suppliers.cache_clear()


def test_missing_dataset_returns_service_unavailable(monkeypatch, tmp_path):
    data.suppliers.cache_clear()
    monkeypatch.setattr(data, "DATA_PATH", tmp_path / "missing.csv")
    try:
        assert client.get("/api/health").json()["dataset_present"] is False
        assert client.get("/api/ready").status_code == 503
        assert (
            client.post(
                "/api/chat", json={"message": "Why is the Total Risk Index of SUPP_00018 so high?"}
            ).status_code
            == 503
        )
    finally:
        data.suppliers.cache_clear()


def test_oversized_and_invalid_json_requests_do_not_crash():
    assert client.post("/api/chat", content=b"x" * 65_537).status_code == 413
    assert (
        client.post(
            "/api/chat", content=b"{", headers={"Content-Type": "application/json"}
        ).status_code
        == 422
    )


def test_chunked_request_limit_does_not_trust_content_length():
    async def run():
        async def should_not_run(*args):
            pytest.fail("Oversized body reached the API")

        chunks = iter(
            [
                {"type": "http.request", "body": b"x" * 40_000, "more_body": True},
                {"type": "http.request", "body": b"y" * 40_000, "more_body": False},
            ]
        )
        messages = []

        async def receive():
            return next(chunks)

        async def send(message):
            messages.append(message)

        await AccessMiddleware(should_not_run)(
            {"type": "http", "path": "/api/chat", "method": "POST", "headers": []}, receive, send
        )
        assert messages[0]["status"] == 413

    asyncio.run(run())
