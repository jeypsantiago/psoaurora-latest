#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8');

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
};

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env.smoke.local'));

const DEFAULT_PORT = Number(process.env.SMOKE_PORT || 5181);
const BASE_ORIGIN = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${DEFAULT_PORT}`;
const LOGIN_EMAIL = process.env.SMOKE_EMAIL || '';
const LOGIN_PASSWORD = process.env.SMOKE_PASSWORD || '';
const HEADLESS = process.env.SMOKE_HEADLESS !== '0';
const REQUIRE_AUTH = process.env.SMOKE_REQUIRE_AUTH === '1';

const childProcesses = [];

const progress = (message) => {
  const now = new Date().toISOString();
  console.log(`[landing-settings-smoke ${now}] ${message}`);
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

const clickButton = async (page, name) => {
  const matcher = new RegExp(name, 'i');
  const buttons = page.getByRole('button', { name: matcher });
  const total = await buttons.count();
  let lastError = null;

  for (let index = 0; index < total; index += 1) {
    const candidate = buttons.nth(index);
    if (!(await candidate.isVisible())) continue;

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
  dev.stdout?.on('data', () => {});
  dev.stderr?.on('data', () => {});

  progress('Waiting for Vite dev server...');
  await waitForHttp(BASE_ORIGIN, 90000);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);

  const result = {
    baseOrigin: BASE_ORIGIN,
    checks: {
      landingTeamSection: 'pending',
      landingCensusSection: 'pending',
      portalRoute: 'pending',
      portalCard: LOGIN_EMAIL && LOGIN_PASSWORD ? 'pending' : 'skipped',
    },
  };

  try {
    progress('Checking public landing sections...');
    await page.goto(BASE_ORIGIN, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('section#team', { timeout: 25000 });
    await page.waitForSelector('section#highlights', { timeout: 25000 });
    result.checks.landingTeamSection = 'pass';
    result.checks.landingCensusSection = 'pass';

    if (LOGIN_EMAIL && LOGIN_PASSWORD) {
      progress('Logging in for portal settings check...');
      await page.goto(`${BASE_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
      await page.fill('input#email', LOGIN_EMAIL);
      await page.fill('input#password', LOGIN_PASSWORD);
      await clickButton(page, '^Login$');
      await page.waitForURL(/\/dashboard$/, { timeout: 25000 });

      await page.goto(`${BASE_ORIGIN}/settings?tab=portal`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=Portal Configuration (Landing Page)', { timeout: 25000 });
      await page.waitForSelector('text=Quick Setup Guide', { timeout: 25000 });
      result.checks.portalRoute = 'pass';
      result.checks.portalCard = 'pass';
    } else {
      progress('Checking unauthenticated portal redirect...');
      await page.goto(`${BASE_ORIGIN}/settings?tab=portal`, { waitUntil: 'domcontentloaded' });
      await delay(1500);
      const portalCardVisible =
        (await page.getByText('Portal Configuration (Landing Page)').count()) > 0;
      const loadingVisible =
        (await page.getByText('Loading secure session...').count()) > 0;
      const loginVisible = (await page.getByText('Login').count()) > 0;
      if (portalCardVisible) {
        throw new Error('Unauthenticated access unexpectedly reached the portal settings card.');
      }
      if (!loadingVisible && !loginVisible && !page.url().includes('/login')) {
        throw new Error(`Expected protected route or login gate, got ${page.url()}`);
      }
      result.checks.portalRoute = 'pass';
    }

    if (REQUIRE_AUTH && (!LOGIN_EMAIL || !LOGIN_PASSWORD)) {
      throw new Error('SMOKE_REQUIRE_AUTH=1 requires SMOKE_EMAIL and SMOKE_PASSWORD to be set.');
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
};

await run()
  .catch(async (error) => {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupChildren();
  });
