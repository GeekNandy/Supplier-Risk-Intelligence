"""HTTP adapters; credentials and upstream response bodies never enter API errors."""

import json
import os
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx


class ServiceError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class Settings:
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    tavily_api_key: str = ""
    llm_extra_body: str = "{}"

    @classmethod
    def from_env(cls):
        return cls(
            **{
                key: os.getenv(env, default).strip()
                for key, env, default in [
                    ("llm_api_key", "LLM_API_KEY", ""),
                    ("llm_base_url", "LLM_BASE_URL", ""),
                    ("llm_model", "LLM_MODEL", ""),
                    ("tavily_api_key", "TAVILY_API_KEY", ""),
                    ("llm_extra_body", "LLM_EXTRA_BODY", "{}"),
                ]
            }
        )

    @property
    def llm_ready(self):
        return bool(self.llm_api_key and self.llm_base_url and self.llm_model)

    def require_llm(self):
        if not self.llm_ready:
            raise ServiceError(
                "Set LLM_API_KEY, LLM_BASE_URL and LLM_MODEL on the Python server to enable live AI.",
                503,
            )
        try:
            parsed = urlsplit(self.llm_base_url)
            _ = parsed.port
            if (
                parsed.scheme not in {"https", "http"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.query
                or parsed.fragment
                or any(ord(char) <= 32 or ord(char) == 127 for char in self.llm_base_url)
                or parsed.path.rstrip("/").endswith("/chat/completions")
            ):
                raise ValueError()
            extra = json.loads(self.llm_extra_body, parse_constant=reject_constant)
            if not isinstance(extra, dict) or set(extra) & {
                "model",
                "messages",
                "tools",
                "stream",
                "tool_choice",
                "max_tokens",
            }:
                raise ValueError()
        except (ValueError, TypeError):
            raise ServiceError(
                "Check LLM_BASE_URL (API prefix without credentials/query) and LLM_EXTRA_BODY (provider-specific JSON options only).",
                503,
            ) from None


def reject_constant(value):
    raise ValueError("Non-finite JSON numbers are not supported")


def json_object(content: str | None) -> dict:
    """Accept JSON or one fenced JSON block; never evaluate generated code."""
    if not isinstance(content, str):
        raise ServiceError("Model returned no final content. Check its reasoning/token settings.")
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    try:
        value = json.loads(content, parse_constant=reject_constant)
    except (ValueError, TypeError):
        raise ServiceError("Model returned an invalid JSON response. Please retry.") from None
    if not isinstance(value, dict):
        raise ServiceError("Model response must be a JSON object.")
    return value


async def post_json(
    client: httpx.AsyncClient, url: str, api_key: str, payload: dict, label: str
) -> dict:
    try:
        response = await client.post(
            url, headers={"Authorization": f"Bearer {api_key}"}, json=payload
        )
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except httpx.TimeoutException:
        raise ServiceError(f"{label} timed out. Please retry.", 504) from None
    except httpx.HTTPStatusError as error:
        status = error.response.status_code
        if status in (401, 403):
            raise ServiceError(
                f"{label} authentication failed. Check the server API key and endpoint access.", 503
            ) from None
        if status == 429:
            raise ServiceError(f"{label} rate limit reached. Please retry shortly.", 503) from None
        raise ServiceError(
            f"{label} rejected the request (HTTP {status}). Check the server provider configuration."
        ) from None
    except (httpx.RequestError, httpx.InvalidURL, ValueError):
        raise ServiceError(f"{label} could not return a valid response.") from None


class ModelClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client

    async def complete(self, messages: list[dict], tools: list[dict] | None = None) -> dict:
        self.settings.require_llm()
        base = self.settings.llm_base_url.rstrip("/")
        extra = json.loads(self.settings.llm_extra_body)
        payload = {
            "model": self.settings.llm_model,
            "messages": messages,
            "max_tokens": 4096,
            "stream": False,
            **extra,
        }
        if tools:
            payload.update(tools=tools, tool_choice="auto")
        result = await post_json(
            self.client,
            base + "/chat/completions",
            self.settings.llm_api_key,
            payload,
            "Model provider",
        )
        try:
            choice = result["choices"][0]
            message = choice["message"]
            if choice.get("finish_reason") == "length":
                raise ServiceError(
                    "Model reached its output limit. Use a shorter response or disable optional thinking in LLM_EXTRA_BODY."
                )
            if not isinstance(message, dict):
                raise ValueError()
            return message
        except (KeyError, IndexError, TypeError, ValueError, AttributeError):
            raise ServiceError(
                "Model provider returned an unsupported chat-completion response."
            ) from None


class SearchClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        if not settings.tavily_api_key:
            raise ServiceError(
                "Set TAVILY_API_KEY on the Python server to enable company research.", 503
            )
        self.settings, self.client = settings, client

    async def search(self, query: str) -> list[dict]:
        result = await post_json(
            self.client,
            "https://api.tavily.com/search",
            self.settings.tavily_api_key,
            {
                "query": query,
                "search_depth": "basic",
                "max_results": 4,
                "include_answer": False,
                "include_raw_content": False,
                "include_published_date": True,
            },
            "Search provider",
        )
        rows = result.get("results")
        if not isinstance(rows, list):
            raise ServiceError("Search provider returned no valid results list.")
        return [row for row in rows[:4] if isinstance(row, dict)]

    async def extract(self, urls: list[str]) -> dict:
        return await post_json(
            self.client,
            "https://api.tavily.com/extract",
            self.settings.tavily_api_key,
            {
                "urls": urls[:5],
                "extract_depth": "basic",
                "format": "text",
                "timeout": 10,
            },
            "Page extraction provider",
        )
