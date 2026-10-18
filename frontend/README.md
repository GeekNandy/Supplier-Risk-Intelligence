# Supplier workspace UI

Refined from `feature-ekaterina` for a 1280 × 800 laptop, with a responsive 390 px mobile layout. React, Tailwind, Siemens iX and Recharts remain the existing stack; no new component framework, font download or telemetry is added.

- Compact navigation and a consistent dataset toolbar leave the main area for supplier decisions.
- Shared card, field, typography and focus styles use the existing iX controls. The overview prioritizes real summary metrics and charts; the comparison heatmap comes before the larger profile chart.
- Supplier results have a contained scroll area and sticky headers. The shortlist stays available, and panels keep their filters, answers and reports across navigation.
- CSV parsing and comparison semantics are unchanged. Uploads stay in the browser, uploaded data cannot be sent to chat, missing values remain unknown, and supplied scores and levels are preserved.

Design references: [Siemens Element dashboards](https://element.siemens.io/components/dashboards/dashboard/), [Siemens iX principles](https://ix.siemens.io/docs/guidelines/overview), and [Linear's interface refinement](https://linear.app/now/behind-the-latest-design-refresh). These inform hierarchy, control consistency and visual restraint; Siemens branding is not reproduced.

From the repository root:

```bash
npm --prefix frontend ci
npm --prefix frontend run build
# With the Python development dependencies installed:
cd frontend
npx playwright install chromium --only-shell
npm run test:e2e
```

Browser checks run at 1280 × 800 by default and include mobile, privacy, numerical comparisons, source links, keyboard dismissal and viewport behavior. External AI responses are mocked where needed; browser checks do not use provider credits. The root README contains backend setup and production instructions.
