# Backend deployment and production checks

The app runs as one Python service serving `/api/*` plus the built React frontend.
Original CSV and criteria assets must be present under the app root. No database,
local model server, NVIDIA GPU, n8n or Devin account is required.

## Render deployment

**Live app:** https://supplier-risk-intelligence-qghi.onrender.com

The existing service is `srv-dbaceslg1s2s73bjg3u0` in the team's **My Workspace**.
It was created directly from the repository through Render, with the private
model/search keys and jury credentials configured on the service. Its Dashboard
settings enable `/api/ready` and **After CI Checks Pass** on `main`. Merging UI or
backend changes updates this same service. The Dashboard manages its settings;
the committed Blueprint remains a template for recreating the deployment.

### Recreate in another workspace

The root `render.yaml` defines one Docker web service in Frankfurt on the Free
compute plan. It serves both the React UI and Python API, uses `/api/ready` for
health checks, requires live AI and jury authentication, and follows `main` after
its CI checks pass. No database or persistent disk is created.

[Deploy this repository to Render](https://render.com/deploy?repo=https://github.com/GeekNandy/Supplier-Risk-Intelligence)

1. Sign in to your Render account and select the intended deployment workspace.
   Use these steps only when creating a separate service.
2. Use the link above, review the service and keep the `free` plan. If creating
   the service manually, choose a Docker Web Service from this repository's
   `main` branch, with repository-root build context and `./Dockerfile`.
3. Supply the three private values requested by the Blueprint: `LLM_API_KEY`,
   `TAVILY_API_KEY` and `JURY_PASSWORD`. The other model/auth settings are already
   declared. If using the deployment workspace's generated jury credentials,
   read them locally from its private `.env`; never commit that file.
4. Create the service and wait for its initial deploy to become Live. The actual
   service URL is assigned by Render; do not assume it from the display name.
5. Run the final submission check below against the returned HTTPS URL. Open
   the URL in a fresh browser session and sign in as `jury` using the configured
   password.

For automatic updates, connect the repository to Render and leave auto-deploys
set to **After CI Checks Pass**. Ekaterina's UI changes then deploy after merging
to `main` and passing the existing workflow. The Blueprint is intended for this
team-owned service; a separate fork/clone should review its linked repository
and update policy before creating an instance.

The Free plan spins down after 15 minutes without requests and can take about a
minute to wake up. Open the app before recording or presenting. Keep the Free
plan unless the team explicitly chooses a paid instance. Current provider docs:
[Blueprint fields](https://render.com/docs/blueprint-spec),
[Free plan behavior](https://render.com/docs/free), and
[deploy button](https://render.com/docs/deploy-to-render).

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
`main`, and expose the service's `PORT` (default 8000; the Render Blueprint uses 10000).
The host must support outbound HTTPS to the selected model API and `api.tavily.com`.
The model endpoint must support OpenAI-compatible tools for chat and
`response_format.type=json_schema` for research. The verified Nemotron endpoint
supports both; Pydantic and citation checks still validate every research response.

```bash
docker build -t supplier-risk-intelligence .
docker run --rm --env-file .env -p 8000:8000 supplier-risk-intelligence
```

Set these secrets/settings in the host dashboard:

| Setting | Value |
|---|---|
| `LLM_API_KEY` | Your model API key |
| `LLM_BASE_URL` | `https://api.tokenfactory.nebius.com/v1/` for the verified account |
| `LLM_MODEL` | `nvidia/Nemotron-3.5-Super-VL` |
| `LLM_EXTRA_BODY` | `{"chat_template_kwargs":{"enable_thinking":false}}` for this model |
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
