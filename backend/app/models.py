import ipaddress
import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

Scalar = str | int | float | None


def public_url(value: str) -> str:
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
        raise ValueError("Use a public HTTP(S) URL without embedded credentials")
    if "." not in host or host.endswith((".local", ".localhost", ".internal", ".test", ".invalid")):
        raise ValueError("Use a public company website")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if not address.is_global:
            raise ValueError("Private and reserved IP addresses are not supported")
    return value


class CompareRequest(BaseModel):
    supplier_ids: list[str] = Field(min_length=1, max_length=20)
    rank_by: str = "Total_Risk_Index"

    @field_validator("supplier_ids")
    @classmethod
    def unique_ids(cls, values: list[str]):
        if len(values) != len(set(values)):
            raise ValueError("Select unique supplier IDs")
        return values


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    supplier_ids: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("message")
    @classmethod
    def nonempty_message(cls, value: str):
        if not value.strip():
            raise ValueError("Message cannot be blank")
        return value.strip()


class ResearchRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=200)
    country: str | None = Field(default=None, max_length=100)
    website: str | None = Field(default=None, max_length=500)

    @field_validator("company_name")
    @classmethod
    def real_company_name(cls, value: str):
        value = value.strip()
        if len(value) < 2 or re.fullmatch(r"SUPP_\d+", value, flags=re.I):
            raise ValueError("Enter a real company name; anonymized supplier IDs cannot be researched")
        return value

    @field_validator("website")
    @classmethod
    def valid_website(cls, value: str | None):
        return public_url(value) if value else None


class Evidence(BaseModel):
    supplier_id: str
    field: str
    value: Scalar


class ToolActivity(BaseModel):
    name: str
    arguments: dict
    status: Literal["completed", "failed"]


class ChatResponse(BaseModel):
    answer: str
    evidence: list[Evidence] = Field(default_factory=list)
    suggested_supplier_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    tool_calls: list[ToolActivity] = Field(default_factory=list)
    mode: Literal["live", "data_only"]
    model: str | None = None


class Company(BaseModel):
    name: str
    website: str | None = None
    country: str | None = None
    identity_confidence: Literal["high", "medium", "low"] = "low"
    identity_source_ids: list[str] = Field(default_factory=list)


class Finding(BaseModel):
    category: str = Field(max_length=80)
    severity: Literal["low", "medium", "high", "critical", "unknown"]
    claim: str = Field(min_length=1, max_length=2000)
    source_ids: list[str] = Field(min_length=1, max_length=10)


class Source(BaseModel):
    id: str
    url: str
    title: str
    published_at: str | None = None
    retrieved_at: str
    excerpt: str
    content_type: Literal["search_snippet", "page_content"] = "search_snippet"


class ResearchStep(BaseModel):
    name: str
    status: Literal["completed", "failed", "skipped"]
    detail: str


class ResearchResponse(BaseModel):
    status: Literal["complete", "partial", "needs_clarification"]
    company: Company
    plan: list[str]
    summary: str
    findings: list[Finding] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    researched_at: str
    model: str
    steps: list[ResearchStep] = Field(default_factory=list)
    clarification_question: str | None = None


class StrictArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")

