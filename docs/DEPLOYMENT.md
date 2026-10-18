# Backend deployment and production checks

The app runs as one Python service serving `/api/*` plus the built React frontend.
Original CSV and criteria assets must be present under the app root. No database,
local model server, NVIDIA GPU, n8n or Devin account is required.

## Local environment

From the repository root, activate your virtual environment and install dependencies:

```bash
python -m pip install --require-hashes -r backend/requirements-dev.lock
python -m pip install --no-deps -e backend
python scripts/configure_ai.py
python scripts/configure_jury.py
npm --prefix frontend ci
npm --prefix frontend run build
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Provider accounts/keys still have to be created in your own dashboards. The setup
scripts save local configuration using hidden prompts; they do not create accounts.
They preserve existing unrelated settings and never display the passwords or keys.

Open http://localhost:8000 and enter the jury credentials. Browser login covers
same-origin frontend assets, API calls and `/api/docs`. For local Vite development,
leave both jury variables blank to avoid cross-origin login setup.

```bash
python scripts/smoke_ai.py
python scripts/smoke_ai.py --require-live --research "Siemens AG" --country Germany --website https://www.siemens.com
```

The smoke script reads jury credentials from local `.env` or environment settings.
For a remote URL, pass `--api-url https://YOUR-HOST` and optionally `--jury-user jury`
for a hidden password prompt. Passwords are never passed as command-line arguments.
Live calls consume provider credits; local tests and the production smoke do not.

## Docker host

Choose a host that accepts a Dockerfile, build from the repository root, select
`feature-sharad` until it is merged, and expose the service's `PORT` (default 8000).
The host must support outbound HTTPS to the selected model API and `api.tavily.com`.

```bash
docker build -t supplier-risk-intelligence .
docker run --rm --env-file .env -p 8000:8000 supplier-risk-intelligence
```

Set these secrets/settings in the host dashboard:

| Setting | Value |
|---|---|
| `LLM_API_KEY` | Your model API key |
| `LLM_BASE_URL` | Exact API prefix from your sponsor account/region |
| `LLM_MODEL` | Exact available Nemotron model ID |
| `LLM_EXTRA_BODY` | `{}` initially; only documented provider options |
| `TAVILY_API_KEY` | Your Tavily key |
| `JURY_USERNAME` | Chosen jury username |
| `JURY_PASSWORD` | Chosen password, at least 12 characters |
| `REQUIRE_JURY_AUTH` | `true` |
| `REQUIRE_LIVE_AI` | `true` |
| `CORS_ORIGINS` | Your deployed HTTPS origin if needed |

Use the host's HTTPS URL. Share jury credentials in the submission's private
credential field. Local `.env` is neither committed nor copied into the image.
GitHub Actions secrets do not automatically configure a deployed server.

Docker sets `APP_ROOT=/app`, runs as a non-root user, and probes `/api/ready`.
Configure the platform's readiness path as `/api/ready`; liveness is `/api/health`.
The readiness endpoint checks dataset integrity and required configuration without
calling paid providers. A successful live smoke check is still required.

To verify a built container without keys or credits:

```bash
docker run --rm --entrypoint python supplier-risk-intelligence /app/scripts/production_smoke.py --python /usr/local/bin/python --app-root /app --require-installed
```

This starts a temporary HTTP server inside the container, uses temporary jury
credentials, checks the UI/API, and shuts the server down. It verifies actual
package paths and permissions under the image's non-root user.

## Clean wheel verification without Docker

Build the frontend and Python distribution, install the wheel in a separate
environment, and check it from an unrelated working directory:

```bash
python -m build backend --outdir dist
npm --prefix frontend ci
npm --prefix frontend run build
python -m venv /tmp/supplier-wheel
/tmp/supplier-wheel/bin/python -m pip install --require-hashes -r backend/requirements.lock
/tmp/supplier-wheel/bin/python -m pip install --no-deps dist/*.whl
python scripts/production_smoke.py --python /tmp/supplier-wheel/bin/python --require-installed
```

For a normal wheel-based server, export `APP_ROOT` to the absolute checkout or
deployment directory containing `data/` and `frontend/dist/`, then launch Uvicorn.
`DATA_PATH` and `CRITERIA_PATH` optionally override individual assets; relative
paths resolve against `APP_ROOT`. After replacing datasets, restart the process
because the CSV is cached in memory.

## Final submission check

Confirm readiness, then run the live smoke against the HTTPS deployment. Open a
fresh browser session to verify jury login, filters, 20-supplier comparison, both
sample questions, and a real-company report with working citations. Complete the
two-minute recording and add deployed/video URLs to the root README.
