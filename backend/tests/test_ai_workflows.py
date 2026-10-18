"""Exercise grounding, research branching and failure handling without paid APIs."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.providers import ModelClient, SearchClient, ServiceError, Settings, post_json
from app.research import SourceBook

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_provider_configuration(monkeypatch):
    for name in ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "TAVILY_API_KEY", "LLM_EXTRA_BODY"]:
        monkeypatch.delenv(name, raising=False)


def live_settings(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-key-never-sent")
    monkeypatch.setenv("LLM_BASE_URL", "https://model.example.com/v1")
    monkeypatch.setenv("LLM_MODEL", "test-nemotron")
    monkeypatch.setenv("TAVILY_API_KEY", "test-search-never-sent")


def test_data_only_answers_both_challenge_examples():
    result = client.post(
        "/api/chat",
        json={
            "message": "Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?"
        },
    ).json()
    assert result["mode"] == "data_only" and result["model"] is None
    assert result["suggested_supplier_ids"] == ["SUPP_00731"]
    assert [item["value"] for item in result["evidence"]] == [54, 65, 53]
    why = client.post(
        "/api/chat", json={"message": "Why is the Total Risk Index of SUPP_00018 so high?"}
    ).json()
    assert why["evidence"][0]["value"] == 80
    assert "weights" in why["answer"]
    assert "99" in why["answer"] and "98" in why["answer"]


def test_no_key_mode_does_not_substitute_overall_risk_for_delivery():
    result = client.post(
        "/api/chat",
        json={
            "message": "Which has the lowest delivery risk?",
            "supplier_ids": ["SUPP_00012", "SUPP_00450"],
        },
    ).json()
    assert result["evidence"] == []
    assert "outside" in result["answer"]
    assert client.post("/api/chat", json={"message": "   "}).status_code == 422
    assert (
        client.post(
            "/api/chat", json={"message": "Why is the Total Risk Index of SUPP_99999 so high?"}
        ).status_code
        == 404
    )


def test_live_tool_loop_resolves_values_from_data_not_model(monkeypatch):
    live_settings(monkeypatch)
    messages_seen = []

    async def complete(self, messages, tools=None):
        messages_seen.append(list(messages))
        if len(messages_seen) == 1:
            assert {tool["function"]["name"] for tool in tools} == {
                "get_supplier",
                "search_suppliers",
                "compare_suppliers",
            }
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
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
                ],
            }
        return {
            "content": json.dumps(
                {
                    "answer": "SUPP_00731 has the lowest financial risk with a score of 53.",
                    "evidence": [
                        {
                            "supplier_id": "SUPP_00731",
                            "field": "Financial_Health_Score",
                            "value": 9999,
                        }
                    ],
                    "suggested_supplier_ids": ["SUPP_00731"],
                }
            )
        }

    monkeypatch.setattr(ModelClient, "complete", complete)
    response = client.post(
        "/api/chat", json={"message": "Which selected supplier has lowest financial risk?"}
    )
    assert response.status_code == 200
    result = response.json()
    assert result["mode"] == "live" and result["model"] == "test-nemotron"
    assert result["evidence"][0]["value"] == 53
    assert result["tool_calls"][0]["status"] == "completed"
    assert any(message["role"] == "tool" for message in messages_seen[1])


@pytest.mark.parametrize(
    "bad_answer,bad_reference",
    [("The risk score is 9999.", False), ("SUPP_99999 is the winner.", True)],
)
def test_unsupported_narrative_values_and_citations_are_withheld(
    monkeypatch, bad_answer, bad_reference
):
    live_settings(monkeypatch)
    calls = 0

    async def complete(self, messages, tools=None):
        nonlocal calls
        calls += 1
        if calls == 1:
            return {
                "tool_calls": [
                    {
                        "id": "lookup",
                        "function": {
                            "name": "get_supplier",
                            "arguments": '{"supplier_id":"SUPP_00731"}',
                        },
                    }
                ]
            }
        evidence = [{"supplier_id": "SUPP_00731", "field": "Financial_Health_Score"}]
        if bad_reference:
            evidence.append({"supplier_id": "SUPP_99999", "field": "Financial_Health_Score"})
        return {"content": json.dumps({"answer": bad_answer, "evidence": evidence})}

    monkeypatch.setattr(ModelClient, "complete", complete)
    result = client.post("/api/chat", json={"message": "Compare risk"}).json()
    assert "9999" not in result["answer"] and "SUPP_99999" not in result["answer"]
    assert "Verified supplier values" in result["answer"] and result["warnings"]


def test_unknown_tools_cannot_execute_arbitrary_code(monkeypatch):
    live_settings(monkeypatch)
    calls = 0

    async def complete(self, messages, tools=None):
        nonlocal calls
        calls += 1
        if calls == 1:
            return {
                "tool_calls": [
                    {
                        "id": "bad",
                        "function": {
                            "name": "execute_python",
                            "arguments": '{"code":"raise RuntimeError()"}',
                        },
                    }
                ]
            }
        assert json.loads(messages[-1]["content"]).get("error")
        return {"content": '{"answer":"A fabricated supplier answer","evidence":[]}'}

    monkeypatch.setattr(ModelClient, "complete", complete)
    result = client.post("/api/chat", json={"message": "Run code"}).json()
    assert result["tool_calls"][0]["status"] == "failed"
    assert "fabricated" not in result["answer"]
    assert result["evidence"] == []


def test_model_tool_loop_has_a_finite_budget(monkeypatch):
    live_settings(monkeypatch)
    calls = 0

    async def complete(self, messages, tools=None):
        nonlocal calls
        calls += 1
        return {
            "tool_calls": [
                {
                    "id": f"lookup{calls}",
                    "function": {
                        "name": "get_supplier",
                        "arguments": '{"supplier_id":"SUPP_00731"}',
                    },
                }
            ]
        }

    monkeypatch.setattr(ModelClient, "complete", complete)
    result = client.post("/api/chat", json={"message": "Keep searching"})
    assert result.status_code == 502 and calls == 4


def test_research_requires_configuration_and_real_company_inputs():
    assert client.post("/api/research", json={"company_name": "Acme Rail"}).status_code == 503
    assert client.post("/api/research", json={"company_name": "SUPP_00018"}).status_code == 422
    for url in [
        "http://127.0.0.1/admin",
        "http://localhost/secrets",
        "file:///etc/passwd",
        "https://user:secret@example.com",
    ]:
        assert (
            client.post(
                "/api/research", json={"company_name": "Acme Rail", "website": url}
            ).status_code
            == 422
        )
    assert client.get("/api/status").json()["research_ready"] is False


def test_ambiguous_company_stops_before_risk_search(monkeypatch):
    live_settings(monkeypatch)
    queries = []

    async def search(self, query):
        queries.append(query)
        return [
            {
                "url": "https://example.com/company",
                "title": "Acme companies",
                "content": "Several companies share this name.",
            }
        ]

    async def complete(self, messages, tools=None):
        return {
            "content": json.dumps(
                {
                    "company": {
                        "name": "Acme",
                        "identity_confidence": "low",
                        "identity_source_ids": ["S1"],
                    },
                    "queries": ["risk"],
                    "clarification_question": "Which country and website?",
                }
            )
        }

    monkeypatch.setattr(SearchClient, "search", search)
    monkeypatch.setattr(ModelClient, "complete", complete)
    result = client.post("/api/research", json={"company_name": "Acme"}).json()
    assert result["status"] == "needs_clarification" and len(queries) == 1
    assert result["findings"] == [] and result["clarification_question"]


def test_research_follows_evidenced_red_flag_and_filters_fake_citations(monkeypatch):
    live_settings(monkeypatch)
    searches, extractions, model_calls = [], [], 0

    async def search(self, query):
        searches.append(query)
        n = len(searches)
        return [
            {
                "url": f"https://example.com/source{n}_{i}",
                "title": f"Source {n}/{i}",
                "content": f"Evidence about Acme Rail number {n}/{i}",
                "published_date": "2026-10-01",
            }
            for i in range(1, 5)
        ]

    async def extract(self, urls):
        extractions.append(urls)
        return {
            "results": [
                {"url": url, "raw_content": f"Detailed evidence about Acme Rail at {url}"}
                for url in urls
            ]
        }

    async def complete(self, messages, tools=None):
        nonlocal model_calls
        model_calls += 1
        if model_calls == 1:
            answer = {
                "company": {
                    "name": "Acme Rail GmbH",
                    "website": "https://example.com/source1_1",
                    "country": "Germany",
                    "identity_confidence": "high",
                    "identity_source_ids": ["S1"],
                },
                "queries": ["financial stability", "quality recalls"],
            }
        elif model_calls == 2:
            answer = {
                "red_flags": [
                    {
                        "category": "quality",
                        "severity": "high",
                        "claim": "Historic recall needs follow-up",
                        "source_ids": ["S9"],
                    }
                ],
                "follow_up_query": "recall resolution status",
            }
        else:
            answer = {
                "findings": [
                    {
                        "category": "quality",
                        "severity": "unknown",
                        "claim": "A historic recall requires review of the resolution report.",
                        "source_ids": ["S9", "S13"],
                    },
                    {
                        "category": "financial",
                        "severity": "critical",
                        "claim": "Invented bankruptcy",
                        "source_ids": ["S999"],
                    },
                ],
                "limitations": [],
            }
        return {"content": json.dumps(answer)}

    monkeypatch.setattr(SearchClient, "search", search)
    monkeypatch.setattr(SearchClient, "extract", extract)
    monkeypatch.setattr(ModelClient, "complete", complete)
    response = client.post(
        "/api/research", json={"company_name": "Acme Rail", "country": "Germany"}
    )
    assert response.status_code == 200
    report = response.json()
    assert len(searches) == 4 and len(extractions) == 2 and model_calls == 3
    assert len(report["findings"]) == 1
    assert "bankruptcy" not in report["summary"]
    assert report["status"] == "partial" and report["limitations"]
    assert {source["id"] for source in report["sources"]} == {f"S{i}" for i in range(1, 17)}
    source_by_id = {source["id"]: source for source in report["sources"]}
    assert source_by_id["S9"]["content_type"] == "page_content"
    assert source_by_id["S13"]["content_type"] == "page_content"
    assert source_by_id["S4"]["content_type"] == "search_snippet"
    assert "https://example.com/source2_1" in extractions[0]
    assert "https://example.com/source3_1" in extractions[0]
    assert all(source["published_at"] == "2026-10-01" for source in report["sources"])


def test_source_deduplication_uses_canonical_urls_and_retains_ids():
    book = SourceBook("2026-10-18T10:00:00+00:00")
    book.add([{"url": "https://example.com/news?utm_source=a", "content": "A report"}])
    book.add([{"url": "https://example.com/news#section", "raw_content": "Full page text"}])
    book.add([{"url": "https://example.org/copy", "content": "A report"}])
    assert len(book.items) == 1
    source = book.sources()[0]
    assert source.id == "S1" and source.content_type == "page_content"
    assert source.published_at is None


def test_partial_research_keeps_available_evidence_when_one_search_fails(monkeypatch):
    live_settings(monkeypatch)
    searches, model_calls = 0, 0

    async def search(self, query):
        nonlocal searches
        searches += 1
        if searches == 2:
            raise ServiceError("Search provider rate limit reached.", 503)
        return [
            {
                "url": f"https://example.com/source{searches}",
                "content": f"Company evidence {searches}",
            }
        ]

    async def extract(self, urls):
        raise ServiceError("Page extraction provider timed out.", 504)

    async def complete(self, messages, tools=None):
        nonlocal model_calls
        model_calls += 1
        if model_calls == 1:
            answer = {
                "company": {
                    "name": "Acme Rail",
                    "identity_confidence": "medium",
                    "identity_source_ids": ["S1"],
                },
                "queries": ["financial", "quality"],
            }
        elif model_calls == 2:
            answer = {"red_flags": []}
        else:
            answer = {
                "findings": [
                    {
                        "category": "operational",
                        "severity": "unknown",
                        "claim": "Limited operational evidence is available.",
                        "source_ids": ["S2"],
                    }
                ]
            }
        return {"content": json.dumps(answer)}

    monkeypatch.setattr(SearchClient, "search", search)
    monkeypatch.setattr(SearchClient, "extract", extract)
    monkeypatch.setattr(ModelClient, "complete", complete)
    result = client.post("/api/research", json={"company_name": "Acme Rail"}).json()
    assert result["status"] == "partial" and len(result["sources"]) == 2
    assert len(result["findings"]) == 1
    assert any("rate limit" in text for text in result["limitations"])
    assert any("timed out" in text for text in result["limitations"])
    assert any(step["status"] == "failed" for step in result["steps"])


def test_model_adapter_sends_native_tools_and_provider_options():
    async def run():
        def respond(request):
            body = json.loads(request.content)
            assert str(request.url) == "https://model.example.com/v1/chat/completions"
            assert request.headers["Authorization"] == "Bearer test-key"
            assert body["model"] == "test-nemotron" and body["tool_choice"] == "auto"
            assert body["tools"][0]["function"]["name"] == "get_supplier"
            assert body["chat_template_kwargs"]["enable_thinking"] is False
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {"finish_reason": "stop", "message": {"content": '{"answer":"ok"}'}}
                    ]
                },
            )

        settings = Settings(
            llm_api_key="test-key",
            llm_base_url="https://model.example.com/v1/",
            llm_model="test-nemotron",
            llm_extra_body='{"chat_template_kwargs":{"enable_thinking":false}}',
        )
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(respond), trust_env=False
        ) as http:
            from app.tools import tool_schemas

            message = await ModelClient(settings, http).complete(
                [{"role": "user", "content": "Compare"}], tool_schemas()
            )
        assert message["content"] == '{"answer":"ok"}'

    asyncio.run(run())


@pytest.mark.parametrize("status,expected", [(401, 503), (429, 503), (500, 502)])
def test_upstream_errors_are_clear_and_do_not_echo_secrets(status, expected):
    async def run():
        transport = httpx.MockTransport(
            lambda request: httpx.Response(status, json={"error": "PRIVATE-UPSTREAM-CONTENT"})
        )
        async with httpx.AsyncClient(transport=transport, trust_env=False) as http:
            with pytest.raises(ServiceError) as caught:
                await post_json(
                    http, "https://api.example.com/test", "PRIVATE-KEY", {}, "Model provider"
                )
        assert caught.value.status_code == expected
        assert "PRIVATE" not in str(caught.value)

    asyncio.run(run())


def test_http_timeout_is_returned_as_gateway_timeout():
    async def run():
        def timeout(request):
            raise httpx.ReadTimeout("upstream timeout", request=request)

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(timeout), trust_env=False
        ) as http:
            with pytest.raises(ServiceError) as caught:
                await post_json(
                    http, "https://api.example.com/test", "PRIVATE-KEY", {}, "Model provider"
                )
            assert caught.value.status_code == 504

    asyncio.run(run())
