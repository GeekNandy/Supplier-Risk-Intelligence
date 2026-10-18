# Supplier Risk Intelligence

Siemens hackathon project: explore and compare supplier risk, ask grounded questions, and research real companies with cited evidence.

## Stack

Python 3.11+ / FastAPI, React / TypeScript / Vite, Tailwind CSS. CSV loaded in memory; no database required for this prototype. Node 22.12+ for frontend development.

## Quick start

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e './backend[dev]'
cp .env.example .env
python scripts/download_data.py
uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. API docs: http://localhost:8000/api/docs. Vite proxies `/api` to Python during development. The original challenge inputs are included under `data/`; the download script can restore them. The initial page displays real data and verifies the integration.

## What already works

- Original challenge CSV and criteria definitions.
- Supplier search, risk-level filter, numerical sort, pagination and supplier detail.
- Comparison of 1–20 unique suppliers, ties, missing-value handling and highest observed risk categories.
- React starter with typed API client, Tailwind and live supplier data.
- Generated OpenAPI contract, API checks and a Dockerfile for a single web service.

Chat and research routes currently return HTTP 501 deliberately. Their requests are defined, with response contracts in `docs/API.md`. UI features beyond the data connection, AI integration and jury authentication are not implemented yet.

## Three-hour build plan

| Minutes | Backend owner (Sharad) | Frontend owner |
|---|---|---|
| 0–20 | Review schema, verify model/search API keys, agree contracts | Run UI and deploy the starter together |
| 20–65 | Implement tool-grounded chat using existing data functions | Build filters, supplier selection tray and risk heatmap |
| 65–110 | Implement bounded company research and evidence citations | Build chat and cited research views against agreed contracts |
| 110–150 | Integrate, verify numerical claims and error handling | Polish 20-supplier comparison and loading/error states |
| 150–180 | Verify deployed endpoints and jury access | Record two-minute video; finish submission links |

Bonus only after the core journey works: shortlist memo generated from the same computed comparison data.

## Architecture and boundaries

- `backend/app/data.py`: deterministic data access and calculations. Reuse these functions as LLM tools.
- `backend/app/main.py`: FastAPI routes and static frontend serving.
- `backend/app/chat.py`: chatbot implementation seam.
- `backend/app/research.py`: research workflow implementation seam.
- `frontend/src/api.ts`: shared frontend API types and HTTP helper.
- `docs/API.md`: implemented APIs and planned AI response contracts.
- `data/`: original anonymized challenge inputs; scores and labels are preserved.

All supplied risk scores use **0 = no risk; 100 = maximum risk**, including `Financial_Health_Score`. Delivery ratings and other operational percentages have their own semantics. Use the supplied risk levels; do not infer thresholds from their names.

The Total Risk Index is described as a weighted average, but weights are not supplied. Explain elevated categories without claiming exact mathematical contributions or causality. Do not map anonymized suppliers to real companies. Preserve unknowns and cite the supplier ID, field and value used in numerical answers.

Keep credentials in `.env` on the server. `.env` is excluded from git. Use the sponsor model endpoint if it is already available; verify its authentication and API compatibility before wiring it into chat.

## Verification

```bash
pytest backend/tests
cd frontend
npm run build
```

## Deployment

The production Docker image builds React and serves it from FastAPI under the same origin. This allows one service and one URL for the demo. From the repository root:

```bash
docker build -t supplier-risk-intelligence .
docker run --rm --env-file .env -p 8000:8000 supplier-risk-intelligence
```

For local production verification without Docker, run `npm run build` in `frontend`, then restart Uvicorn from the root. `/` serves the UI and `/api/*` serves the API.

Before submission, add simple jury access using server-side credentials from environment variables. Share credentials privately with the jury; do not commit credentials or API keys. This starter is not yet authenticated.

## Submission checklist

- [ ] Core explorer, 20-supplier comparison, grounded chatbot and research workflow complete.
- [ ] Repository contains all code/data and reproducible setup instructions.
- [ ] Deployed URL verified from a fresh browser session.
- [ ] Jury login and credentials verified.
- [ ] Two-minute video: filter → compare three suppliers → ask a risk question → research a real company.
- [ ] README updated with live URL and video link.

