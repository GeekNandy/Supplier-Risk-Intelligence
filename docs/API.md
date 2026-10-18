# API contract

Python owns `/api`. Development uses Vite's proxy; the production container serves both UI and API. Interactive request/response schemas are at `/api/docs`; the generated snapshot is `docs/openapi.json`.

## Implemented

| Method | Path | Request / result |
|---|---|---|
| GET | `/api/health` | `status`, `dataset_present` |
| GET | `/api/meta` | Row count, fields, score semantics, original criteria Markdown |
| GET | `/api/suppliers` | `q`, `risk_level`, `sort_by`, `order=asc|desc`, `offset`, `limit` → `items`, `total`, `offset`, `limit` |
| GET | `/api/suppliers/{supplier_id}` | Original supplier row; 404 for unknown ID |
| POST | `/api/compare` | `supplier_ids` (1–20 unique IDs), `rank_by` (risk field) → supplier rows, lowest-risk IDs including ties, top observed risk categories, notes |

Fields retain their original dataset names. `supplierID`, `Supplier Name`, and `Total_Risk_Index` are canonical keys. Filters use existing `Total_Risk_Index_Level` labels. Numeric fields and risk fields come from `/api/meta`; never guess names or directions. Lower risk scores are better. Missing scores are null.

Example comparison:

```json
{"supplier_ids":["SUPP_00012","SUPP_00450","SUPP_00731"],"rank_by":"Financial_Health_Score"}
```

## Planned chatbot (route returns 501 until implemented)

`POST /api/chat`

```json
{"message":"Which selected supplier has the lowest financial risk?","supplier_ids":["SUPP_00012","SUPP_00450"]}
```

Agree on this response shape before parallel implementation:

```json
{
  "answer": "Human-readable explanation grounded in tool results",
  "evidence": [{"supplier_id":"SUPP_00012","field":"Financial_Health_Score","value":42}],
  "suggested_supplier_ids": ["SUPP_00012"],
  "warnings": []
}
```

The numbers above illustrate the proposed schema, not actual data. Use a bounded tool loop calling `get_supplier`, `search_suppliers`, and `compare_suppliers`. Enforce argument schemas; cap tool output and calls. Never execute generated code. Numerical claims must match tool results. A high category score does not establish its exact contribution to the supplied Total Risk Index.

## Planned research (route returns 501 until implemented)

`POST /api/research`

```json
{"company_name":"Company name","country":"Germany","website":"https://example.com"}
```

Proposed response:

```json
{
  "company": {"name":"Resolved legal entity","website":"https://example.com","country":"Germany"},
  "plan": ["Verify entity", "Search financial and operational risks", "Investigate red flags"],
  "summary": "Summary grounded in the returned sources",
  "findings": [{"category":"financial","severity":"unknown","claim":"Evidence-based finding","source_ids":["S1"]}],
  "sources": [{"id":"S1","url":"https://example.com/report","title":"Source title","published_at":null,"retrieved_at":"ISO-8601 timestamp"}],
  "limitations": ["Gaps and unverified claims"],
  "researched_at": "ISO-8601 timestamp"
}
```

Start with a synchronous, time-bounded endpoint. Search company sources and public news, extract relevant pages, then perform one focused follow-up if the evidence raises a red flag. Show actual workflow progress if streaming is added; do not invent progress. Use provider/network timeouts. Do not infer low risk from absent coverage or conflate a company with a similarly named entity. Keep company research separate from the anonymized dataset.
