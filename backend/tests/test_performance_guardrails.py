import asyncio
import json

import httpx
import pytest

from app import data
from app.ai_runtime import CapacityError, ai_request, record_call, record_model_usage
from app.main import app
from app.providers import ModelClient, Settings
from app.research import SourceBook


def test_derived_data_is_cached_defensive_and_rebuilt_for_a_new_dataset(monkeypatch):
    rows = (dict(data.suppliers()[0]),)
    monkeypatch.setattr(data, "suppliers", lambda: rows)
    original = data.build_metadata
    builds = []

    def counted(values):
        builds.append(values)
        return original(values)

    monkeypatch.setattr(data, "build_metadata", counted)
    metadata = data.metadata()
    metadata["risk_fields"].clear()
    assert data.metadata()["risk_fields"]
    assert data.get_supplier(rows[0]["supplierID"]) == rows[0]
    data.compare_suppliers([rows[0]["supplierID"]])
    assert len(builds) == 1

    updated = {**rows[0], "supplierID": "RELOADED"}
    rows = (updated,)
    assert data.get_supplier("RELOADED") == updated
    with pytest.raises(KeyError):
        data.get_supplier(builds[0][0]["supplierID"])
    assert len(builds) == 2


def test_research_context_budget_preserves_followup_sources_and_discloses_truncation():
    book = SourceBook("2026-10-18T12:00:00Z")
    for index in range(20):
        book.add(
            [
                {
                    "url": f"https://example.com/{index}",
                    "raw_content": f"Source {index}: " + "x" * 6000,
                }
            ]
        )
    context = book.context()
    assert len(context) == 20
    assert {item["id"] for item in context} == book.ids
    assert context[-1]["id"] == "S20"
    assert sum(len(item["text"]) for item in context) <= SourceBook.TEXT_BUDGET
    assert all(item["text_truncated"] for item in context)
    assert all("retrieved_at" not in item and "excerpt" not in item for item in context)
    # Compacting model context must not overwrite the evidence returned to buyers.
    assert len(book.items["https://example.com/19"]["text"]) == 6000
    assert len(book.sources()) == 20
    small = SourceBook("today")
    small.add([{"url": "https://example.com/short", "content": "Short evidence"}])
    assert small.context()[0]["text"] == "Short evidence"
    assert small.context()[0]["text_truncated"] is False


def test_actual_provider_usage_is_recorded_without_changing_model_messages():
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    json={
                        "choices": [{"message": {"role": "assistant", "content": "{}"}}],
                        "usage": {
                            "prompt_tokens": 123,
                            "completion_tokens": 17,
                            "total_tokens": 140,
                        },
                    },
                )
            )
        ) as client:
            model = ModelClient(Settings("test-key", "https://model.example/v1", "test"), client)
            with ai_request() as usage:
                message = await model.complete([{"role": "user", "content": "hello"}])
                assert json.loads(message["content"]) == {}
                assert usage.headers()["X-AI-Model-Calls"] == "1"
                assert usage.headers()["X-AI-Prompt-Tokens"] == "123"
                assert usage.headers()["X-AI-Total-Tokens"] == "140"

    asyncio.run(run())


@pytest.mark.parametrize("value", [None, {}, {"prompt_tokens": True}, {"prompt_tokens": -1}])
def test_unknown_or_incomplete_usage_is_not_reported_as_zero(value):
    with ai_request() as usage:
        record_call("model")
        record_model_usage(value)
        assert "X-AI-Total-Tokens" not in usage.headers()
        record_call("model")
        record_model_usage({"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12})
        assert "X-AI-Total-Tokens" not in usage.headers()


@pytest.mark.parametrize("error", [RuntimeError, asyncio.CancelledError])
def test_capacity_and_request_context_are_released_on_error_or_cancellation(error):
    with pytest.raises(error), ai_request():
        record_call("model")
        raise error()
    with ai_request() as first, ai_request() as second:
        assert first.headers()["X-AI-Model-Calls"] == "0"
        assert second.headers()["X-AI-Model-Calls"] == "0"
        with pytest.raises(CapacityError), ai_request():
            pytest.fail("Capacity must be rejected before work starts")


def test_excess_ai_requests_fail_fast_while_data_remains_available(monkeypatch):
    import app.main as main

    async def run():
        release = asyncio.Event()
        both_entered = asyncio.Event()
        entered = 0
        original = main.answer_question

        async def held(request):
            nonlocal entered
            entered += 1
            own_count = entered
            record_call("model")
            record_model_usage(
                {"prompt_tokens": own_count, "completion_tokens": 1, "total_tokens": own_count + 1}
            )
            if entered == 2:
                both_entered.set()
            await release.wait()
            return await original(request)

        monkeypatch.setattr(main, "answer_question", held)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            body = {"message": "Why is the Total Risk Index of SUPP_00018 so high?"}
            pending = [asyncio.create_task(client.post("/api/chat", json=body)) for _ in range(2)]
            try:
                await asyncio.wait_for(both_entered.wait(), timeout=5)
                busy = await client.post("/api/chat", json=body)
                assert busy.status_code == 429
                assert busy.headers["Retry-After"] == "5"
                assert entered == 2
                assert (await client.get("/api/health")).status_code == 200
                assert (
                    await client.post("/api/compare", json={"supplier_ids": ["SUPP_00018"]})
                ).status_code == 200
            finally:
                release.set()
                responses = await asyncio.gather(*pending)
            assert all(response.status_code == 200 for response in responses)
            assert [response.headers["X-AI-Prompt-Tokens"] for response in responses] == ["1", "2"]

    asyncio.run(run())
