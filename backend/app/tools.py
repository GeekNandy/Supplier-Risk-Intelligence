"""Allowlisted supplier tools with argument validation and bounded result sizes."""

from typing import Literal

from pydantic import Field

from app import data
from app.models import CompareRequest, StrictArguments, SupplierID


class LookupArguments(StrictArguments):
    supplier_id: SupplierID


class SearchArguments(StrictArguments):
    q: str = Field(default="", max_length=300)
    risk_level: str | None = None
    sort_by: str = "Total_Risk_Index"
    order: Literal["asc", "desc"] = "asc"
    offset: int = Field(default=0, ge=0, le=10000)
    limit: int = Field(default=10, ge=1, le=20)
    max_total_risk: float | None = Field(default=None, ge=0, le=100)


class ComparisonArguments(CompareRequest, StrictArguments):
    pass


TOOL_MODELS = {
    "get_supplier": LookupArguments,
    "search_suppliers": SearchArguments,
    "compare_suppliers": ComparisonArguments,
}
DESCRIPTIONS = {
    "get_supplier": "Look up the actual risk profile and operational metrics for one exact supplier ID.",
    "search_suppliers": "Search by ID/name, filter overall risk level, and rank by a numeric field. Lower risk scores are better. Results are paginated and capped at 20.",
    "compare_suppliers": "Compare 1–20 supplier IDs on a risk field and find the lowest-risk supplier(s), preserving ties. Returns the highest observed categories; weights of the total index are unknown.",
}


def tool_schemas() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": DESCRIPTIONS[name],
                "parameters": model.model_json_schema(),
            },
        }
        for name, model in TOOL_MODELS.items()
    ]


def execute_tool(name: str, arguments: dict) -> tuple[dict, list[dict]]:
    if name not in TOOL_MODELS:
        raise ValueError("Unknown supplier tool")
    request = TOOL_MODELS[name].model_validate(arguments)
    if name == "get_supplier":
        row = data.get_supplier(request.supplier_id)
        return row, [row]
    if name == "search_suppliers":
        result = data.search_suppliers(
            request.q,
            request.risk_level,
            request.sort_by,
            request.order == "desc",
            request.offset,
            request.limit,
            request.max_total_risk,
        )
        return result, result["items"]
    result = data.compare_suppliers(request.supplier_ids, request.rank_by)
    return result, result["suppliers"]
