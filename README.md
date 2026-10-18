# Supplier Risk Intelligence

Siemens hackathon project: explore and compare supplier risk, ask grounded questions, and research real companies with cited evidence.

## Stack

Python 3.11+ / FastAPI, React / TypeScript / Vite, Tailwind CSS. Nemotron via a hosted OpenAI-compatible API; Tavily for public-source search and page extraction. CSV loaded in memory; no database required for this prototype. Node 22.12+ for frontend development.

## Team ownership

| Owner | Branch | Owns | Immediate next actions |
|---|---|---|---|
| **Sharad** | `feature-sharad` | `backend/`, provider integration, grounded chat, research, API contracts, backend deployment | Configure Nemotron; run live model/research smoke; deploy the integrated app |
| **Ekaterina** | `feature-ekaterina` | `frontend/`, explorer, comparison heatmap, chat/research views, demo presentation | Review the integrated buyer journey, polish the demo and record the walkthrough |
| **Both** | Pull requests into `main` | API changes, deployment, jury access and submission | Agree any contract changes before editing shared API types; integrate early |

`integration-ui-backend` combines the backend from `feature-sharad` with Ekaterina's buyer workspace from `feature-ekaterina`. It includes the explorer, persistent 20-supplier shortlist, comparison heatmap, decision memo, supplier profiles, chat evidence and cited research views. The combined app passes 69 backend checks and 16 browser integration checks. Both original feature branches remain available for review.

Sharad edits backend files and documentation; Ekaterina edits frontend files. Do not commit API keys. Add your teammate as a repository collaborator and work through separate branches.

## Quick start

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install --require-hashes -r backend/requirements-dev.lock
pip install --no-deps -e backend
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

Create your provider keys first; follow [the detailed external-services setup guide](docs/EXTERNAL_SETUP.md). The command preserves unrelated `.env` settings and lets you keep existing keys by pressing Enter. It configures the local app; it does not create provider accounts, redeem credits or verify access. The wizard starts with the older Nemotron 3 Super example; enter the endpoint and model below to use the live-verified Nemotron 3.5 Super VL configuration.

For manual configuration instead, use the following values.

Edit the repository-root `.env` locally:

```dotenv
LLM_API_KEY=your_token_factory_api_key
LLM_BASE_URL=https://api.tokenfactory.nebius.com/v1/
LLM_MODEL=nvidia/Nemotron-3.5-Super-VL
TAVILY_API_KEY=your_tavily_api_key
LLM_EXTRA_BODY={"chat_template_kwargs":{"enable_thinking":false}}
```

This exact configuration passed live supplier chat and Siemens company research on 18 October 2026. Disabling optional thinking prevented the longer report from exhausting its output budget. If selecting another model, use its exact endpoint, model ID and supported options; `LLM_EXTRA_BODY` is provider-specific. The base URL must be the API prefix (usually ending in `/v1/`), not the `/chat/completions` endpoint itself.

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
- Supplier search, supplied risk-level filter, maximum total-risk filter, numerical sort, pagination and supplier detail.
- Comparison of 1–20 unique suppliers, ties, missing-value handling and highest observed risk categories.
- Grounded chatbot using allowlisted, validated supplier tools. Evidence values come from actual tool-returned rows; unsupported references are removed and unsupported scalar values trigger a verified-values response.
- A bounded company research workflow: identity check, model-generated plan, two risk searches, source extraction, one evidenced red-flag follow-up, and cited findings.
- Research reports distinguish unresolved company identity, partial evidence and a completed workflow; retain source dates, retrieval dates and explicit limitations.
- Clear provider/configuration errors, timeouts, readiness checks and smoke-test commands.
- Optional jury HTTP Basic login protecting the UI, API and API docs; configuration failures close access.
- Buyer workspace with search/filtering, persistent shortlists, a 20-column risk heatmap, tied rankings, copyable justification, supplier profiles and metric definitions.
- Chat and research views with exact evidence, linked sources, real error states and complete/partial/clarification report rendering.
- Typed response schemas, a generated OpenAPI contract, locked dependencies, automated checks and a non-root Docker image definition for a single web service.

The core UI and backend are integrated. Remaining delivery work is credential-backed live model/research verification, deployment, demo polish and recording. Tavily search/extraction has been verified live; Nemotron still needs a model API key. API details are in `docs/API.md`, the team handoff is in `docs/EKATERINA_HANDOFF.md`, and production instructions are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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
- `backend/app/access.py`: jury access and a 64 KiB API request-body limit.
- `backend/app/runtime.py`: asset-root resolution for editable and wheel/container installations.
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
ruff check backend scripts
ruff format --check backend scripts
pytest backend/tests -q
python scripts/export_openapi.py --check
python -m build backend --outdir dist
npm --prefix frontend ci
npm --prefix frontend run build
```

The tests cover real challenge data, 20-supplier comparisons, grounding checks, native provider HTTP contracts, partial research failures, authentication, malformed inputs and configuration errors. They use HTTP transport stubs for external providers and never spend API credits. [Verification details](docs/VERIFICATION.md) distinguish these checks from live API verification.

To run the browser checks after building the frontend:

```bash
cd frontend
npx playwright install chromium --only-shell
npm run test:e2e
```

These checks start a real Python server, use temporary jury credentials and clear all provider keys. Supplier, comparison and chat flows use the actual backend; successful research-report states use explicit API fixtures, while missing-model errors come from the real backend. They never consume model/search credits.

The GitHub workflow in `.github/workflows/verify.yml` runs linting, tests, contract checks, both builds, browser integration checks, a clean wheel smoke test, and a production container build/smoke test. Run `python scripts/export_openapi.py` after API schema changes.

## Jury access and deployment

Configure jury access in your own terminal:

```bash
python scripts/configure_jury.py
```

The password prompts are hidden, require confirmation, and preserve existing API keys. Restart the server afterward. Local development can leave both jury variables blank. For deployment, set `JURY_USERNAME`, `JURY_PASSWORD` (at least 12 characters), `REQUIRE_JURY_AUTH=true`, and `REQUIRE_LIVE_AI=true` through your host's secret settings. Use HTTPS and share jury credentials privately.

The production Docker image builds React and serves it from FastAPI under one origin. From the repository root:

```bash
docker build -t supplier-risk-intelligence .
docker run --rm --env-file .env -p 8000:8000 supplier-risk-intelligence
```

`GET /api/health` is public liveness; `GET /api/ready` checks the dataset and required configuration without spending API credits. All other paths require jury login when configured. A browser shows its native login prompt; Ekaterina does not need to build a login page.

For local production verification without Docker, build `frontend`, then restart Uvicorn from the root. For a wheel installation, set `APP_ROOT` to the absolute checkout/asset directory. See [the deployment guide](docs/DEPLOYMENT.md) for clean-install and container smoke commands.

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

