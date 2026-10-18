# Judge evaluation guide

Supplier Risk Intelligence by **The Fantastic Devs: Sharad Nanda and Ekaterina**.
Built for the Siemens Smart Supplier Selection for Trains challenge.

## Open the application

- **Live app:** https://supplier-risk-intelligence-qghi.onrender.com/
- **Repository:** https://github.com/GeekNandy/Supplier-Risk-Intelligence
- **Branch:** `main` contains the integrated backend and refined frontend. Render follows `main` after GitHub Actions passes.
- **Username:** `jury`. Enter the password provided separately with the submission's judge access details in the browser's native login prompt. The same login protects the API and its interactive documentation.
- **API documentation:** https://supplier-risk-intelligence-qghi.onrender.com/api/docs
- **Video:** final two-minute recording link pending; the submission must include it separately until added here.

The Render Free service can take about a minute to wake after inactivity. Keep the page open during startup. No provider accounts or API keys are needed to evaluate the hosted app.

**Team submission handoff:** include both the username and the current password in the submission's private access details, or deliver them directly to the organizers. The password is configured and verified on the live service, but is intentionally absent from this public repository. Do not substitute a model/search API key for the jury password.

## Challenge coverage

| Requirement | Implemented behavior | Where to evaluate |
|---|---|---|
| Explore and filter suppliers | Original 10,000-row dataset, search, risk filters, sorting, supplier profiles and charts | Overview and Explore |
| Compare up to 20 suppliers | Persistent shortlist, 20-column heatmap, selected-metric ranking, risk profiles and copyable decision summary | Explore and Compare |
| Ask plain-language questions grounded in data | NVIDIA Nemotron through Nebius Token Factory; validated read-only supplier tools and server-resolved evidence | Ask |
| Research a real company | Identity check, research plan, Tavily search and page extraction, conditional red-flag follow-up, cited findings and evidence gaps | Research |
| Additional decision support | Copyable shortlist justification, dataset-median profile reference, source navigation and privacy-preserving local CSV import | Compare, Research and Load your data |
| Reproducible repository | Code, original challenge inputs, locked dependencies, setup, documented APIs, tests and deployment configuration | Root README and linked technical guides |

## Suggested two-minute evaluation

1. **Overview:** inspect the 10,000-supplier count and supplied risk distribution.
2. **Explore:** search and shortlist `SUPP_00012`, `SUPP_00450` and `SUPP_00731`. Open a profile, then choose Compare. To test capacity separately, clear the shortlist and use Add page to shortlist to reach the 20-supplier limit.
3. **Compare:** rank by Financial health. The supplied risk scores are **54, 65 and 53**, respectively, so `SUPP_00731` has the lowest financial risk among these three. Inspect the heatmap and copyable justification.
4. **Ask:** use either challenge example:
   - “Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?”
   - “Why is the Total Risk Index of SUPP_00018 so high?”
   The latter supplier has TRI 80, with high observed Governance (99), Compliance (98) and Operational Resilience (95) scores. Exact TRI weights are not supplied.
5. **Research:** enter `Knorr-Bremse AG`, country `Germany`, and official website `https://www.knorr-bremse.com`. Run the workflow, review actual step statuses, open cited sources and inspect limitations. Research is a separate live operation and can take longer than a short video segment; a prepared completed run can be shown transparently during the recording.

## Data integrity and limits

- The original challenge [CSV](../data/supplier_risk_dataset.csv) and [criteria descriptions](../data/risk_criteria_description.md) are included. All supplied risk scores use 0 for no risk and 100 for maximum risk, including `Financial_Health_Score`; operational percentages have separate meanings.
- Missing values remain unknown, equal scores retain tied winners, and supplied risk labels are preserved. Unknown TRI weights prevent exact claims about category contributions or causality.
- Anonymous supplier IDs are never mapped to real companies. Public-company research is a separate evidence workflow and does not manufacture a comparable numerical score.
- Research may be partial or request identity clarification. Valid citation references establish provenance; buyers still need to assess each source and the model's interpretation. Limited evidence does not establish low risk.
- Uploaded CSV files stay in the browser. Chat is disabled for uploaded datasets because those records are not available to the backend; switch to the demo dataset to use the hosted assistant.
- Chat is single-turn. Per-request call/time limits and a two-request AI concurrency limit bound work; these do not create a daily spending cap. Excess AI requests receive a retryable 429 response.

## Technical documentation and verification

- [Setup and installation](../README.md#quick-start)
- [API contracts and provider limits](API.md), [generated OpenAPI](openapi.json)
- [External model and Tavily setup](EXTERNAL_SETUP.md)
- [Deployment and environment settings](DEPLOYMENT.md)
- [Verification evidence and performance measurements](VERIFICATION.md)
- [Frontend design, privacy and browser checks](../frontend/README.md)
- [Automated CI workflow](../.github/workflows/verify.yml)

The application release `59eedec` passed [main CI](https://github.com/GeekNandy/Supplier-Risk-Intelligence/actions/runs/39139316985), including 94 backend tests, 18 browser checks, API schema verification, Python/frontend builds, clean-wheel HTTP smoke and production Docker smoke. Documentation-only updates may advance `main` without changing the application assets. The live service and judge login were rechecked on 18 October 2026; see the verification guide for the observed checks and their limits.
