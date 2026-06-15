import PocketBase from 'pocketbase';
import {
  getPocketBaseUrl,
  runReportReminders,
  processInboundReply,
  REPORT_REMINDER_KEYS,
  findAppState,
  sendSubmissionConfirmationEmail
} from './report-reminder-core.mjs';

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
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
    return { ok: true };
  } catch {
    return { ok: false, status: 401, message: 'Invalid or expired authorization token.' };
  }
};

export const handleReportReminderTestRequest = async (req, res) => {
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

export const handleInboundEmailRequest = async (req, res) => {
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
    console.log('[Webhook Debug] Received payload:', JSON.stringify(body, null, 2));
  } catch (err) {
    console.error('[Webhook Debug] JSON parse error:', err.message);
    sendJson(res, 400, { ok: false, message: 'Invalid JSON payload: ' + err.message });
    return;
  }

  const rawMime = typeof body.raw === 'string' ? body.raw : '';
  const senderEmail = body.from && typeof body.from === 'object' ? String(body.from.address || '') : String(body.from || '');
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const replyDate = typeof body.date === 'string' ? body.date : '';

  if (!rawMime || !senderEmail || !subject) {
    console.warn('[Webhook Debug] Missing fields:', { rawMime: !!rawMime, senderEmail: !!senderEmail, subject: !!subject });
    sendJson(res, 400, { ok: false, message: 'Missing required payload fields (raw, from, subject).' });
    return;
  }

  const match = subject.match(/\[Ref:\s*([a-zA-Z0-9-]+)\]/);
  if (!match) {
    console.warn('[Webhook Debug] Ref token missing in subject:', subject);
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

const verifyUser = async (token) => {
  if (!token) {
    return { ok: false, status: 401, message: 'Missing authorization token.' };
  }

  const pb = new PocketBase(getPocketBaseUrl());
  pb.autoCancellation(false);
  pb.authStore.save(token, null);

  try {
    const auth = await pb.collection('users').authRefresh();
    return { ok: true, user: auth.record };
  } catch {
    return { ok: false, status: 401, message: 'Invalid or expired authorization token.' };
  }
};

export const handleConfirmSubmissionRequest = async (req, res) => {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, message: 'Invalid JSON payload.' });
    return;
  }

  const { reportId, submittedDate, recordedVia } = body;
  if (!reportId || !submittedDate) {
    sendJson(res, 400, { ok: false, message: 'reportId and submittedDate are required.' });
    return;
  }

  const auth = await verifyUser(getBearerToken(req));
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, message: auth.message });
    return;
  }

  try {
    const pb = new PocketBase(getPocketBaseUrl());
    pb.autoCancellation(false);
    pb.authStore.save(getBearerToken(req), null);

    const [{ value: submissions }, { value: projects }] = await Promise.all([
      findAppState(pb, REPORT_REMINDER_KEYS.submissions, []),
      findAppState(pb, REPORT_REMINDER_KEYS.projects, []),
    ]);

    const reportList = Array.isArray(submissions) ? submissions : [];
    const projectList = Array.isArray(projects) ? projects : [];

    const report = reportList.find(r => String(r.id) === String(reportId));
    if (!report) {
      sendJson(res, 404, { ok: false, message: `Report submission not found.` });
      return;
    }

    const project = projectList.find(p => String(p.id) === String(report.projectId));
    if (!project) {
      sendJson(res, 404, { ok: false, message: `Project not found for this report.` });
      return;
    }

    const focalUser = await pb.collection('users').getOne(project.focalUserId);
    if (!focalUser || !focalUser.email) {
      sendJson(res, 400, { ok: false, message: 'Focal person email not found.' });
      return;
    }

    const emailSent = await sendSubmissionConfirmationEmail({
      focalEmail: focalUser.email,
      focalName: focalUser.name || focalUser.email,
      projectName: project.name || 'Unnamed project',
      reportTitle: report.title || 'Untitled report',
      period: report.period || '',
      deadline: report.deadline || '',
      submittedDate,
      recordedVia: recordedVia || 'Web Application',
    });

    sendJson(res, 200, { ok: true, emailSent });
  } catch (error) {
    console.error(`[report-reminders] Confirmation email error:`, error.message);
    sendJson(res, 500, { ok: false, message: error.message || 'Error sending confirmation email.' });
  }
};

