# Set up Nemotron and web research

The integration code is already implemented. You need two hosted service accounts and API keys. You do not need to provision a GPU VM, train a model, install a model server or set up n8n/Devin for the core app.

## 1. Nebius Token Factory: model inference

1. Open https://tokenfactory.nebius.com/ in your own browser and sign in/create an account. The official quickstart offers Google or GitHub sign-in.
2. Follow the hackathon's participant-resource instructions if supplied. The credits listed in the challenge prizes are not proof that your account already has that balance. Ask the Nebius mentor which participant code/project to use.
3. Current general billing documentation says new onboarding requires a billing account/card. Check the event's sponsored access instructions before using personal billing. If you received a promo code, apply it via the balance menu → Top up → With promo code, then verify the resulting balance.
4. Open the API keys section: https://tokenfactory.nebius.com/project/api-keys . Click **Create API key**, name it `supplier-risk-hackathon`, click **Create**, and save the displayed key privately. The provider documentation says it cannot be viewed again after creation.
5. In Models, search for **Nemotron 3.5 Super VL** and open its playground. Use a public/hosted endpoint. Separate embedder or reranker deployments are not required by this app.
6. Send a short test such as `Reply with OK.`. Confirm that the provider can generate a response before debugging the local app.
7. Click **View code** in the playground and note the exact `base_url` and `model`. Those two strings are public configuration; the API key is secret.

The following settings were verified with live backend calls on 18 October 2026:

```dotenv
LLM_BASE_URL=https://api.tokenfactory.nebius.com/v1/
LLM_MODEL=nvidia/Nemotron-3.5-Super-VL
LLM_EXTRA_BODY={"chat_template_kwargs":{"enable_thinking":false}}
```

The model ID was returned by the account's `/v1/models` catalog. Both challenge questions passed with real supplier-tool calls. Siemens research returned nine cited findings from thirteen sources in about thirty seconds. It retained a partial status because of evidence and publication-date limitations. Optional thinking is disabled because the first report attempt reached the output limit with it enabled.

Prefer the pair shown by your own account/region if different. Model IDs and base URLs must match the provider's example; preserve case. Keep only the API prefix, not `/chat/completions`, in `LLM_BASE_URL`. The optional thinking setting is specific to compatible models.

## 2. Tavily: public-source search and extraction

1. Open https://app.tavily.com/ and sign in/create an account.
2. Copy a dashboard API key, or create a new one named `supplier-risk-hackathon` if that option is shown.
3. Save the key privately for `TAVILY_API_KEY`. The same key is used for search and extraction.

The current Tavily quickstart lists 1,000 free API credits per month with no credit card required. Start with the free allowance for development.

## 3. Configure your local checkout

Run these commands from the repository root, in a macOS/Linux terminal. Python 3.11+ is required.

```bash
git fetch origin
git switch main
git pull --ff-only
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --require-hashes -r backend/requirements-dev.lock
python -m pip install --no-deps -e backend
python scripts/configure_ai.py
```

In the setup command:

1. Accept `https://api.tokenfactory.nebius.com/v1/` for the model base URL, or enter your account's different endpoint. An existing custom endpoint is preserved even when its key is still blank.
2. Accept `nvidia/Nemotron-3.5-Super-VL` for the model ID, or enter the exact ID for another model.
3. Paste your Nebius API key into its hidden prompt and press Enter.
4. Paste your Tavily API key into its hidden prompt and press Enter.

The terminal will not display the keys as you paste them. Settings are saved in the repository-root `.env`; existing unrelated settings are preserved. `.env` is excluded from Git. Do not paste keys into chat, README files or frontend code.

The wizard sets `LLM_EXTRA_BODY={"chat_template_kwargs":{"enable_thinking":false}}` for this Nemotron model when the existing options are empty. Custom provider options are preserved. Copy the same settings into the deployed backend's environment variables; cloning the repository does not copy private keys.

## 4. Start and verify

In terminal 1:

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

In terminal 2, also from the repository root:

```bash
source .venv/bin/activate
python scripts/smoke_ai.py --require-live
```

The check should report `chat_mode: live`, the selected model, and passing financial-comparison/risk-explanation checks. It must not report data-only mode when demonstrating Nemotron use.

Then exercise live company research (this makes real provider requests and consumes credits):

```bash
python scripts/smoke_ai.py --require-live --research "Siemens AG"
```

To inspect the full report, open http://localhost:8000/api/docs, expand `POST /api/research`, click **Try it out**, and send:

```json
{"company_name":"Siemens AG","country":"Germany","website":"https://www.siemens.com"}
```

If `needs_clarification` is returned, use the question to refine identity. Review partial reports through their source links and limitations. Restart Uvicorn whenever you change `.env`.

The live research smoke check exits unsuccessfully when identity still needs clarification, planning/report generation fails, or no cited findings can be demonstrated. A partial report with completed generation and valid citations passes while retaining its evidence limitations. An inconclusive check does not mean the company is low risk.

## Troubleshooting

| Symptom | Next action |
|---|---|
| `data_only` or model not configured | Check root `.env`, fill the model key/base/model ID, and restart Python |
| Provider authentication failed | Confirm the correct provider's API key and selected account/project; keep the key private |
| Provider rejects request / model not found | Copy the exact model ID and regional base URL from playground View code |
| No final model content / output limit | Check the model's optional thinking settings; if supported, try `LLM_EXTRA_BODY={"chat_template_kwargs":{"enable_thinking":false}}` in `.env`, then restart |
| Research not configured | Fill `TAVILY_API_KEY` and verify model configuration |
| Rate limit or credit/billing problem | Check the provider dashboard balance/quota and the hackathon resource instructions |
| `Could not reach the API` | Start Uvicorn on port 8000 before running the smoke check |

When asking for help, share the error text and public model/base URL only. Do not include API keys. Local `.env` values will later be added as environment variables in the deployed backend service; GitHub Actions secrets are not automatically read by the running app.

## Official references (checked 18 October 2026)

- [Nebius quickstart](https://docs.tokenfactory.nebius.com/quickstart)
- [Nebius API key creation](https://docs.tokenfactory.nebius.com/api-reference/introduction)
- [Nebius billing and promo codes](https://docs.tokenfactory.nebius.com/other-capabilities/billing-new)
- [Nebius playground and View code](https://docs.tokenfactory.nebius.com/ai-models-inference/playground)
- [Nebius Nemotron 3.5 Super VL announcement](https://nebius.com/blog/posts/three-new-open-weight-models-from-us-companies-give-builders-more-choice)
- [NVIDIA Nemotron 3.5 Super VL request settings](https://docs.nvidia.com/nim/large-language-models/latest/get-started/advanced/get-started-nemotron-3.5-super-vl.html#control-reasoning)
- [Tavily quickstart](https://docs.tavily.com/documentation/quickstart)
