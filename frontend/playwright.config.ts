import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localPython = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.PYTHON || (existsSync(localPython) ? localPython : 'python');
const baseURL = 'http://127.0.0.1:8765';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL,
    httpCredentials: { username: 'browser-jury', password: 'browser-test-password' },
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8765`,
    cwd: root,
    url: `${baseURL}/api/ready`,
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      APP_ROOT: root,
      DATA_PATH: path.join(root, 'data/supplier_risk_dataset.csv'),
      CRITERIA_PATH: path.join(root, 'data/risk_criteria_description.md'),
      LLM_API_KEY: '',
      LLM_BASE_URL: '',
      LLM_MODEL: '',
      LLM_EXTRA_BODY: '{}',
      TAVILY_API_KEY: '',
      JURY_USERNAME: 'browser-jury',
      JURY_PASSWORD: 'browser-test-password',
      REQUIRE_JURY_AUTH: 'true',
      REQUIRE_LIVE_AI: 'false',
    },
  },
});
