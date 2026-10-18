# Ekaterina: frontend handoff

You own the buyer workspace in `frontend/`. Sharad owns Python, model/search integration and the backend API. Your UI work can proceed without model credentials using the real supplier endpoints and the two supported data-only chat examples.

## Start here

1. Run the Python backend using the root README, then `npm ci && npm run dev` from `frontend/`.
2. Open http://localhost:8000/api/docs for the actual request and response schemas.
3. Use relative `/api/...` URLs. Vite proxies them to Python; production serves both from the same origin.
4. Make UI changes on `feature-ekaterina` or your own feature branch. The new backend is on `feature-sharad`; coordinate its merge into your branch/main before testing the live chat and research screens.
5. Keep API keys on the Python server. No provider keys belong in browser code or `VITE_*` variables.

## Priority 1: explorer and 20-supplier comparison

- Load `/api/meta` for risk fields and available overall risk levels. Use exact field names from the API.
- Search/filter/rank with `GET /api/suppliers?q=...&risk_level=High&sort_by=Total_Risk_Index&order=asc&offset=0&limit=50`. An optional `max_total_risk=60` supplies a total-risk threshold; use the actual risk labels from metadata.
- Use server pagination. Do not fetch/render all 10,000 rows at once.
- Keep a selected-supplier tray keyed by `supplierID`, with removal and a visible 20-item limit.
- Call `POST /api/compare` with `supplier_ids` and an optional `rank_by` risk field.
- Render a horizontally scrollable heatmap: supplier columns, risk-metric rows, score values, clear risk-color legend. Make it work for 20 suppliers.
- Show `lowest_risk_supplier_ids` as the best score for the chosen criterion, including ties. Display missing values as "Unknown".
- Preserve server-supplied risk labels. All risk scores are 0=no risk, 100=maximum risk, including financial health. Delivery and confirmation percentages have their own meanings.
- Show the top observed categories without saying they are proven causes or exact weighted contributions to the total index.

## Priority 2: grounded chat panel

`POST /api/chat`:

```json
{"message":"Which selected supplier has the lowest financial risk?","supplier_ids":["SUPP_00012","SUPP_00450","SUPP_00731"]}
```

- Render `answer` and a compact evidence list from `evidence`: supplier ID, field, actual value.
- `suggested_supplier_ids` can highlight matching suppliers or offer an explicit "Add to shortlist" action; do not silently replace the buyer's selection.
- Display `mode`: `live` can show the actual `model`; `data_only` must be visibly labelled. Show `warnings` when present.
- `tool_calls` contains executed supplier-tool names, arguments and completed/failed states. It can support an expandable "Data used" view; it is not model reasoning.
- Disable duplicate sends while a request is pending. Show a loading state, retry on failure and a concise error message.
- The current request is one turn plus selected-supplier context; message history is not submitted. Avoid implying that the backend remembers earlier turns.
- Test the two sample prompts from the README; both work without keys.

## Priority 3: real-company research

`POST /api/research`:

```json
{"company_name":"Siemens AG","country":"Germany","website":"https://www.siemens.com"}
```

- Collect real company name, optional country and optional official website; keep this separate from anonymized supplier selection.
- Fetch `/api/status` to see whether live research is configured. A 503 can indicate missing credentials or a provider problem; show the returned `detail`.
- This endpoint returns one completed response and can take up to 120 seconds. Show a truthful "Researching company…" loading state. Do not simulate step-by-step progress that the backend has not sent.
- If `status=needs_clarification`, show `clarification_question` and let the buyer refine country/website.
- Display resolved `company`, `identity_confidence`, `plan`, `summary`, `findings`, `limitations` and actual `steps`.
- Link each finding's `source_ids` to the matching entry in `sources`. Show title, URL, `published_at` when available and `retrieved_at` separately.
- Show partial reports with their limitations. A missing publication date or absence of negative coverage does not mean low risk.
- Render generated/source content as text or sanitized Markdown. External links should use `rel="noopener noreferrer"` when opened in a new tab.

## Shared API handling

- JSON errors use `{"detail":"message"}`. Validation errors (422) can contain a `detail` array; render a readable validation message.
- Keep the existing shared field names. Response fields added for the UI are documented in `docs/API.md` and `docs/openapi.json`.
- Sharad has not changed frontend files in the backend implementation, so UI work can be developed independently.
- Before merging UI changes, run `npm run build` and exercise the deployed API integration.

## Backend delivery status and login

Sharad's backend now includes jury authentication, readiness checks, strict request validation, provider-failure handling and tests. `docs/openapi.json` includes supplier response schemas, chat/research contracts and the jury security scheme. The backend production smoke check verifies a wheel installation serving built React assets and the API together.

No custom login screen is needed for the hackathon: on the deployed same-origin app, the browser's HTTP Basic prompt handles jury login. For local UI development, leave both `JURY_USERNAME` and `JURY_PASSWORD` blank in your own `.env`. `GET /api/ready` is a public platform check; `/api/status` reports configuration only and does not prove provider connectivity.

Next actions for you: finish the explorer/selection/heatmap, chat evidence UI and research source views, then merge the backend branch into your working branch and run the full buyer journey. Live model/search smoke testing still needs the team's provider keys.

## Demo journey

Filter suppliers → select three → compare risk profiles → ask which has lowest financial risk → inspect evidence → research a real company → open a source link.

Jury credential configuration, the deployed URL, live provider checks and the two-minute video remain joint delivery tasks. A shortlist memo is a stretch feature once the core journey works.
