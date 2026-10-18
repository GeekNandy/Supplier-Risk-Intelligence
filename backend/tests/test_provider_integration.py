"""Run real provider adapters and API orchestration with HTTP transport stubs."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.providers import ServiceError, Settings, json_object

client = TestClient(app)
RealAsyncClient = httpx.AsyncClient


def configure_transport(monkeypatch, respond):
    for name, value in {
        "LLM_API_KEY": "test-model-key",
        "LLM_BASE_URL": "https://model.example.com/v1",
        "LLM_MODEL": "test-nemotron",
        "TAVILY_API_KEY": "test-search-key",
    }.items():
        monkeypatch.setenv(name, value)

    def factory(**kwargs):
        return RealAsyncClient(transport=httpx.MockTransport(respond), trust_env=False, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", factory)


def model_response(content=None, calls=None):
    message = {"role": "assistant", "content": json.dumps(content) if content is not None else None}
    if calls:
        message["tool_calls"] = calls
    return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": message}]})


def test_chat_full_http_contract_corrects_an_incorrect_winner(monkeypatch):
    bodies = []

    def respond(request):
        assert str(request.url) == "https://model.example.com/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer test-model-key"
        body = json.loads(request.content)
        bodies.append(body)
        if len(bodies) == 1:
            assert len(body["tools"]) == 3
            return model_response(
                calls=[
                    {
                        "id": "comparison",
                        "type": "function",
                        "function": {
                            "name": "compare_suppliers",
                            "arguments": json.dumps(
                                {
                                    "supplier_ids": ["SUPP_00012", "SUPP_00450", "SUPP_00731"],
                                    "rank_by": "Financial_Health_Score",
                                }
                            ),
                        },
                    }
                ]
            )
        actual = json.loads(
            next(message["content"] for message in body["messages"] if message["role"] == "tool")
        )
        assert actual["lowest_risk_supplier_ids"] == ["SUPP_00731"]
        return model_response(
            {
                "answer": "SUPP_00012 has the lowest financial risk with 54.",
                "evidence": [{"supplier_id": "SUPP_00012", "field": "Financial_Health_Score"}],
                "suggested_supplier_ids": ["SUPP_00012"],
            }
        )

    configure_transport(monkeypatch, respond)
    response = client.post(
        "/api/chat",
        json={
            "message": "Which of SUPP_00012, SUPP_00450 and SUPP_00731 has lowest financial risk?"
        },
    )
    assert response.status_code == 200
    answer = response.json()
    assert answer["mode"] == "live" and len(bodies) == 2
    assert answer["suggested_supplier_ids"] == ["SUPP_00731"]
    assert "Lowest risk by Financial_Health_Score: SUPP_00731" in answer["answer"]
    assert {item["supplier_id"]: item["value"] for item in answer["evidence"]} == {
        "SUPP_00012": 54,
        "SUPP_00450": 65,
        "SUPP_00731": 53,
    }


def test_research_full_http_search_extract_and_report_contract(monkeypatch):
    model_calls, search_calls, extract_calls = 0, 0, 0

    def respond(request):
        nonlocal model_calls, search_calls, extract_calls
        body = json.loads(request.content)
        if request.url.host == "model.example.com":
            model_calls += 1
            assert request.headers["authorization"] == "Bearer test-model-key"
            assert "tools" not in body
            if model_calls == 1:
                return model_response(
                    {
                        "company": {
                            "name": "Acme Rail",
                            "website": "https://acme.example.com/",
                            "identity_confidence": "high",
                            "identity_source_ids": ["S1"],
                        },
                        "queries": ["financial operational risk", "compliance quality issues"],
                    }
                )
            if model_calls == 2:
                return model_response({"red_flags": []})
            return model_response(
                {
                    "findings": [
                        {
                            "category": "financial",
                            "severity": "unknown",
                            "claim": "Public financial information requires buyer review.",
                            "source_ids": ["S2"],
                        }
                    ],
                    "limitations": [],
                }
            )
        assert request.url.host == "api.tavily.com"
        assert request.headers["authorization"] == "Bearer test-search-key"
        if request.url.path == "/search":
            search_calls += 1
            assert body["max_results"] == 4 and body["search_depth"] == "basic"
            assert "Acme Rail" in body["query"]
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "url": f"https://acme.example.com/source-{search_calls}",
                            "title": "Acme Rail evidence",
                            "content": f"Evidence item {search_calls}",
                            "published_date": "2026-10-01",
                        }
                    ]
                },
            )
        assert request.url.path == "/extract"
        extract_calls += 1
        assert 1 <= len(body["urls"]) <= 5
        return httpx.Response(
            200,
            json={
                "results": [
                    {"url": url, "raw_content": f"Full source evidence: {url}"}
                    for url in body["urls"]
                ],
                "failed_results": [],
            },
        )

    configure_transport(monkeypatch, respond)
    response = client.post(
        "/api/research", json={"company_name": "Acme Rail", "country": "Germany"}
    )
    assert response.status_code == 200
    report = response.json()
    # A new official homepage was extracted without a publication date: partial is honest.
    assert report["status"] == "partial"
    assert (model_calls, search_calls, extract_calls) == (3, 3, 1)
    assert len(report["findings"]) == 1 and "[S2]" in report["summary"]
    assert all(source["content_type"] == "page_content" for source in report["sources"])
    assert all(source["retrieved_at"] for source in report["sources"])


def test_research_retains_sources_after_triage_provider_failure(monkeypatch):
    calls = 0

    def respond(request):
        nonlocal calls
        if request.url.host == "model.example.com":
            calls += 1
            if calls == 1:
                return model_response(
                    {
                        "company": {
                            "name": "Acme Rail",
                            "identity_confidence": "high",
                            "identity_source_ids": ["S1"],
                        },
                        "queries": ["financial risk"],
                    }
                )
            if calls == 2:
                return httpx.Response(503, json={"error": "PRIVATE-UPSTREAM"})
            return model_response(
                {
                    "findings": [
                        {
                            "category": "financial",
                            "severity": "unknown",
                            "claim": "Evidence remains incomplete.",
                            "source_ids": ["S1"],
                        }
                    ]
                }
            )
        if request.url.path == "/search":
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "url": "https://acme.example.com/report",
                            "content": "Acme company report",
                            "published_date": "2026-10-01",
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "url": "https://acme.example.com/report",
                        "raw_content": "Extracted Acme report",
                    }
                ]
            },
        )

    configure_transport(monkeypatch, respond)
    report = client.post("/api/research", json={"company_name": "Acme Rail"}).json()
    assert report["status"] == "partial" and report["sources"] and report["findings"]
    assert any(
        step["name"] == "Assess red flags" and step["status"] == "failed"
        for step in report["steps"]
    )
    assert "PRIVATE" not in json.dumps(report)


def test_research_identity_model_failure_keeps_sources(monkeypatch):
    def respond(request):
        if request.url.host == "model.example.com":
            return httpx.Response(429, json={"error": "PRIVATE-DETAIL"})
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "url": "https://acme.example.com/company",
                        "content": "Company identity evidence",
                    }
                ]
            },
        )

    configure_transport(monkeypatch, respond)
    report = client.post("/api/research", json={"company_name": "Acme Rail"}).json()
    assert report["status"] == "partial" and len(report["sources"]) == 1
    assert report["findings"] == [] and report["company"]["identity_confidence"] == "low"


@pytest.mark.parametrize(
    "base,extra",
    [
        ("https://model.example.com:99999/v1", "{}"),
        ("https://model.example.com/v1?key=bad", "{}"),
        ("https://user:password@model.example.com/v1", "{}"),
        ("https://model.example.com/v1/chat/completions", "{}"),
        ("https://model.example.com/v1", '{"max_tokens": 99999}'),
        ("https://model.example.com/v1", '{"temperature": NaN}'),
    ],
)
def test_invalid_provider_configuration_fails_before_network(base, extra):
    settings = Settings(
        llm_api_key="PRIVATE-KEY", llm_base_url=base, llm_model="test", llm_extra_body=extra
    )
    with pytest.raises(ServiceError) as caught:
        settings.require_llm()
    assert caught.value.status_code == 503 and "PRIVATE" not in str(caught.value)


@pytest.mark.parametrize("content", ['{"score": NaN}', '{"score": Infinity}', "[]", "not JSON"])
def test_nonstandard_model_json_is_rejected(content):
    with pytest.raises(ServiceError):
        json_object(content)


def test_overall_chat_timeout_has_a_clear_api_error(monkeypatch):
    from app.providers import ModelClient

    configure_transport(monkeypatch, lambda request: pytest.fail("No HTTP expected"))

    async def timeout(*args, **kwargs):
        raise TimeoutError()

    monkeypatch.setattr(ModelClient, "complete", timeout)
    assert client.post("/api/chat", json={"message": "Compare risk"}).status_code == 504
