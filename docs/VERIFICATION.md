# Backend verification

Verified on 18 October 2026 with Python 3.12 and Node 24. The committed workflow
uses Python 3.12 and Node 22. Dependencies are pinned with hashes for Python and
the existing npm lockfile for the frontend.

## Checks performed

| Check | Result |
|---|---|
| Backend suite | 94 tests, including malformed/schema-invalid/truncated research reports, concurrent AI capacity and usage accounting |
| Browser integration suite | 16 tests passed against the integrated UI and a real Python server |
| Ruff lint and format checks | Passed |
| Generated OpenAPI snapshot | Matches running backend schemas |
| Python source distribution and wheel | Built successfully |
| Frontend TypeScript and Vite build | Passed |
| Clean wheel installation | Passed with locked runtime dependencies |
| Real HTTP production smoke | Passed from a separate working directory |
| Live Tavily Search and Extract | Passed through the backend's actual SearchClient: four search results and one extracted Siemens source page |
| Tavily remote MCP | Initialization, authenticated tool discovery and a live `tavily_search` call passed |
| Live Nemotron 3.5 Super VL chat | Both challenge questions passed through real HTTP endpoints with supplier tools and verified evidence |
| Live Nemotron/Tavily research | Siemens report returned nine findings with valid source references from thirteen sources in 30.4 seconds; partial status retained for evidence gaps |
| Live jury-authenticated smoke after final fixes | Anonymous API access returned 401; both challenge questions passed, followed by eight cited Knorr-Bremse findings from twelve sources with evidence limitations retained |
| Docker image | GitHub Actions build and in-container HTTP smoke passed as the non-root runtime user |
| Render deployment Blueprint | Passed the official Render JSON Schema; model/search keys and jury password are runtime inputs |
| Render port and auth setup | The Dockerfile's startup command passed locally with `PORT=10000`, required live-AI settings, jury login, built UI/assets and 10,000 suppliers |

The app is live at https://supplier-risk-intelligence-qghi.onrender.com on the
Free plan in Frankfurt. Public HTTPS, the built UI/assets, supplier comparison
and authenticated API docs passed real HTTP checks. Anonymous and incorrect
credentials returned 401. Both challenge questions passed through the hosted
Nemotron integration. Render confirms `/api/ready` and the CI-gated deploy policy.
The code-fix deploy was triggered manually after all checks passed. Render’s
GitHub app was then connected with access to only this repository. Commit
`3c69af7` subsequently became live with a `new_commit` trigger after its
[main checks passed](https://github.com/GeekNandy/Supplier-Risk-Intelligence/actions/runs/39133260611).
Automatic updates are now connected; future UI/backend PRs deploy after merging
and passing `main` CI.

## Performance and cost checks

Offline measurements on the same workspace use 25 warm-cache samples. The baseline
was taken on `754161d` before metadata/index caching; timings cover Python functions,
not HTTP, rendering or model latency. Results vary with hardware and load.

| Operation | Before | After |
|---|---:|---:|
| Metadata | 80.504 ms | 0.022 ms |
| Compare 20 suppliers | 80.468 ms | 0.072 ms |
| Default supplier search | 78.336 ms | 2.187 ms |

`python scripts/benchmark_backend.py` reproduces current measurements. Its fixed
20-source fixture compares the previous source representation with the compact
context using identical evidence: 131,021 versus 39,401 JSON characters, a 69.9%
reduction. This measures context characters, not billed tokens or report quality.
Every source ID remains available, including follow-up evidence. Long evidence is
shortened and explicitly marked; buyers are directed to the original pages.

Provider-reported tokens and attempted model/search/extraction calls are exposed in
successful responses through numeric `X-AI-*` headers. Missing/partial usage is
omitted rather than estimated. Regression checks verify request isolation, actual
usage propagation, unknown usage, immediate 429 rejection above two AI requests,
and release after errors/cancellation. Data endpoints remain usable while AI is busy.

The existing Actions workflow retains locked installs, lint, API contract checks,
tests, Python/UI builds, browser checks and production Docker smoke. It now cancels
obsolete runs for each branch/PR and caches pip downloads keyed by the lockfile.
CI uses no provider keys or paid AI requests. These optimizations do not add a
distributed rate limit, total spending cap or response cache.

A local HTTP smoke using the actual Nemotron/Tavily adapters passed after these
changes. Provider-reported usage for that run was:

| Request | Model calls | Input tokens | Output tokens | Backend time |
|---|---:|---:|---:|---:|
| Financial comparison | 2 | 6,505 | 280 | 8.4 s |
| Total Risk Index explanation | 2 | 5,229 | 640 | 7.7 s |
| Knorr-Bremse research | 3 | 17,301 | 1,624 | 29.9 s |

Research returned 12 cited findings from 12 sources and six evidence limitations,
including shortened excerpts. Report generation and citation-reference checks
passed. These are observed usage figures for one run, not a guaranteed latency,
cost, semantic-accuracy score or before/after token-savings measurement.

The first hosted research smoke exposed malformed model JSON. Research now sends
the full Pydantic JSON schema in the provider's `response_format`, then validates
fields and source IDs locally. A real schema-constrained Knorr-Bremse run returned
ten cited findings from twelve sources in 31.5 seconds, with no failed workflow
stages. Evidence limitations keep the report honestly marked partial. The
regression suite preserves collected sources and marks generation failed for
malformed, schema-invalid and output-truncated responses.

**Final hosted smoke passed** on deployed commit `8d9e3f5`: both live grounded
chat examples and seven cited Knorr-Bremse findings from thirteen sources, with
seven evidence limitations retained. Report generation and source-reference
checks passed. The [main CI run](https://github.com/GeekNandy/Supplier-Risk-Intelligence/actions/runs/39132296236)
also passed the 83 backend tests, 16 browser checks, Python/UI builds, clean-wheel
HTTP smoke and production Docker build/smoke.

Both [push verification](https://github.com/GeekNandy/Supplier-Risk-Intelligence/actions/runs/39122070804)
and [pull-request verification](https://github.com/GeekNandy/Supplier-Risk-Intelligence/actions/runs/39122071087)
completed successfully for backend commit `0f4e823`. These include the locked
dependency install, 69 tests, lint/format, OpenAPI check, Python/frontend builds,
clean-wheel smoke, and Docker build/smoke. Local checks used Node 24; the hosted
checks also verified the supported Node 22 setup. No local Docker engine was
available, so the actual image check ran on GitHub's runner.

Tavily and Nemotron were subsequently verified with supplied credentials in this workspace.
The keys are stored only in a gitignored, owner-readable `.env`; they are not part of
the repository. The hosted service has its own private environment settings.
MCP was verified through direct protocol calls;
this does not register native Tavily tools in the current ChatGPT session.

The live model configuration is `https://api.tokenfactory.nebius.com/v1/` with
`nvidia/Nemotron-3.5-Super-VL` and
`LLM_EXTRA_BODY={"chat_template_kwargs":{"enable_thinking":false}}`. The initial
research report hit the model's output limit with optional thinking enabled.
After disabling it, both supplier questions and report generation passed. The
financial comparison completed in 7.2 seconds and the risk explanation in 8.2 seconds.
The research check confirmed nonempty findings, completed report generation and
source references belonging to the retrieved source set. Publication-date gaps,
historical evidence and limited independent coverage remain visible in the report.

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
the implementation contract. Live Tavily search/extraction and Nemotron orchestration
were separately verified above. Repeat the credential-backed smoke test below
after a deployed provider or research change.

The suite also covers ties, missing scores, invalid datasets, maximum selection
size, pagination, unknown fields/IDs, malformed JSON, invalid URLs, streamed body
limits, CORS, malformed login headers and required-production configuration.

The final setup fixes align the wizard and example environment with the verified
Nemotron 3.5 endpoint/model and direct-answer options. Tests reproduce the older
starter's empty options, preserve a custom endpoint before its key is added, and
ensure a live research smoke fails on planning/report errors, unknown citations,
unresolved identity and an inconclusive empty report. Partial reports containing
cited findings and evidence limitations remain supported. The research prompt
also explicitly assesses the named company itself as the potential supplier.

## UI integration

PR #2 merged UI commit `a2773c2` from `feature-ekaterina` and backend commit
`332c221` from `feature-sharad` into `main` with both histories preserved; PR #1
was automatically marked merged. The browser suite verifies jury
authentication, pagination/filtering/sorting, twenty-supplier limits and reload
persistence, tied financial scores, comparison-to-chat context, both challenge
questions, supplier profiles/definitions, unknown-supplier errors, safe refresh
failures, clipboard fallback, citations and a mobile viewport.

Supplier/compare/chat browser requests use the actual FastAPI endpoints and
original challenge data. The missing-model research error also uses the actual
backend. Complete, partial and clarification research reports use explicitly
labelled API fixtures to verify UI rendering and citation navigation; they do not
prove live Nemotron synthesis. All browser-server provider keys are cleared, so
the checks spend no external API credits. CI runs the same suite after the build.

The integration fixes prevent old comparison results from surviving a failed
shortlist refresh, stop old-page rows being added during loading, distinguish a
missing supplier from an unavailable route, handle denied clipboard access and
describe equal-score winners accurately. Both feature branches are preserved.

## Reproduce

Follow the root README's verification commands and `docs/DEPLOYMENT.md` for a clean
wheel or container smoke check. Before submission, run:

```bash
python scripts/smoke_ai.py --api-url https://supplier-risk-intelligence-qghi.onrender.com --require-live --research "Knorr-Bremse AG" --country Germany --website https://www.knorr-bremse.com --jury-user jury
```

The jury password is prompted without echoing. Final buyer review, demo polish
and the recording remain team delivery work. The comparison/research results need source review; reference validation does
not prove every model-generated semantic interpretation.
