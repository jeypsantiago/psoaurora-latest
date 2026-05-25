#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_PORT = Number(process.env.SMOKE_PORT || 5180);
const BASE_ORIGIN = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${DEFAULT_PORT}`;
const LOGIN_EMAIL = process.env.SMOKE_EMAIL || '';
const LOGIN_PASSWORD = process.env.SMOKE_PASSWORD || '';
const HEADLESS = process.env.SMOKE_HEADLESS !== '0';

if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
  console.error('Missing SMOKE_EMAIL or SMOKE_PASSWORD environment variables.');
  process.exit(1);
}

const childProcesses = [];

const progress = (message) => {
  const now = new Date().toISOString();
  console.log(`[smoke ${now}] ${message}`);
};

const cleanupChildren = async () => {
  for (const child of childProcesses) {
    if (!child || child.killed) continue;
    try {
      if (process.platform === 'win32' && child.pid) {
        spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `taskkill /PID ${child.pid} /T /F`], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else if (child.pid) {
        process.kill(-child.pid, 'SIGTERM');
      } else {
        child.kill('SIGTERM');
      }
    } catch {}
  }
  await delay(350);
};

const spawnNpm = (scriptAndArgs, options = {}) => {
  const commandText = `npm run ${scriptAndArgs}`;
  if (process.platform === 'win32') {
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandText], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...options,
    });
    childProcesses.push(child);
    return child;
  }

  const splitArgs = scriptAndArgs.split(' ').filter(Boolean);
  const child = spawn('npm', ['run', ...splitArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  childProcesses.push(child);
  return child;
};

const spawnNode = (args, options = {}) => {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...options,
  });
  childProcesses.push(child);
  return child;
};

const waitForHttp = async (url, timeoutMs) => {
  const started = Date.now();
  let lastError = 'unknown';

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await delay(300);
  }

  throw new Error(`Timeout waiting for ${url}: ${lastError}`);
};

const waitForOutput = async (page, matcher, timeoutMs = 60000) => {
  const started = Date.now();
  const output = page.locator('pre').first();

  while (Date.now() - started < timeoutMs) {
    try {
      const text = await output.innerText({ timeout: 5000 });
      if (matcher.test(text)) {
        return text;
      }
    } catch {
      // Keep polling until timeout.
    }
    await delay(450);
  }

  const latest = await output.innerText({ timeout: 8000 });
  throw new Error(`Timed out waiting for output: ${String(matcher)}\nLatest output:\n${latest.slice(0, 1200)}`);
};

const clickButton = async (page, name) => {
  const matcher = new RegExp(name, 'i');
  const buttons = page.getByRole('button', { name: matcher });
  const total = await buttons.count();
  let lastError = null;

  for (let index = 0; index < total; index += 1) {
    const candidate = buttons.nth(index);
    if (!(await candidate.isVisible())) {
      continue;
    }

    try {
      await candidate.click({ timeout: 3500 });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const suffix = lastError ? ` Last click error: ${lastError.message || String(lastError)}` : '';
  throw new Error(`No clickable button found for matcher: ${String(matcher)}.${suffix}`);
};

const run = async () => {
  progress(`Starting smoke run against ${BASE_ORIGIN}`);
  const dev = spawnNpm(`dev -- --host 127.0.0.1 --port ${DEFAULT_PORT}`);
  const devLogs = [];
  dev.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    if (devLogs.length < 10) devLogs.push(text.trim());
  });
  dev.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    if (devLogs.length < 10) devLogs.push(text.trim());
  });

  const defaultAllowedOrigins = ['https://www.pso-aurora.com', 'https://pso-aurora.com', 'http://localhost:5173', 'http://127.0.0.1:5173'];
  if (!defaultAllowedOrigins.includes(BASE_ORIGIN)) {
    defaultAllowedOrigins.push(BASE_ORIGIN);
  }

  const runner = spawnNode(['scripts/ops-runner.mjs'], {
    env: {
      ...process.env,
      AURORA_RUNNER_ALLOWED_ORIGINS: defaultAllowedOrigins.join(','),
    },
  });
  const runnerLogs = [];
  runner.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    if (runnerLogs.length < 10) runnerLogs.push(text.trim());
  });
  runner.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    if (runnerLogs.length < 10) runnerLogs.push(text.trim());
  });

  progress('Waiting for Vite dev server...');
  await waitForHttp(BASE_ORIGIN, 90000);
  progress('Waiting for local ops runner...');
  await waitForHttp('http://127.0.0.1:4310/health', 15000);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);

  const result = {
    baseOrigin: BASE_ORIGIN,
    connectivityUrl: '',
    backendOverrideStored: null,
    backendOverrideCleared: false,
    runnerUrlStored: null,
    checks: {
      login: 'pending',
      connectivityRoute: 'pending',
      recheckBackend: 'pending',
      recheckPublicSync: 'pending',
      recheckRunner: 'pending',
      runHealthCheck: 'pending',
      startProdServer: 'pending',
    },
    outputSnippets: {},
    diagnostics: {
      devLogs,
      runnerLogs,
    },
  };

  try {
    progress('Navigating to login page...');
    await page.goto(`${BASE_ORIGIN}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input#email', LOGIN_EMAIL);
    await page.fill('input#password', LOGIN_PASSWORD);
    await clickButton(page, '^Login$');
    await page.waitForURL(/#\/dashboard/, { timeout: 25000 });
    result.checks.login = 'pass';
    progress('Login successful. Opening connectivity tab...');

    await page.goto(`${BASE_ORIGIN}/#/settings?tab=connectivity`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Connectivity & Operations', { timeout: 25000 });
    result.connectivityUrl = page.url();
    result.checks.connectivityRoute = page.url().includes('#/settings') ? 'pass' : 'fail';
    progress('Connectivity tab loaded. Testing backend override controls...');

    const overrideInput = page.locator('xpath=//label[contains(normalize-space(.),"Backend URL Override")]/following-sibling::input[1]').first();
    await overrideInput.fill('https://pb.pso-aurora.com');
    await clickButton(page, 'Apply Backend URL');
    await delay(300);
    result.backendOverrideStored = await page.evaluate(() => window.localStorage.getItem('aurora_backend_url_override'));
    await clickButton(page, 'Clear Override');
    await delay(300);
    result.backendOverrideCleared = (await page.evaluate(() => window.localStorage.getItem('aurora_backend_url_override'))) === null;

    const runnerInput = page.locator('xpath=//label[contains(normalize-space(.),"Runner URL")]/following-sibling::input[1]').first();
    await runnerInput.fill('127.0.0.1:4310/');
    await delay(350);
    result.runnerUrlStored = await page.evaluate(() => window.localStorage.getItem('aurora_ops_runner_url'));
    progress('Testing recheck actions...');

    await clickButton(page, 'Recheck Backend');
    await delay(1400);
    result.checks.recheckBackend = 'pass';

    await clickButton(page, 'Recheck Public Sync');
    await delay(1400);
    result.checks.recheckPublicSync = 'pass';

    await clickButton(page, 'Recheck Runner');
    await delay(1400);
    result.checks.recheckRunner = 'pass';

    progress('Running health check command...');
    await clickButton(page, 'Run Health Check');
    result.outputSnippets.healthCheck = (await waitForOutput(page, /(Aurora Public Health Check|health:public)/i, 90000)).slice(0, 900);
    result.checks.runHealthCheck = 'pass';

    progress('Running start-prod command...');
    await clickButton(page, 'Start Prod Server');
    result.outputSnippets.startProd = (await waitForOutput(page, /Detached process started|started in detached mode/i, 45000)).slice(0, 900);
    result.checks.startProdServer = 'pass';
    progress('UI smoke flow completed.');
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
};

await run()
  .catch(async (error) => {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupChildren();
  });
