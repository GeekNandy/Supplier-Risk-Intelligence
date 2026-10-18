"""Per-process admission control and request-scoped provider usage; no prompt logging."""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from threading import BoundedSemaphore
from time import perf_counter

MAX_CONCURRENT_AI_REQUESTS = 2
_slots = BoundedSemaphore(MAX_CONCURRENT_AI_REQUESTS)


class CapacityError(Exception):
    pass


@dataclass
class AIUsage:
    started: float = field(default_factory=perf_counter)
    calls: dict[str, int] = field(default_factory=lambda: {"model": 0, "search": 0, "extract": 0})
    reported_model_calls: int = 0
    tokens: dict[str, int] = field(
        default_factory=lambda: {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    )

    def headers(self) -> dict[str, str]:
        result = {
            "X-AI-Model-Calls": str(self.calls["model"]),
            "X-AI-Search-Calls": str(self.calls["search"]),
            "X-AI-Extract-Calls": str(self.calls["extract"]),
            "X-AI-Duration-Ms": str(round((perf_counter() - self.started) * 1000)),
        }
        # Missing provider usage is unknown, rather than an invented zero or partial total.
        if self.calls["model"] and self.reported_model_calls == self.calls["model"]:
            result.update(
                {
                    "X-AI-Prompt-Tokens": str(self.tokens["prompt_tokens"]),
                    "X-AI-Completion-Tokens": str(self.tokens["completion_tokens"]),
                    "X-AI-Total-Tokens": str(self.tokens["total_tokens"]),
                }
            )
        return result


_usage: ContextVar[AIUsage | None] = ContextVar("ai_usage", default=None)


def record_call(kind: str):
    if usage := _usage.get():
        usage.calls[kind] += 1


def record_model_usage(value):
    usage = _usage.get()
    if usage is None or not isinstance(value, dict):
        return
    if any(type(value.get(key)) is not int or value[key] < 0 for key in usage.tokens):
        return
    usage.reported_model_calls += 1
    for key in usage.tokens:
        usage.tokens[key] += value[key]


@contextmanager
def ai_request():
    """Reject excess work immediately, and release capacity even on cancellation."""
    if not _slots.acquire(blocking=False):
        raise CapacityError()
    usage = AIUsage()
    token = _usage.set(usage)
    try:
        yield usage
    finally:
        _usage.reset(token)
        _slots.release()
