# API contract

Python owns `/api`. Vite proxies API requests during development; the production container serves UI and API from one origin. Interactive schemas: `/api/docs`. Generated snapshot: `docs/openapi.json`. Frontend ownership/tasks: `docs/EKATERINA_HANDOFF.md`.

## Supplier and configuration APIs

| Method | Path | Request / result |
|---|---|---|
| GET | `/api/health` | `status`, `dataset_present` |
| GET | `/api/ready` | `status=ready`, `supplier_count`, `jury_auth_enabled`, `live_ai_configured`; 503 on invalid dataset/required configuration; no provider calls |
| GET | `/api/status` | `chat_mode=live|data_only|configuration_required`, `model_configured`, `search_configured`, `research_ready`, nullable `model`, `jury_auth_enabled`, `configuration_only=true`; no keys or provider calls |
| GET | `/api/meta` | Row count, columns, numeric/risk fields, overall risk levels, original criteria Markdown and score semantics |
| GET | `/api/suppliers` | `q` (≤300 chars), `risk_level`, `max_total_risk` (0–100), `sort_by`, `order=asc|desc`, `offset`, `limit` (1–200) → `items`, `total`, `offset`, `limit` |
| GET | `/api/suppliers/{supplier_id}` | Original supplier row; 404 for unknown ID |
| POST | `/api/compare` | `supplier_ids` (1–20 unique IDs), `rank_by` (risk field) → original supplier rows, lowest-risk IDs including ties, top observed risk categories and notes |

Fields retain their original dataset names. `supplierID`, `Supplier Name`, and `Total_Risk_Index` are canonical keys. Filter labels come from `Total_Risk_Index_Level`. Numeric/risk fields come from `/api/meta`. All supplied risk scores, including `Financial_Health_Score`, use 0=no risk and 100=maximum risk. Delivery/confirmation percentages have their own semantics. Missing scores remain null and are excluded when choosing a lowest score.

Unknown risk labels or sort fields return 400. `max_total_risk` excludes unknown total scores. Pagination past the last row returns an empty `items` array with the same filtered `total`. Comparisons and selected chat IDs reject duplicates, blank IDs and IDs longer than 100 characters. POST request objects reject unknown fields.

Example comparison:

```json
{"supplier_ids":["SUPP_00012","SUPP_00450","SUPP_00731"],"rank_by":"Financial_Health_Score"}
```

The actual financial scores are 54, 65 and 53 respectively; `SUPP_00731` is the lowest. Category weights for the Total Risk Index are not supplied; top observed categories do not establish exact contributions or causality.

## Grounded chatbot

`POST /api/chat`

```json
{"message":"Which selected supplier has the lowest financial risk?","supplier_ids":["SUPP_00012","SUPP_00450","SUPP_00731"]}
```

`message` is a nonblank string up to 4,000 characters. `supplier_ids` provides optional selected-supplier context, at most 20 IDs. This is a single-turn API; conversation history is not accepted or retained.

Response fields:

| Field | Type / behavior |
|---|---|
| `answer` | Human-readable answer |
| `evidence` | Array of `{supplier_id, field, value}`; server resolves actual values from tool-returned supplier rows |
| `suggested_supplier_ids` | Known IDs returned by tools; an optional UI action, not an automatic change to selection |
| `warnings` | Data-only mode, omitted citations or explanation fallback details |
| `tool_calls` | Actual activity: `{name, arguments, status: completed|failed}`; no model reasoning |
| `mode` | `live` or `data_only` |
| `model` | Configured model ID in live mode; null in data-only mode |

### Live behavior

With model credentials, use native OpenAI-compatible tool calling through `ModelClient` and three allowlisted tools:

- `get_supplier(supplier_id)`
- `search_suppliers(q, risk_level, sort_by, order, offset, limit, max_total_risk)`; tool results capped at 20 rows
- `compare_suppliers(supplier_ids, rank_by)`; 1–20 unique IDs

Arguments are validated using Pydantic with unknown fields forbidden. Numeric operations happen in Python. No generated Python/SQL is executed. The CSV is not sent wholesale to the model. The model receives criteria definitions and bounded tool results.

The final evidence references must point to rows returned by a tool in that request. Values are filled by the server, not accepted from the model. Unknown evidence references are removed. Unsupported scalar values, unknown supplier mentions or invalid references trigger a verified-values response. If there is no verified evidence, the generated supplier answer is withheld.

For clear lowest-risk questions on the supported financial, credit, quality, cyber and total criteria, completed comparison-tool results determine the rendered ranking and suggested winners. The server fills evidence for all compared suppliers and preserves ties. A comparison missing any explicitly requested/selected supplier is withheld. Broader natural-language interpretations remain model-generated and should be reviewed against evidence.

Budget: at most four model calls, three tool rounds, eight tool invocations, 60 seconds total. Invalid tool arguments return an error to the model so it can correct its request within the budget.

### Data-only behavior

Without `LLM_API_KEY`, explicitly labelled data-only responses support the challenge's lowest-risk comparisons (financial, credit, quality, cyber and overall) and overall-profile explanations. Broader criteria/questions return an instruction to configure the model, rather than guessing a different metric. These responses never claim Nemotron was used.

The supplied example for `SUPP_00018` reports a Total Risk Index of 80 and highest observed categories Governance 99, Compliance 98 and Operational Resilience 95, with the unknown-weight limitation.

## Company research

`POST /api/research`

```json
{"company_name":"Siemens AG","country":"Germany","website":"https://www.siemens.com"}
```

Requires configured model and Tavily credentials. `company_name` is required; `country` and public HTTP(S) `website` are optional. Anonymized supplier IDs, blank company names, embedded URL credentials and obvious private/local URLs are rejected. Pages are retrieved through Tavily; the API does not directly crawl arbitrary user-supplied hosts.

| Response field | Meaning |
|---|---|
| `status` | `complete`, `partial` or `needs_clarification` |
| `company` | `{name, website, country, identity_confidence, identity_source_ids}` |
| `plan` | Planned research steps/queries |
| `summary` | Composed from accepted cited findings; unsupported findings cannot remain in the summary |
| `findings` | `{category, severity, claim, source_ids}`; severity is `low|medium|high|critical|unknown` |
| `sources` | `{id, url, title, published_at, retrieved_at, excerpt, content_type}`; content type is `search_snippet|page_content` |
| `limitations` | Actual evidence gaps, partial failures, missing dates or removed unsupported citations |
| `researched_at` | UTC ISO-8601 timestamp |
| `model` | Configured hosted model ID |
| `steps` | Actual completed/failed/skipped workflow actions: `{name,status,detail}` |
| `clarification_question` | A question to refine ambiguous company identity; otherwise null |

Workflow:

1. Search the company identity using country/website hints.
2. Ask the model to resolve the entity and plan up to two risk searches. Unresolved/uncited identity returns `needs_clarification` before broader risk searches.
3. Search the planned topics concurrently, then extract up to five pages, prioritizing the company website and both risk topics.
4. Ask the model to identify cited red flags. Perform at most one targeted follow-up search and extract its pages if a supported concern needs verification.
5. Synthesize findings, validate every source ID, remove unsupported findings and compose the summary from accepted claims.

Budget: four searches total, two extraction batches of at most five pages, three model calls, 120 seconds total. Sources are deduplicated by canonical URL and identical content, with a bounded source collection. Tracking parameters/fragments are removed for URL deduplication.

Publication dates are preserved from source-provider metadata; missing dates remain null. Retrieval time is not publication time. Source IDs in findings and entity resolution must refer to retrieved sources. Semantic evaluation of identity/claims/severity remains model-generated; the UI should make source review easy. Source text is treated as untrusted evidence, not executable instructions. Reports keep real companies separate from the anonymized dataset and do not assign invented numerical risk scores.

The endpoint returns one JSON response after execution; it does not stream progress. Show a generic in-progress state, then display the actual `steps` after completion. Search, extraction, red-flag assessment and report-generation failures preserve available sources in partial reports. A failed identity model step returns a partial report with unverified identity and no risk findings. An initial search failure or overall workflow timeout returns an HTTP error. Claims containing unrecognized inline source references are removed, as are findings with invalid structured source IDs. Do not display missing negative coverage as low risk.

## Jury access and request limits

When `JURY_USERNAME` and `JURY_PASSWORD` are set, HTTP Basic authentication covers the UI, API and Swagger/OpenAPI documents. Passwords must contain at least 12 characters. `GET /api/health` and `GET /api/ready` remain public for platform probes. CORS preflight does not require login. Both credentials can be blank for local development; partial/invalid credential configuration returns 503 instead of exposing the app.

Production should set `REQUIRE_JURY_AUTH=true`; set `REQUIRE_LIVE_AI=true` to fail readiness when complete model/search configuration is absent. These checks validate local configuration, not provider credit balance or connectivity. Use HTTPS in production. The OpenAPI `JuryBasic` security scheme documents this optional deployment authentication.

API POST bodies are limited to 64 KiB, including chunked requests. No conversation, jury passwords or provider credentials are returned by the API or stored in generated reports.

## Error handling

| HTTP status | Behavior |
|---|---|
| 400 | Invalid data field or malformed data operation |
| 401 | Jury login missing, invalid or malformed; includes `WWW-Authenticate` |
| 404 | Supplier lookup failed |
| 413 | API POST request body exceeds 64 KiB |
| 422 | Request/schema validation failed; detail can be an array |
| 502 | Provider response invalid/rejected, bad model JSON, or exhausted tool budget |
| 503 | Missing/invalid configuration or dataset, provider authentication failure or provider rate limit |
| 504 | Provider timeout or workflow deadline exceeded |

Ordinary application errors use `{"detail":"message"}`. Provider response bodies and credentials are not echoed. A configured provider failure never silently masquerades as successful model use. FastAPI validation errors use its standard `detail` array.

## Provider configuration and documentation

Set `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, optional `LLM_EXTRA_BODY`, and `TAVILY_API_KEY` on the Python server. See the root README for smoke testing and the selected Nemotron model's exact account/region configuration.

- [Nebius Nemotron inference](https://nebius.com/services/token-factory/models/nvidia-nemotron-models-inference)
- [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)
- [Tavily Extract API](https://docs.tavily.com/documentation/api-reference/endpoint/extract)
