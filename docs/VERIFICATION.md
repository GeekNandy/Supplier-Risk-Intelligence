# Backend verification

Verified on 18 October 2026 with Python 3.12 and Node 24. The committed workflow
uses Python 3.12 and Node 22. Dependencies are pinned with hashes for Python and
the existing npm lockfile for the frontend.

## Checks performed

| Check | Result |
|---|---|
| Backend suite | 69 tests passed |
| Ruff lint and format checks | Passed |
| Generated OpenAPI snapshot | Matches running backend schemas |
| Python source distribution and wheel | Built successfully |
| Frontend TypeScript and Vite build | Passed |
| Clean wheel installation | Passed with locked runtime dependencies |
| Real HTTP production smoke | Passed from a separate working directory |
| Real Nemotron/Tavily requests | Not run; team API credentials are required |
| Docker image | GitHub Actions build and in-container HTTP smoke passed as the non-root runtime user |

Both [push verification](https://github.com/GeekNandy/Supplier-Risk-Intelligence/actions/runs/39122070804)
and [pull-request verification](https://github.com/GeekNandy/Supplier-Risk-Intelligence/actions/runs/39122071087)
completed successfully for backend commit `0f4e823`. These include the locked
dependency install, 69 tests, lint/format, OpenAPI check, Python/frontend builds,
clean-wheel smoke, and Docker build/smoke. Local checks used Node 24; the hosted
checks also verified the supported Node 22 setup. No local Docker engine was
available, so the actual image check ran on GitHub's runner.

The HTTP smoke starts Uvicorn using the installed wheel, checks readiness with
10,000 suppliers, checks unauthorized/authorized jury access, serves the built
frontend and its assets, opens API docs, filters suppliers, compares 20 suppliers,
answers both challenge examples, and checks missing-provider errors. It clears
AI credentials for the child process, uses temporary jury credentials, and shuts
down the server on success or failure.

Provider integration tests use HTTPX transport stubs while running the actual
model/search adapters and FastAPI orchestration. They check native tool payloads,
server-derived evidence and rankings, research search/extraction/report payloads,
source retention after provider failures, and safe error messages. They verify
the implementation contract; account access, credits, current live model behavior
and external network availability still need a credential-backed smoke test.

The suite also covers ties, missing scores, invalid datasets, maximum selection
size, pagination, unknown fields/IDs, malformed JSON, invalid URLs, streamed body
limits, CORS, malformed login headers and required-production configuration.

## Reproduce

Follow the root README's verification commands and `docs/DEPLOYMENT.md` for a clean
wheel or container smoke check. Before submission, run:

```bash
python scripts/smoke_ai.py --api-url https://YOUR-HOST --require-live --research "Siemens AG" --country Germany --website https://www.siemens.com --jury-user jury
```

The jury password is prompted without echoing. Frontend buyer-workspace completion,
the live URL, actual provider verification and demo recording remain team delivery
work. The comparison/research results need source review; reference validation does
not prove every model-generated semantic interpretation.
