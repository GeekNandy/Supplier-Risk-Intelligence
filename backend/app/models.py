import ipaddress
import re
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Scalar = str | int | float | None
SupplierID = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def public_url(value: str) -> str:
    if any(ord(char) <= 32 or ord(char) == 127 for char in value):
        raise ValueError("URLs cannot contain whitespace or control characters")
    parsed = urlsplit(value)
    _ = parsed.port  # Validate malformed or out-of-range ports as well.
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
        raise ValueError("Use a public HTTP(S) URL without embedded credentials")
    if "." not in host or host.endswith((".local", ".localhost", ".internal", ".test", ".invalid")):
        raise ValueError("Use a public company website")
    try:
        ascii_host = host.encode("idna").decode("ascii")
    except UnicodeError:
        raise ValueError("Use a valid public hostname") from None
    if len(ascii_host) > 253 or any(
        not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
        for label in ascii_host.split(".")
    ):
        raise ValueError("Use a valid public hostname")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if not address.is_global:
            raise ValueError("Private and reserved IP addresses are not supported")
    return value


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supplier_ids: list[SupplierID] = Field(min_length=1, max_length=20)
    rank_by: str = Field(default="Total_Risk_Index", max_length=100)

    @field_validator("supplier_ids")
    @classmethod
    def unique_ids(cls, values: list[str]):
        if len(values) != len(set(values)):
            raise ValueError("Select unique supplier IDs")
        return values


class MetadataResponse(BaseModel):
    row_count: int
    columns: list[str]
    numeric_fields: list[str]
    risk_fields: list[str]
    risk_levels: list[str]
    criteria_markdown: str
    score_direction: str
    total_risk_note: str


class SupplierPage(BaseModel):
    items: list[dict[str, Scalar]]
    total: int
    offset: int
    limit: int


class RiskCategory(BaseModel):
    field: str
    value: int | float


class ComparisonResponse(BaseModel):
    suppliers: list[dict[str, Scalar]]
    risk_fields: list[str]
    rank_by: str
    lowest_risk_supplier_ids: list[str]
    highest_risk_categories: dict[str, list[RiskCategory]]
    notes: list[str]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=4000)
    supplier_ids: list[SupplierID] = Field(default_factory=list, max_length=20)

    @field_validator("supplier_ids")
    @classmethod
    def unique_ids(cls, values: list[str]):
        return CompareRequest.unique_ids(values)

    @field_validator("message")
    @classmethod
    def nonempty_message(cls, value: str):
        if not value.strip():
            raise ValueError("Message cannot be blank")
        return value.strip()


class ResearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company_name: str = Field(min_length=2, max_length=200)
    country: str | None = Field(default=None, max_length=100)
    website: str | None = Field(default=None, max_length=500)

    @field_validator("company_name")
    @classmethod
    def real_company_name(cls, value: str):
        value = value.strip()
        if len(value) < 2 or re.fullmatch(r"SUPP_\d+", value, flags=re.I):
            raise ValueError(
                "Enter a real company name; anonymized supplier IDs cannot be researched"
            )
        return value

    @field_validator("website")
    @classmethod
    def valid_website(cls, value: str | None):
        return public_url(value.strip()) if value and value.strip() else None

    @field_validator("country")
    @classmethod
    def clean_country(cls, value: str | None):
        return value.strip() or None if value else None


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
