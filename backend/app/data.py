"""Deterministic calculations shared by REST endpoints and future LLM tools."""

import csv
import math
import os
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = Path(os.getenv("DATA_PATH", ROOT / "data" / "supplier_risk_dataset.csv"))
CRITERIA_PATH = ROOT / "data" / "risk_criteria_description.md"


def parse_cell(value: str | None):
    if value is None or value.strip() == "":
        return None
    try:
        number = float(value)
        if not math.isfinite(number):
            return None
        return int(number) if number.is_integer() else number
    except ValueError:
        return value


@lru_cache(maxsize=1)
def suppliers() -> tuple[dict, ...]:
    with DATA_PATH.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"supplierID", "Supplier Name", "Total_Risk_Index"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("Dataset does not contain the required supplier columns")
        rows = tuple({key: parse_cell(value) for key, value in row.items()} for row in reader)
    ids = [row["supplierID"] for row in rows]
    if len(set(ids)) != len(ids) or any(not value for value in ids):
        raise ValueError("Supplier IDs must be present and unique")
    return rows


def metadata() -> dict:
    rows = suppliers()
    columns = list(rows[0]) if rows else []
    numeric_fields = [
        field for field in columns
        if any(isinstance(row[field], (int, float)) for row in rows)
        and all(row[field] is None or isinstance(row[field], (int, float)) for row in rows)
    ]
    return {
        "row_count": len(rows),
        "columns": columns,
        "numeric_fields": numeric_fields,
        "risk_fields": [field for field in numeric_fields if field.endswith("_Score") or field == "Total_Risk_Index"],
        "risk_levels": sorted({row["Total_Risk_Index_Level"] for row in rows if row.get("Total_Risk_Index_Level")}),
        "criteria_markdown": CRITERIA_PATH.read_text() if CRITERIA_PATH.exists() else "",
        "score_direction": "All supplied risk scores: 0 = no risk, 100 = maximum risk. Operational percentages have their own semantics.",
        "total_risk_note": "The supplied index is a weighted average. Category weights are not provided; exact contributions cannot be reconstructed.",
    }


def search_suppliers(q: str = "", risk_level: str | None = None,
                     sort_by: str = "Total_Risk_Index", descending: bool = False,
                     offset: int = 0, limit: int = 50) -> dict:
    if sort_by not in metadata()["numeric_fields"]:
        raise ValueError("sort_by must be a numeric field returned by /api/meta")
    needle = q.casefold()
    rows = [row for row in suppliers()
            if (not needle or needle in str(row["supplierID"]).casefold() or needle in str(row["Supplier Name"]).casefold())
            and (not risk_level or row.get("Total_Risk_Index_Level") == risk_level)]
    present = [row for row in rows if row[sort_by] is not None]
    missing = [row for row in rows if row[sort_by] is None]
    ordered = sorted(present, key=lambda row: row[sort_by], reverse=descending) + missing
    return {"items": ordered[offset:offset + limit], "total": len(rows), "offset": offset, "limit": limit}


def get_supplier(supplier_id: str) -> dict:
    for row in suppliers():
        if row["supplierID"] == supplier_id:
            return row
    raise KeyError(supplier_id)


def compare_suppliers(supplier_ids: list[str], rank_by: str = "Total_Risk_Index") -> dict:
    fields = metadata()["risk_fields"]
    if rank_by not in fields:
        raise ValueError("rank_by must be a risk field returned by /api/meta")
    rows = [get_supplier(supplier_id) for supplier_id in supplier_ids]
    scored = [row for row in rows if row[rank_by] is not None]
    lowest = min((row[rank_by] for row in scored), default=None)
    return {
        "suppliers": rows,
        "risk_fields": fields,
        "rank_by": rank_by,
        "lowest_risk_supplier_ids": [row["supplierID"] for row in scored if row[rank_by] == lowest],
        "highest_risk_categories": {
            row["supplierID"]: [
                {"field": field, "value": row[field]}
                for field in sorted(
                    [field for field in fields if field != "Total_Risk_Index" and row[field] is not None],
                    key=lambda field: row[field], reverse=True,
                )[:3]
            ] for row in rows
        },
        "notes": [
            "Lower values mean lower risk for all risk score fields, including Financial_Health_Score.",
            "Highest categories describe observed scores, not proven causes or weighted contributions to the Total Risk Index.",
            "Missing values remain unknown and are excluded when finding the lowest score.",
        ],
    }

