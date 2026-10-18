# Supplier Risk Intelligence

Siemens hackathon project: explore and compare supplier risk, ask grounded questions, and research real companies with cited evidence.

## Stack

Python 3.11+ / FastAPI, React / TypeScript / Vite, Tailwind CSS. Nemotron via a hosted OpenAI-compatible API; Tavily for public-source search and page extraction. CSV loaded in memory; no database required for this prototype. Node 22.12+ for frontend development.

## Team ownership

| Owner | Branch | Owns | Immediate next actions |
|---|---|---|---|
| **Sharad** | `feature-sharad` | `backend/`, provider integration, grounded chat, research, API contracts, backend deployment | Add local model/search credentials; run live smoke tests; integrate with Ekaterina |
| **Ekaterina** | `feature-ekaterina` or her own feature branch | `frontend/`, explorer, comparison heatmap, chat/research views, demo presentation | Build the buyer workspace against `docs/API.md` and `docs/EKATERINA_HANDOFF.md` |
| **Both** | Pull requests into `main` | API changes, deployment, jury access and submission | Agree any contract changes before editing shared API types; integrate early |

The implementation on `feature-sharad` includes the supplier service, live model tool loop, cited research workflow, and explicit data-only mode. Ekaterina can build the UI against these stable contracts. The existing frontend is still a data-connection starter.

Sharad edits backend files and documentation; Ekaterina edits frontend files. Do not commit API keys. Add your teammate as a repository collaborator and work through separate branches.

## Quick start

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e './backend[dev]'
# First setup only; preserve an existing .env containing your keys.
cp -n .env.example .env
uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. API docs: http://localhost:8000/api/docs. Vite proxies `/api` to Python during development. Original challenge inputs are included under `data/`; run `python scripts/download_data.py` only to restore them. The initial page displays real data and verifies the integration.

## Enable Nemotron and company research

For an interactive setup with hidden key prompts:

```bash
python scripts/configure_ai.py
```

Create your provider keys first; follow [the detailed external-services setup guide](docs/EXTERNAL_SETUP.md). The command preserves unrelated `.env` settings and lets you keep existing keys by pressing Enter. It configures the local app; it does not create provider accounts, redeem credits or verify access. Its Nemotron Super defaults match the official Nebius US-region example; replace them if your dashboard's model example uses a different region/model ID.

For manual configuration instead, use the following values.

Edit the repository-root `.env` locally:

```dotenv
LLM_API_KEY=your_token_factory_api_key
LLM_BASE_URL=https://api.tokenfactory.nebius.com/v1/
LLM_MODEL=copy_the_exact_nemotron_model_id_from_your_dashboard
TAVILY_API_KEY=your_tavily_api_key
LLM_EXTRA_BODY={}
```

Use the exact regional base URL and model ID offered by the sponsor account. The base URL must be the API prefix (usually ending in `/v1/`), not the `/chat/completions` endpoint itself. Provider-specific options can be passed through `LLM_EXTRA_BODY`; for a model that supports it, `{"chat_template_kwargs":{"enable_thinking":false}}` can reduce interactive latency. Follow the selected model's provider documentation.

Restart Python after changing `.env`. `GET /api/status` reports configuration flags without returning secrets. Without `LLM_API_KEY`, chat supports the two challenge examples in explicitly labelled `data_only` mode. Research requires the model configuration and Tavily key. A configured provider failure is returned as an error, rather than silently being relabelled as a successful model response.

With the backend running:

```bash
python scripts/smoke_ai.py
# After credentials are configured, require actual model use:
python scripts/smoke_ai.py --require-live
# Optional: also make paid/live research requests.
python scripts/smoke_ai.py --require-live --research "Siemens AG"
```

The model/search paths are tested with mocked provider responses. Actual Nemotron/Tavily calls still require your local credentials and a successful live smoke test. Data-only mode does not demonstrate use of Nemotron for the side challenge.

## What already works

- Original challenge CSV and criteria definitions.
- Supplier search, risk-level filter, numerical sort, pagination and supplier detail.
- Comparison of 1–20 unique suppliers, ties, missing-value handling and highest observed risk categories.
- Grounded chatbot using allowlisted, validated supplier tools. Evidence values come from actual tool-returned rows; unsupported references are removed and unsupported scalar values trigger a verified-values response.
- A bounded company research workflow: identity check, model-generated plan, two risk searches, source extraction, one evidenced red-flag follow-up, and cited findings.
- Research reports distinguish unresolved company identity, partial evidence and a completed workflow; retain source dates, retrieval dates and explicit limitations.
- Clear provider/configuration errors, timeouts, a status endpoint and a smoke-test command.
- React starter with typed API client, Tailwind and live supplier data.
- Generated OpenAPI contract, API checks and a Dockerfile for a single web service.

UI features beyond the data connection, jury authentication, live provider verification and final deployment remain to finish. APIs and frontend expectations are documented in `docs/API.md` and `docs/EKATERINA_HANDOFF.md`.

## Three-hour build plan

| Minutes | Backend owner (Sharad) | Frontend owner (Ekaterina) |
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
- `backend/app/chat.py`: bounded tool-calling chat, citation checks and data-only mode.
- `backend/app/tools.py`: allowlisted Pydantic-validated supplier tools.
- `backend/app/providers.py`: hosted model/search/extraction adapters and sanitized error handling.
- `backend/app/research.py`: company identity check, research planning, extraction, adaptive follow-up and cited findings.
- `frontend/src/api.ts`: shared frontend API types and HTTP helper.
- `docs/API.md`: implemented APIs and AI response contracts.
- `docs/EKATERINA_HANDOFF.md`: frontend tasks, integration steps and UI states.
- `data/`: original anonymized challenge inputs; scores and labels are preserved.

All supplied risk scores use **0 = no risk; 100 = maximum risk**, including `Financial_Health_Score`. Delivery ratings and other operational percentages have their own semantics. Use the supplied risk levels; do not infer thresholds from their names.

The Total Risk Index is described as a weighted average, but weights are not supplied. Explain elevated categories without claiming exact mathematical contributions or causality. Do not map anonymized suppliers to real companies. Preserve unknowns and cite the supplier ID, field and value used in numerical answers.

Keep credentials in `.env` on the server. `.env` is excluded from git. Use the sponsor model endpoint if it is already available; verify its authentication and API compatibility before wiring it into chat.

Chat allows at most four model calls and eight supplier tool invocations within 60 seconds. Research permits four searches, two extraction batches of up to five pages, and three model calls within 120 seconds. Responses expose actual tool activity or completed workflow steps, not private model reasoning. Research source references are checked against retrieved sources; semantic interpretation of those sources remains model-generated and should be reviewed through the linked evidence.

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

Submission deadline supplied by the organizers: **18:30 Berlin time, 18 October 2026**. Reserve time for the deployed walkthrough and video upload.

## Technology documentation

- [FastAPI](https://fastapi.tiangolo.com/), [Pydantic](https://docs.pydantic.dev/latest/), [HTTPX](https://www.python-httpx.org/), [Uvicorn](https://www.uvicorn.org/)
- [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/docs/), [Vite](https://vite.dev/guide/), [Tailwind CSS](https://tailwindcss.com/docs/installation/using-vite)
- [Nemotron on Nebius Token Factory](https://nebius.com/services/token-factory/models/nvidia-nemotron-models-inference)
- [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Tavily Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract)

Prioritize the Siemens buyer journey and meaningful Nemotron use. Hugging Face participation follows its separate application process. n8n and Devin integrations remain optional stretch work after the core demo is complete.

