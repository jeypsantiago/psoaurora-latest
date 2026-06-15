#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PocketBase from 'pocketbase';
import { getPocketBaseUrl, runReportReminders, processInboundReply } from './report-reminder-core.mjs';
import { handleRegisterRequest } from './registration-api.mjs';
import { handleConfirmSubmissionRequest } from './report-reminder-api.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);
const encodedAssetExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.svg',
  '.txt',
  '.xml',
]);

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const chooseEncodedAsset = async (req, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!encodedAssetExtensions.has(ext)) {
    return { filePath, encoding: '' };
  }

  const accepted = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(accepted) && await fileExists(`${filePath}.br`)) {
    return { filePath: `${filePath}.br`, encoding: 'br' };
  }
  if (/\bgzip\b/.test(accepted) && await fileExists(`${filePath}.gz`)) {
    return { filePath: `${filePath}.gz`, encoding: 'gzip' };
  }
  return { filePath, encoding: '' };
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
};

const sendRuntimeConfig = (res) => {
  const pocketbaseUrl = process.env.VITE_POCKETBASE_URL || process.env.POCKETBASE_URL || '';
  const config = {
    VITE_POCKETBASE_URL: pocketbaseUrl,
    POCKETBASE_URL: pocketbaseUrl,
  };
  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Accept-Encoding',
  });
  res.end(`window.__AURORA_RUNTIME_CONFIG__ = ${JSON.stringify(config)};\n`);
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 1024 * 1024) {
      throw new Error('Request body is too large.');
    }
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
};

const getBearerToken = (req) => {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const verifySuperAdmin = async (token) => {
  if (!token) {
    return { ok: false, status: 401, message: 'Missing authorization token.' };
  }

  const pb = new PocketBase(getPocketBaseUrl());
  pb.autoCancellation(false);
  pb.authStore.save(token, null);

  try {
    const auth = await pb.collection('users').authRefresh();
    const record = auth.record || {};
    const roles = Array.isArray(record.roles) ? record.roles : [];
    const isSuperAdmin = Boolean(record.isSuperAdmin || roles.includes('Super Admin'));
    if (!isSuperAdmin) {
      return { ok: false, status: 403, message: 'Only Super Admin users can send test reminders.' };
    }
    return { ok: true, token: auth.token };
  } catch {
    return { ok: false, status: 401, message: 'Invalid or expired authorization token.' };
  }
};

const handleTestReminder = async (req, res) => {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, message: 'Invalid JSON payload.' });
    return;
  }

  const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : '';
  if (!reportId) {
    sendJson(res, 400, { ok: false, message: 'reportId is required.' });
    return;
  }

  const auth = await verifySuperAdmin(getBearerToken(req));
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, message: auth.message });
    return;
  }

  try {
    const result = await runReportReminders({
      testMode: true,
      targetReportId: reportId,
      authenticate: true,
      requireEnabled: false,
    });

    if (result.sent < 1) {
      sendJson(res, 500, {
        ok: false,
        message: result.failed > 0
          ? 'Test reminder failed. Check reminder log for details.'
          : 'No reminder was sent for the selected report.',
        result,
      });
      return;
    }

    sendJson(res, 200, { ok: true, message: 'Test reminder sent.', result });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      message: error?.message || 'Unable to send test reminder.',
    });
  }
};

const handleInboundEmail = async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const token = urlObj.searchParams.get('token') || '';
  const expectedToken = (process.env.AURORA_INBOUND_EMAIL_TOKEN || '').trim();

  if (!expectedToken || token !== expectedToken) {
    sendJson(res, 401, { ok: false, message: 'Unauthorized webhook token.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, message: 'Invalid JSON payload.' });
    return;
  }

  const rawMime = typeof body.raw === 'string' ? body.raw : '';
  const senderEmail = body.from && typeof body.from === 'object' ? String(body.from.address || '') : String(body.from || '');
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const replyDate = typeof body.date === 'string' ? body.date : '';

  if (!rawMime || !senderEmail || !subject) {
    sendJson(res, 400, { ok: false, message: 'Missing required payload fields (raw, from, subject).' });
    return;
  }

  const match = subject.match(/\[Ref:\s*([a-zA-Z0-9-]+)\]/);
  if (!match) {
    sendJson(res, 400, { ok: false, message: 'No report reference token [Ref: ...] found in subject.' });
    return;
  }
  const reportId = match[1].trim();

  try {
    const result = await processInboundReply(reportId, senderEmail, rawMime, replyDate);
    sendJson(res, 200, { ok: true, message: 'Reply processed and status updated.', result });
  } catch (error) {
    console.error(`[report-reminders] Webhook reply error:`, error.message);
    sendJson(res, 500, { ok: false, message: error.message || 'Error processing email reply.' });
  }
};

const serveStatic = async (req, res) => {
  const rawPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  const requestedPath = rawPath === '/' ? '/index.html' : rawPath;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(distDir, safePath);

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    filePath = path.join(distDir, 'index.html');
  }

  try {
    const originalExt = path.extname(filePath).toLowerCase();
    const selected = await chooseEncodedAsset(req, filePath);
    const data = req.method === 'HEAD' ? null : await fs.readFile(selected.filePath);
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': contentTypes.get(ext) || 'application/octet-stream',
      'Cache-Control': originalExt === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
      'Vary': 'Accept-Encoding',
    };
    if (selected.encoding) {
      headers['Content-Encoding'] = selected.encoding;
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    sendJson(res, 404, { ok: false, message: 'Not found.' });
  }
};

const server = http.createServer(async (req, res) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/runtime-config.js') {
    sendRuntimeConfig(res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/register') {
    await handleRegisterRequest(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/report-reminders/test') {
    await handleTestReminder(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/report-reminders/confirm-submission') {
    await handleConfirmSubmissionRequest(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/emails/inbound')) {
    await handleInboundEmail(req, res);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { ok: false, message: 'Method not allowed.' });
});

server.listen(port, host, () => {
  console.log(`Aurora production server listening at http://${host}:${port}`);
});
