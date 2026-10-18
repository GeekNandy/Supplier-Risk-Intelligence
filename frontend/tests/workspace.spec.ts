import { test, expect, type Page } from '@playwright/test';
import type { ResearchResponse } from '../src/api';

const financialQuestion = 'Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?';
const profileQuestion = 'Why is the Total Risk Index of SUPP_00018 so high?';
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

async function openWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByText('Demo dataset (anonymized)')).toBeVisible();
  await tab(page, 'Explore');
  await expect(page.getByRole('heading', { name: 'Explore suppliers' })).toBeVisible();
  await expect(page.locator('tbody tr:visible')).toHaveCount(25);
}

const uploadCsv = [
  'supplier_id,Supplier Name,Country,Category,Total Risk Index,Financial_Health_Score,Quality_Risk_Score,Compliance_Risk_Score,Digital_Security_Score',
  'ACME-01,Acme Brakes,Germany,Brakes,42,30,55,20,61',
  'ACME-02,Borealis Rail,Poland,Bogies,67,72,n/a,44,38',
  'ACME-03,Cobalt Doors,Czechia,Doors,35,25,31,40,22',
  ',,,,,,,,',
  'ACME-04,Delta Seats,Germany,Interiors,58,49,62,71,45',
  'ACME-03,Cobalt Doors duplicate,Czechia,Doors,36,26,30,41,23',
].join('\n');

async function tab(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: new RegExp(name) }).click();
}

async function selectSuppliers(page: Page, ids: string[]) {
  for (const id of ids) {
    await page.getByLabel('Search ID or name').fill(id);
    await page.getByRole('checkbox', { name: `Add ${id} to shortlist`, exact: true }).check();
  }
}

function decision(page: Page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Decision view', exact: true }) });
}

test('jury access protects the app while platform readiness stays public', async ({ page, baseURL }) => {
  // Node fetch has no inherited Playwright HTTP credentials.
  expect((await fetch(`${baseURL}/`)).status).toBe(401);
  expect((await fetch(`${baseURL}/api/meta`)).status).toBe(401);
  const readiness = await fetch(`${baseURL}/api/ready`);
  expect(readiness.status).toBe(200);
  expect((await readiness.json()).jury_auth_enabled).toBe(true);
  await openWorkspace(page);
});

test('an uploaded CSV is validated, mapped and never sent to the server', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET' || (request.postData() ?? '').includes('ACME')) sent.push(`${request.method()} ${request.url()}`); });
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Load your data', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'test-suppliers.csv', mimeType: 'text/csv', buffer: Buffer.from(uploadCsv) });
  await expect(dialog).toContainText('No risk-level column');
  await expect(dialog).toContainText('1 empty row skipped');
  await expect(dialog).toContainText('1 duplicate supplier ID (e.g. ACME-03)');
  await expect(dialog).toContainText('Quality_Risk_Score: 1 non-numeric value ("n/a") will show as Unknown');
  await dialog.getByRole('button', { name: /Continue with warnings/ }).click();
  await expect(page.getByText('test-suppliers.csv · 4 rows')).toBeVisible();
  await expect(page.getByText('This file has no risk-level column, so the mix cannot be shown')).toBeVisible();
  await tab(page, 'Explore');
  await expect(page.locator('tbody tr:visible')).toHaveCount(4);
  for (const id of ['ACME-01', 'ACME-02']) await page.getByRole('checkbox', { name: `Add ${id} to shortlist`, exact: true }).check();
  await tab(page, 'Compare');
  await expect(page.getByText('Not plotted because a value is Unknown: Quality.')).toBeVisible();
  await tab(page, 'Ask');
  await expect(page.getByText('Ask works on the demo dataset')).toBeVisible();
  expect(sent).toEqual([]);
});

test('explorer pagination, search, risk labels and ordering use the supplied data', async ({ page }) => {
  await openWorkspace(page);
  const initial = await page.locator('tbody tr:visible').first().innerText();
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await expect(page.getByText('Page 2 of 400', { exact: true })).toBeVisible();
  expect(await page.locator('tbody tr:visible').first().innerText()).not.toBe(initial);
  await page.getByLabel('Search ID or name').fill('SUPP_00012');
  await expect(page.locator('tbody tr:visible')).toHaveCount(1);
  await expect(page.locator('tbody tr:visible')).toContainText('SUPP_00012');
  await page.getByLabel('Search ID or name').fill('');
  await page.getByLabel('Risk level (as supplied)').selectOption('High');
  await expect(page.locator('tbody tr:visible')).toHaveCount(25);
  await expect(page.locator('tbody tr:visible').first().locator('td').nth(3)).toHaveText('High');
  await page.getByRole('combobox', { name: /^Order\b/ }).selectOption('desc');
  const scores = await page.locator('tbody tr:visible').evaluateAll(rows => rows.map(row => Number(row.querySelectorAll('td')[2].textContent?.trim())));
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
});

test('shortlist is capped at twenty, persists and renders twenty comparison columns', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Add page to shortlist' }).click();
  await expect(page.getByRole('complementary', { name: 'Shortlist' })).toContainText('20 / 20');
  await expect(page.getByRole('button', { name: 'Add page to shortlist' })).toBeDisabled();
  await expect(page.locator('tbody input[type=checkbox]:checked')).toHaveCount(20);
  await tab(page, 'Compare');
  const heatmap = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Side-by-side risk heatmap' }) });
  await expect(heatmap).toBeVisible();
  await expect(heatmap.getByRole('columnheader')).toHaveCount(21);
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Shortlist' })).toContainText('20 / 20');
});

test('financial ranking passes the chosen shortlist into grounded chat', async ({ page }) => {
  await openWorkspace(page);
  await selectSuppliers(page, ['SUPP_00012', 'SUPP_00450', 'SUPP_00731']);
  await tab(page, 'Compare');
  await page.getByLabel('Rank shortlist by').selectOption('Financial_Health_Score');
  await expect(decision(page)).toContainText('3 suppliers ranked by Financial health');
  await expect(decision(page).getByRole('button', { name: 'SUPP_00731', exact: true })).toBeVisible();
  await expect(decision(page)).toContainText('53');
  await page.getByRole('button', { name: 'Ask about this ranking →', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Question' })).toHaveValue(/lowest financial health risk/);
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('main').getByRole('button', { name: 'Ask', exact: true }).click();
  const turn = page.getByRole('article');
  await expect(turn).toContainText('Lowest risk by Financial_Health_Score: SUPP_00731');
  await expect(turn.getByRole('row')).toHaveCount(4);
  await expect(turn).toContainText('Data-only answer (no AI model)');
});

test('sample comparison suggests a supplier that can be added to the shortlist', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, 'Ask');
  await page.getByRole('button', { name: financialQuestion, exact: true }).click();
  const turn = page.getByRole('article');
  await expect(turn).toContainText('SUPP_00731: 53');
  await turn.getByRole('button', { name: 'Add 1 to shortlist', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Shortlist' })).toContainText('SUPP_00731');
});

test('equal financial scores preserve both winners and explain the tie', async ({ page }) => {
  await openWorkspace(page);
  await selectSuppliers(page, ['SUPP_00285', 'SUPP_00476']);
  await tab(page, 'Compare');
  await page.getByLabel('Rank shortlist by').selectOption('Financial_Health_Score');
  await expect(decision(page)).toContainText('2-way tie');
  await expect(decision(page)).toContainText('All suppliers with known scores are tied.');
  await expect(decision(page).getByRole('button', { name: 'SUPP_00285', exact: true })).toBeVisible();
  await expect(decision(page).getByRole('button', { name: 'SUPP_00476', exact: true })).toBeVisible();
});

test('risk explanation evidence opens the supplier profile and its definitions', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, 'Ask');
  await page.getByRole('button', { name: profileQuestion, exact: true }).click();
  const turn = page.getByRole('article');
  await expect(turn).toContainText('Total Risk Index of 80');
  await turn.getByRole('button', { name: 'SUPP_00018', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('SUPP_00018');
  await expect(dialog).toContainText('Highest observed sub-scores');
  await expect(dialog).toContainText(/financial stability/i);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('unknown supplier errors do not claim the chat route is missing', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, 'Ask');
  await page.getByRole('textbox', { name: 'Question' }).fill('Why is the Total Risk Index of SUPP_99999 so high?');
  await page.getByRole('main').getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Supplier not found: SUPP_99999');
  await expect(page.getByText('The chat assistant is temporarily unavailable.')).toBeHidden();
});

test('compare overlays up to three suppliers on a radar with exact values and a bar view', async ({ page }) => {
  await openWorkspace(page);
  await selectSuppliers(page, ['SUPP_00012', 'SUPP_00450', 'SUPP_00731', 'SUPP_00018']);
  await tab(page, 'Compare');
  const profile = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Risk profile', exact: true }) });
  await expect(profile.getByRole('img', { name: /Radar chart of SUPP_00731, SUPP_00012, SUPP_00450/ })).toBeVisible();
  await expect(profile.getByRole('button', { name: 'SUPP_00018', exact: true })).toBeDisabled();
  await profile.getByText('Exact values').click();
  await expect(profile.getByRole('row', { name: /Financial health 53 54 65 50/ })).toBeVisible();
  await profile.getByRole('button', { name: 'Show as bars', exact: true }).click();
  await expect(profile.getByRole('img')).toHaveCount(0);
});

test('blocked clipboard access offers a copyable justification without a browser error', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); } } });
  });
  await openWorkspace(page);
  await selectSuppliers(page, ['SUPP_00012', 'SUPP_00731']);
  await tab(page, 'Compare');
  await page.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Clipboard access is unavailable.');
  await expect(page.getByRole('textbox', { name: 'Shortlist justification' })).toHaveValue(/SUPP_00012.*SUPP_00731/s);
});

test('research exposes the real missing-model response', async ({ page }) => {
  await openWorkspace(page);
  await tab(page, 'Research');
  await expect(page.getByRole('alert')).toContainText('Live research is not available on this server');
  await page.getByLabel('Company name (required)').fill('Siemens AG');
  await page.getByRole('main').getByRole('button', { name: 'Research', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Set LLM_API_KEY, LLM_BASE_URL and LLM_MODEL');
});

function reportFixture(status: ResearchResponse['status']): ResearchResponse {
  return {
    status,
    company: { name: 'Siemens AG', country: 'Germany', website: 'https://www.siemens.com', identity_confidence: status === 'needs_clarification' ? 'low' : 'high', identity_source_ids: ['S1'] },
    plan: ['Verify company identity', 'Review financial and operational sources'],
    summary: status === 'needs_clarification' ? 'Company identity needs clarification.' : 'Evidence requires buyer review. [S1]',
    findings: status === 'needs_clarification' ? [] : [{ category: 'operational', severity: 'unknown', claim: 'Evidence requires buyer review.', source_ids: ['S1'] }],
    sources: [{ id: 'S1', url: 'https://www.siemens.com', title: 'Official company source', published_at: null, retrieved_at: '2026-10-18T11:00:00Z', excerpt: '<script>window.injected=true</script> Public source evidence.', content_type: 'page_content' }],
    limitations: status === 'partial' ? ['A source page could not be extracted.'] : [],
    researched_at: '2026-10-18T11:00:00Z',
    model: 'integration-test-model',
    steps: [{ name: 'Read source pages', status: status === 'partial' ? 'failed' : 'completed', detail: 'Reviewed available evidence.' }],
    clarification_question: status === 'needs_clarification' ? 'Which legal entity do you mean?' : null,
  };
}

for (const [status, label] of [['complete', 'Complete report'], ['partial', 'Partial report'], ['needs_clarification', 'Needs clarification']] as const) {
  test(`research renders ${status} reports and navigable citations (API fixture)`, async ({ page }) => {
    await page.route('**/api/status', route => route.fulfill({ json: { chat_mode: 'live', model_configured: true, search_configured: true, research_ready: true, model: 'integration-test-model' } }));
    await page.route('**/api/research', route => route.fulfill({ json: reportFixture(status) }));
    await openWorkspace(page);
    await tab(page, 'Research');
    await page.getByLabel('Company name (required)').fill('Siemens AG');
    await page.getByRole('main').getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    if (status === 'needs_clarification') await expect(page.getByText(/Which legal entity do you mean/)).toBeVisible();
    if (status === 'partial') await expect(page.getByText('A source page could not be extracted.', { exact: true })).toBeVisible();
    const source = page.getByRole('link', { name: 'Official company source', exact: true });
    await expect(source).toHaveAttribute('href', 'https://www.siemens.com');
    await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    await page.locator('a[href="#source-S1"]').first().click();
    await expect(page).toHaveURL(/#source-S1$/);
    expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, 'injected'))).toBe(false);
  });
}

test('mobile workspace keeps the page within the viewport and opens profiles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('tbody tr:visible').first().getByRole('button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});
