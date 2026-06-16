import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import PocketBase from 'pocketbase';
import fs from 'node:fs';


export const REPORT_REMINDER_KEYS = {
  projects: 'aurora_report_projects',
  submissions: 'aurora_report_submissions',
  settings: 'aurora_report_settings',
  log: 'aurora_report_reminder_log',
};

export const DEFAULT_REPORT_REMINDER_SETTINGS = {
  enabled: true,
  dailyReminderEnabled: true,
  defaultLeadDays: 5,
  overdueReminderDays: 5,
  dailyCheckTime: '08:00',
  subjectTemplate: 'Report reminder: {{reportTitle}} due on {{deadline}}',
  bodyTemplate:
    `<div style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef2f7;padding:28px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:640px;max-width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #dbe3ef;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:#ffffff;border-bottom:4px solid #1d4ed8;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td width="78" style="vertical-align:middle;">{{psaLogo}}</td>
                  <td style="vertical-align:middle;padding-left:6px;">
                    <div style="font-size:16px;font-weight:800;line-height:1.3;color:#111827;">Philippine Statistics Authority</div>
                    <div style="font-size:13px;font-weight:600;line-height:1.4;color:#4b5563;">Aurora Provincial Statistical Office</div>
                    <div style="margin-top:8px;font-size:10px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#1d4ed8;">Report Monitoring Reminder</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px 8px;background:#ffffff;">
              <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hello <strong style="color:#111827;">{{focalPersonName}}</strong>,</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f8fafc;border:1px solid #dbe3ef;border-left:5px solid #dc2626;border-radius:12px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#1d4ed8;margin-bottom:8px;">Deadline Status</div>
                    <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;color:#b91c1c;font-weight:800;">{{deadlineHeadline}}</h1>
                    <p style="margin:0;font-size:14px;line-height:1.65;color:#374151;">{{deadlineDescription}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px;background:#ffffff;">
              <div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#374151;margin-bottom:10px;">Report Details</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;background:#ffffff;">
                <tr>
                  <td width="34%" style="padding:13px 15px;font-size:12px;font-weight:700;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Project / Activity</td>
                  <td style="padding:13px 15px;font-size:14px;font-weight:800;color:#111827;border-bottom:1px solid #e5e7eb;">{{projectName}}</td>
                </tr>
                <tr>
                  <td width="34%" style="padding:13px 15px;font-size:12px;font-weight:700;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Report</td>
                  <td style="padding:13px 15px;font-size:14px;font-weight:800;color:#111827;border-bottom:1px solid #e5e7eb;">{{reportTitle}}</td>
                </tr>
                <tr>
                  <td width="34%" style="padding:13px 15px;font-size:12px;font-weight:700;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Reporting Period</td>
                  <td style="padding:13px 15px;font-size:14px;font-weight:800;color:#111827;border-bottom:1px solid #e5e7eb;">{{period}}</td>
                </tr>
                <tr>
                  <td width="34%" style="padding:13px 15px;font-size:12px;font-weight:700;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Deadline</td>
                  <td style="padding:13px 15px;font-size:14px;font-weight:900;color:#b91c1c;border-bottom:1px solid #e5e7eb;">{{deadline}}</td>
                </tr>
                <tr>
                  <td width="34%" style="padding:13px 15px;font-size:12px;font-weight:700;color:#6b7280;background:#f9fafb;">Focal Email</td>
                  <td style="padding:13px 15px;font-size:14px;font-weight:700;color:#111827;">{{focalPersonEmail}}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;background:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;margin-bottom:6px;">Required Action</div>
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#1f2937;">Submit the report or update the submitted date in Report Monitoring if already completed.</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#4b5563;">If the report has already been submitted, kindly disregard this reminder.</p>
              <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#4b5563;">Thank you.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background:#111827;color:#d1d5db;font-size:12px;line-height:1.5;">
              This is an automated reminder from the PSO Aurora Report Monitoring System.<br />
              Philippine Statistics Authority - Aurora Provincial Statistical Office
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`,
};

export const getPocketBaseUrl = () =>
  process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';

export const createPocketBaseClient = () => {
  const pb = new PocketBase(getPocketBaseUrl());
  pb.autoCancellation(false);
  return pb;
};

const quoted = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export const findAppState = async (pb, key, fallback) => {
  try {
    const record = await pb.collection('app_state').getFirstListItem(`key = ${quoted(key)} && scope = 'global'`);
    return { record, value: record.value ?? fallback };
  } catch (error) {
    if (Number(error?.status || 0) === 404) return { record: null, value: fallback };
    throw error;
  }
};

const upsertAppState = async (pb, key, value) => {
  const existing = await findAppState(pb, key, null);
  const payload = { key, scope: 'global', ownerId: '', value };
  if (existing.record?.id) {
    await pb.collection('app_state').update(existing.record.id, payload);
    return;
  }
  await pb.collection('app_state').create(payload);
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLeadDays = (report, project, settings) => {
  const raw = report.reminderLeadDays ?? project?.reminderLeadDays ?? settings.defaultLeadDays ?? 5;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 5;
};

const getOverdueReminderDays = (settings) => {
  const parsed = Number(settings.overdueReminderDays ?? 5);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 5;
};

const toDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const daysBetween = (fromDate, toDate) =>
  Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);

const getReminderCheckpoint = ({ daysUntilDeadline, leadDays, overdueReminderDays, testMode }) => {
  if (!testMode && (daysUntilDeadline > leadDays || daysUntilDeadline < -overdueReminderDays)) {
    return null;
  }

  if (daysUntilDeadline > 0) {
    const dayLabel = daysUntilDeadline === 1 ? 'tomorrow' : `in ${daysUntilDeadline} days`;
    return {
      stage: 'before-deadline',
      triggerOffsetDays: daysUntilDeadline,
      headline: `Report due ${dayLabel}`,
      description:
        'This is an official reminder that the report below is approaching its submission deadline. Please complete, review, and submit it on or before the deadline.',
    };
  }

  if (daysUntilDeadline === 0) {
    return {
      stage: 'deadline-day',
      triggerOffsetDays: 0,
      headline: 'Report due today',
      description:
        'This is an official reminder that the report below is due today. Please submit the report or update the submitted date as soon as it is completed.',
    };
  }

  if (daysUntilDeadline === -overdueReminderDays) {
    const daysOverdue = Math.abs(daysUntilDeadline);
    return {
      stage: 'after-deadline',
      triggerOffsetDays: daysUntilDeadline,
      headline: `Report overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`,
      description:
        'This is an official overdue reminder. The report below has passed its deadline and still has no submitted date recorded.',
    };
  }

  const daysOverdue = Math.abs(daysUntilDeadline);
  return {
    stage: 'after-deadline',
    triggerOffsetDays: daysUntilDeadline,
    headline: `Report overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`,
    description:
      'This is an official overdue reminder. The report below has passed its deadline and still has no submitted date recorded.',
  };
};

export const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
  }
  const date = new Date(dateStr);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }
  return dateStr;
};

const fillTemplate = (template, values) =>
  String(template || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => String(values[key] ?? ''));

const upgradeReminderTemplate = (template) =>
  String(template || '')
    .replace(
      /<img\s+src="https?:\/\/(?:aurora|psa)\.pso-aurora\.com\/PSA\.png"[^>]*>/gi,
      '{{psaLogo}}',
    )
    .replace(
      /<h1([^>]*)>\s*Report due on\s*<strong>\{\{deadline\}\}<\/strong>\s*<\/h1>/gi,
      '<h1$1>{{deadlineHeadline}}</h1>',
    )
    .replace(
      /<h1([^>]*)>\s*Test reminder for selected report\s*<\/h1>/gi,
      '<h1$1>{{deadlineHeadline}}</h1>',
    )
    .replace(/Submission Countdown/gi, '{{deadlineHeadline}}')
    .replace(
      /This\s+is\s+an\s+official\s+reminder\s+that\s+the\s+report\s+below\s+is\s+approaching\s+its\s+submission\s+deadline\.\s*Please\s+complete,\s*review,\s*and\s+submit\s+it\s+on\s+or\s+before\s+the\s+deadline\./gi,
      '{{deadlineDescription}}',
    )
    .replace(
      /This\s+is\s+an\s+official\s+reminder\s+that\s+the\s+report\s+below\s+is\s+approaching\s+its\s+submission\s+deadline\.(?:\s|<br\s*\/?>|<\/?p[^>]*>)*Please\s+complete,\s*review,\s*and\s+submit\s+it\s+on\s+or\s+before\s+the\s+deadline\./gi,
      '{{deadlineDescription}}',
    )
    .replace(
      /This\s+is\s+an\s+official\s+reminder\s+that\s+the\s+report\s+below\s+is\s+approaching\s+its\s+submission\s+deadline\.\s*Please\s+ensure\s+that\s+it\s+is\s+completed,\s*reviewed,\s*and\s+submitted\s+on\s+or\s+before\s+the\s+due\s+date\./gi,
      '{{deadlineDescription}}',
    )
    .replace(
      /This\s+is\s+an\s+official\s+reminder\s+that\s+the\s+report\s+below\s+is\s+approaching\s+its\s+submission\s+deadline\.(?:\s|<br\s*\/?>|<\/?p[^>]*>)*Please\s+ensure\s+that\s+it\s+is\s+completed,\s*reviewed,\s*and\s+submitted\s+on\s+or\s+before\s+the\s+due\s+date\./gi,
      '{{deadlineDescription}}',
    )
    .replace(
      /This is an official reminder regarding the report below\. Please complete, review, and submit it <strong>on or before the deadline<\/strong>\./gi,
      '{{deadlineDescription}}',
    )
    .replace(
      /This is an official reminder regarding the report below\. Please complete, review, and submit it on or before the deadline\./gi,
      '{{deadlineDescription}}',
    )
    .replace(
      /This\s+is\s+a\s+manual\s+test\s+reminder\s+for\s+the\s+report\s+below\.\s*Please\s+verify\s+the\s+recipient,\s*content,\s*and\s+SMTP\s+delivery\./gi,
      '{{deadlineDescription}}',
    );

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildPsaLogoHtml = () => {
  const logoUrl = String(process.env.PSA_LOGO_URL || '').trim();
  if (!logoUrl) {
    return '<div style="width:58px;height:58px;border-radius:12px;border:1px solid #e4e4e7;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#2563eb;background:#eff6ff;text-align:center;line-height:58px;">PSA</div>';
  }

  return `<img src="${escapeHtml(logoUrl)}" alt="PSA Logo" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:contain;border:0;" />`;
};

const stripHtmlToText = (html) =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h1|h2|h3|tr|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const encodeHeader = (value) =>
  /[^\x20-\x7e]/.test(String(value))
    ? `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`
    : String(value).replace(/[\r\n]+/g, ' ');

const escapeMimeLine = (value) => String(value).replace(/^\./gm, '..');
const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 15000);

const encodeAddress = (name, email) => {
  const cleanEmail = String(email || '').replace(/[\r\n<>]+/g, '').trim();
  const cleanName = String(name || '').replace(/[\r\n"]+/g, ' ').trim();
  return cleanName ? `${encodeHeader(cleanName)} <${cleanEmail}>` : cleanEmail;
};

const readResponse = (socket) =>
  new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      socket.off('data', onData);
      reject(new Error('SMTP server response timed out.'));
    }, SMTP_TIMEOUT_MS);
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) {
        clearTimeout(timer);
        socket.off('data', onData);
        resolve(buffer);
      }
    };
    socket.on('data', onData);
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

const sendCommand = async (socket, command, expected) => {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));
  const expectedCodes = Array.isArray(expected) ? expected : [expected];
  if (!expectedCodes.includes(code)) {
    const safeCommand = /^(AUTH LOGIN|[A-Za-z0-9+/=]{8,})$/i.test(command.trim())
      ? '[redacted-auth-command]'
      : command;
    throw new Error(`SMTP command failed (${safeCommand}): ${response.trim()}`);
  }
  return response;
};

const connectSmtp = () =>
  new Promise((resolve, reject) => {
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === '1' || port === 465;
    if (!host) reject(new Error('SMTP_HOST is required.'));

    const socket = secure
      ? tls.connect({ host, port, servername: host, timeout: SMTP_TIMEOUT_MS }, () => resolve(socket))
      : net.connect({ host, port, timeout: SMTP_TIMEOUT_MS }, () => resolve(socket));
    socket.setTimeout(SMTP_TIMEOUT_MS, () => {
      socket.destroy(new Error(`SMTP connection timed out to ${host}:${port}.`));
    });
    socket.once('error', reject);
  });

export const sendReportReminderEmail = async ({ to, subject, htmlBody, textBody }) => {
  const host = process.env.SMTP_HOST || '';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM || user;
  const fromName = process.env.SMTP_FROM_NAME || process.env.SMTP_SENDER_NAME || 'PSO-Aurora';
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !from) throw new Error('SMTP_HOST and SMTP_FROM or SMTP_USER are required.');

  const socket = await connectSmtp();
  await readResponse(socket);
  await sendCommand(socket, `EHLO ${process.env.SMTP_HELO || 'pso-aurora.local'}`, 250);

  if (process.env.SMTP_SECURE !== '1' && port !== 465 && process.env.SMTP_STARTTLS !== '0') {
    await sendCommand(socket, 'STARTTLS', 220);
    const secureSocket = tls.connect({ socket, servername: host });
    await sendCommand(secureSocket, `EHLO ${process.env.SMTP_HELO || 'pso-aurora.local'}`, 250);
    return sendEmailOverSocket(secureSocket, { user, pass, from, fromName, to, subject, htmlBody, textBody });
  }

  return sendEmailOverSocket(socket, { user, pass, from, fromName, to, subject, htmlBody, textBody });
};

const sendEmailOverSocket = async (socket, { user, pass, from, fromName, to, subject, htmlBody, textBody }) => {
  if (user && pass) {
    await sendCommand(socket, 'AUTH LOGIN', 334);
    await sendCommand(socket, Buffer.from(user).toString('base64'), 334);
    await sendCommand(socket, Buffer.from(pass).toString('base64'), 235);
  }

  await sendCommand(socket, `MAIL FROM:<${from}>`, 250);
  await sendCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
  await sendCommand(socket, 'DATA', 354);
  
  const boundary = `report-reminder-${crypto.randomUUID()}`;
  const replyTo = (process.env.SMTP_REPLY_TO || '').trim();
  const headers = [
    `From: ${encodeAddress(fromName, from)}`,
    replyTo ? `Reply-To: ${replyTo}` : '',
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  const message = [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    escapeMimeLine(textBody),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    escapeMimeLine(htmlBody),
    '',
    `--${boundary}--`,
    '.',
  ].join('\r\n');
  
  await sendCommand(socket, message, 250);
  await sendCommand(socket, 'QUIT', 221).catch(() => undefined);
  socket.end();
};

export const authenticateSuperuserClient = async (pb) => {
  const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL || '';
  const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD || '';
  if (!superuserEmail || !superuserPassword) {
    throw new Error('Missing POCKETBASE_SUPERUSER_EMAIL or POCKETBASE_SUPERUSER_PASSWORD.');
  }
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);
};

export const runReportReminders = async ({
  pb = createPocketBaseClient(),
  dryRun = false,
  testMode = false,
  targetReportId = '',
  requireEnabled = true,
  authenticate = true,
} = {}) => {
  const normalizedTargetReportId = String(targetReportId || '').trim();
  if (testMode && !normalizedTargetReportId) {
    throw new Error('REPORT_REMINDER_REPORT_ID is required when testMode is enabled.');
  }

  if (authenticate) {
    await authenticateSuperuserClient(pb);
  }

  const [{ value: projects }, { value: submissions }, { value: rawSettings }, { value: rawLog }] = await Promise.all([
    findAppState(pb, REPORT_REMINDER_KEYS.projects, []),
    findAppState(pb, REPORT_REMINDER_KEYS.submissions, []),
    findAppState(pb, REPORT_REMINDER_KEYS.settings, DEFAULT_REPORT_REMINDER_SETTINGS),
    findAppState(pb, REPORT_REMINDER_KEYS.log, []),
  ]);

  const settings = { ...DEFAULT_REPORT_REMINDER_SETTINGS, ...(rawSettings && typeof rawSettings === 'object' ? rawSettings : {}) };
  settings.enabled = typeof settings.enabled === 'boolean' ? settings.enabled : DEFAULT_REPORT_REMINDER_SETTINGS.enabled;
  settings.dailyReminderEnabled =
    typeof settings.dailyReminderEnabled === 'boolean'
      ? settings.dailyReminderEnabled
      : DEFAULT_REPORT_REMINDER_SETTINGS.dailyReminderEnabled;
  settings.defaultLeadDays = getLeadDays({}, {}, settings);
  settings.overdueReminderDays = getOverdueReminderDays(settings);
  const reminderLog = Array.isArray(rawLog) ? rawLog : [];
  const projectList = Array.isArray(projects) ? projects : [];
  const reportList = Array.isArray(submissions) ? submissions : [];

  if ((!settings.enabled || !settings.dailyReminderEnabled) && !testMode && requireEnabled) {
    return { sent: 0, failed: 0, skipped: 0, disabled: true };
  }

  const userRecords = await pb.collection('users').getFullList({ sort: 'name' });
  const usersById = new Map(userRecords.map((user) => [String(user.id), user]));
  const projectsById = new Map(projectList.map((project) => [String(project.id), project]));
  const sentReminderDates = new Set(
    reminderLog
      .filter((entry) => entry.status === 'sent')
      .map((entry) => {
        const reportId = String(entry.reportId || '');
        const reminderDate =
          String(entry.reminderDate || '').slice(0, 10) ||
          toDateOnly(normalizeDate(entry.sentAt) || new Date(entry.sentAt || ''));
        return `${reportId}:${reminderDate}`;
      }),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reminderDate = toDateOnly(today);
  const nextLog = [...reminderLog];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const report of reportList) {
    if (!report) {
      skipped += 1;
      continue;
    }

    if (normalizedTargetReportId && String(report.id) !== normalizedTargetReportId) {
      skipped += 1;
      continue;
    }

    if (!testMode && (report.submittedDate || report.archived)) {
      skipped += 1;
      continue;
    }

    const project = projectsById.get(String(report.projectId));
    if (!project || (!testMode && project.active === false)) {
      skipped += 1;
      continue;
    }

    const deadline = normalizeDate(report.deadline);
    if (!deadline) {
      skipped += 1;
      continue;
    }

    const leadDays = getLeadDays(report, project, settings);
    const overdueReminderDays = getOverdueReminderDays(settings);
    const daysUntilDeadline = daysBetween(today, deadline);
    const checkpoint = getReminderCheckpoint({
      daysUntilDeadline,
      leadDays,
      overdueReminderDays,
      testMode,
    });
    if (!checkpoint) {
      skipped += 1;
      continue;
    }
    const sentTodayKey = `${String(report.id)}:${reminderDate}`;
    if (!testMode && sentReminderDates.has(sentTodayKey)) {
      skipped += 1;
      continue;
    }

    const focal = usersById.get(String(project.focalUserId));
    const focalEmail = String(focal?.email || '').trim();
    const logBase = {
      id: crypto.randomUUID(),
      reportId: String(report.id),
      projectId: String(project.id),
      focalUserId: String(project.focalUserId || ''),
      focalEmail,
      sentAt: new Date().toISOString(),
      reminderStage: checkpoint.stage,
      triggerOffsetDays: checkpoint.triggerOffsetDays,
      daysUntilDeadline,
      reminderDate,
    };

    if (!focalEmail) {
      failed += 1;
      nextLog.push({ ...logBase, status: 'failed', errorMessage: 'Focal person has no email address.' });
      continue;
    }

    const values = {
      reportId: String(report.id),
      projectName: project.name || 'Unnamed project',
      reportTitle: report.title || 'Untitled report',
      period: report.period || '',
      deadline: formatDisplayDate(String(report.deadline || '')),
      daysUntilDeadline: String(daysUntilDeadline),
      reminderStage: checkpoint.stage,
      triggerOffsetDays: String(checkpoint.triggerOffsetDays),
      reminderDate,
      deadlineHeadline: checkpoint.headline,
      deadlineDescription: checkpoint.description,
      countdownSentence: checkpoint.description,
      focalPersonName: focal?.name || focalEmail,
      focalPersonEmail: focalEmail,
      psaLogo: buildPsaLogoHtml(),
    };

    let subject = fillTemplate(settings.subjectTemplate, values);
    if (!subject.includes(`[Ref: ${report.id}]`)) {
      subject = `${subject} [Ref: ${report.id}]`;
    }
    const htmlBody = fillTemplate(upgradeReminderTemplate(settings.bodyTemplate), values);
    const textBody = stripHtmlToText(htmlBody) || [
      'PHILIPPINE STATISTICS AUTHORITY',
      'Aurora Provincial Statistical Office',
      '',
      `Hello ${values.focalPersonName},`,
      '',
      `Project: ${values.projectName}`,
      `Report: ${values.reportTitle}`,
      `Reporting Period: ${values.period}`,
      `Deadline: ${values.deadline}`,
      '',
      values.deadlineDescription,
    ].join('\n');

    try {
      if (dryRun) {
        console.log(`[report-reminders] DRY RUN${testMode ? ' TEST' : ''} ${checkpoint.stage} ${encodeAddress(values.focalPersonName, focalEmail)} | ${subject}`);
      } else {
        await sendReportReminderEmail({ to: focalEmail, subject, htmlBody, textBody });
      }
      sent += 1;
      if (!dryRun) {
        nextLog.push({
          ...logBase,
          reminderStage: checkpoint.stage,
          status: testMode ? 'manual-test' : 'sent',
        });
      }
    } catch (error) {
      failed += 1;
      nextLog.push({ ...logBase, status: 'failed', errorMessage: error?.message || 'Unable to send reminder.' });
    }
  }

  if (nextLog.length !== reminderLog.length) {
    await upsertAppState(pb, REPORT_REMINDER_KEYS.log, nextLog);
  }

  return { sent, failed, skipped, disabled: false };
};

// --- Inbound Email Reply Processing Support ---

export const isReportHistoryRecord = (report) => Boolean(report.submittedDate || report.archived);

const addReportFrequencyToDate = (value, frequency) => {
  const source = normalizeDate(value) || new Date();
  const monthsToAdd = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
  const targetMonthIndex = source.getMonth() + monthsToAdd;
  const targetYear = source.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  
  // Calculate days in target month
  const targetDaysInMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const targetDay = Math.min(source.getDate(), targetDaysInMonth);
  return toDateOnly(new Date(targetYear, normalizedMonth, targetDay));
};

const getGeneratedPeriodLabel = (deadline, frequency) => {
  const date = normalizeDate(deadline) || new Date();
  const year = date.getFullYear();
  if (frequency === 'monthly') {
    return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  }
  if (frequency === 'quarterly') {
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${year}`;
  }
  return String(year);
};

export const createNextReportInstance = (report, existingReports) => {
  const seriesId = report.seriesId || report.id;
  const hasCurrentNext = existingReports.some(
    (entry) =>
      entry.id !== report.id &&
      (entry.seriesId || entry.id) === seriesId &&
      !isReportHistoryRecord(entry),
  );
  if (hasCurrentNext) return null;

  const nextDeadline = addReportFrequencyToDate(report.deadline, report.frequency);
  const now = new Date().toISOString();
  return {
    ...report,
    id: crypto.randomUUID(),
    seriesId,
    period: getGeneratedPeriodLabel(nextDeadline, report.frequency),
    deadline: nextDeadline,
    submittedDate: undefined,
    periodStart: report.periodStart
      ? addReportFrequencyToDate(report.periodStart, report.frequency)
      : undefined,
    periodEnd: report.periodEnd
      ? addReportFrequencyToDate(report.periodEnd, report.frequency)
      : undefined,
    sequence: (Number(report.sequence) || 1) + 1,
    archived: false,
    generatedFromReportId: report.id,
    createdAt: now,
    updatedAt: now,
  };
};

export const extractTextFromMime = (raw) => {
  if (!raw) return '';

  const getBodyOffset = (str) => {
    const idxCrLf = str.indexOf('\r\n\r\n');
    if (idxCrLf !== -1) return idxCrLf + 4;
    const idxLf = str.indexOf('\n\n');
    if (idxLf !== -1) return idxLf + 2;
    return -1;
  };

  // 1. If not multipart, decode body content directly
  const boundaryMatch = raw.match(/boundary="([^"]+)"/i) || raw.match(/boundary=([^\s;]+)/i);
  if (!boundaryMatch) {
    const offset = getBodyOffset(raw);
    const headersSection = offset !== -1 ? raw.slice(0, offset) : '';
    const isHeaderSection = headersSection && /^[a-zA-Z0-9-]+:/m.test(headersSection);

    let body = (offset !== -1 && isHeaderSection) ? raw.slice(offset) : raw;
    const cteMatch = isHeaderSection ? headersSection.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i) : null;
    const cte = cteMatch ? cteMatch[1].trim().toLowerCase() : '';
    body = decodeBodyContent(body, cte);
    return body.trim();
  }

  const boundary = boundaryMatch[1];
  const parts = raw.split(`--${boundary}`);

  // 2. Look for text/plain part
  for (const part of parts) {
    if (part.includes('Content-Type: text/plain')) {
      const offset = getBodyOffset(part);
      if (offset !== -1) {
        let body = part.slice(offset);
        
        // Remove trailing boundary dashes if present
        if (body.endsWith('--')) {
          body = body.slice(0, -2);
        }
        
        const headersSection = part.slice(0, offset);
        const cteMatch = headersSection.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
        const cte = cteMatch ? cteMatch[1].trim().toLowerCase() : '';
        body = decodeBodyContent(body, cte);
        return body.trim();
      }
    }
  }

  // 3. Fallback: parse text/html and strip HTML tags
  for (const part of parts) {
    if (part.includes('Content-Type: text/html')) {
      const offset = getBodyOffset(part);
      if (offset !== -1) {
        let body = part.slice(offset);
        if (body.endsWith('--')) {
          body = body.slice(0, -2);
        }
        const headersSection = part.slice(0, offset);
        const cteMatch = headersSection.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
        const cte = cteMatch ? cteMatch[1].trim().toLowerCase() : '';
        body = decodeBodyContent(body, cte);
        return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  return '';
};

const decodeBodyContent = (body, encoding) => {
  let cleaned = body.trim();
  if (encoding === 'base64') {
    try {
      cleaned = cleaned.replace(/\s+/g, '');
      return Buffer.from(cleaned, 'base64').toString('utf8');
    } catch (e) {
      console.warn('[report-reminders] Failed base64 decoding:', e.message);
      return body;
    }
  }
  if (encoding === 'quoted-printable') {
    try {
      return cleaned
        .replace(/=([\dA-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/=\r?\n/g, '');
    } catch (e) {
      console.warn('[report-reminders] Failed quoted-printable decoding:', e.message);
      return body;
    }
  }
  return body;
};

export const cleanEmailBody = (textBody) => {
  if (!textBody) return '';
  const lines = textBody.split(/\r?\n/);
  const cleanedLines = [];
  for (const line of lines) {
    const cleanLine = line.trim();
    if (
      cleanLine.startsWith('>') ||
      /^on\s+.*,\s+.*,\s+.*wrote:$/i.test(cleanLine) ||
      cleanLine.toLowerCase().startsWith('-----original message-----') ||
      cleanLine.toLowerCase().startsWith('from:') ||
      cleanLine.toLowerCase().startsWith('sent:') ||
      cleanLine.toLowerCase().startsWith('subject:') ||
      cleanLine.toLowerCase().startsWith('to:')
    ) {
      break;
    }
    cleanedLines.push(line);
  }
  return cleanedLines.join('\n').trim();
};

export const parseEmailReply = (bodyText, replyDate) => {
  const cleanBody = bodyText
    .toLowerCase()
    .replace(/>+/g, '')
    .trim();

  const keywords = ['submitted', 'completed', 'done', 'uploaded', 'sent', 'finished', 'approved'];
  const hasKeyword = keywords.some(kw => cleanBody.includes(kw));
  if (!hasKeyword) {
    return { ok: false, reason: 'No submission keywords (submitted, completed, done, etc.) found in the response.' };
  }

  const emailDate = replyDate ? new Date(replyDate) : new Date();
  const fallbackYear = Number.isNaN(emailDate.getTime()) ? new Date().getFullYear() : emailDate.getFullYear();

  const extractDateFromString = (str) => {
    // 1. Look for YYYY-MM-DD
    const yyyymmdd = str.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (yyyymmdd) {
      const year = parseInt(yyyymmdd[1], 10);
      const month = String(yyyymmdd[2]).padStart(2, '0');
      const day = String(yyyymmdd[3]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // 2. Look for MM/DD/YYYY
    const mmddyyyy = str.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
    if (mmddyyyy) {
      const year = parseInt(mmddyyyy[3], 10);
      const month = String(mmddyyyy[1]).padStart(2, '0');
      const day = String(mmddyyyy[2]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // 3. Look for written month name (e.g. "june 15, 2026" or "15 june 2026")
    const monthMap = {
      january: 0, jan: 0,
      february: 1, feb: 1,
      march: 2, mar: 2,
      april: 3, apr: 3,
      may: 4,
      june: 5, jun: 5,
      july: 6, jul: 6,
      august: 7, aug: 7,
      september: 8, sep: 8,
      october: 9, oct: 9,
      november: 10, nov: 10,
      december: 11, dec: 11
    };

    const format1 = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i;
    const format2 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)(?:\s*,?\s*(\d{4}))?\b/i;

    const match1 = str.match(format1);
    if (match1) {
      const monthIndex = monthMap[match1[1].toLowerCase()];
      const day = parseInt(match1[2], 10);
      const year = match1[3] ? parseInt(match1[3], 10) : fallbackYear;
      if (monthIndex !== undefined && !Number.isNaN(day) && day >= 1 && day <= 31) {
        const d = new Date(year, monthIndex, day);
        if (!Number.isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dayStr = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dayStr}`;
        }
      }
    }

    const match2 = str.match(format2);
    if (match2) {
      const day = parseInt(match2[1], 10);
      const monthIndex = monthMap[match2[2].toLowerCase()];
      const year = match2[3] ? parseInt(match2[3], 10) : fallbackYear;
      if (monthIndex !== undefined && !Number.isNaN(day) && day >= 1 && day <= 31) {
        const d = new Date(year, monthIndex, day);
        if (!Number.isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dayStr = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dayStr}`;
        }
      }
    }

    return null;
  };

  // Split bodyText into lines and look for date pattern on lines containing any keyword first
  const lines = cleanBody.split(/\r?\n/);
  for (const line of lines) {
    const hasLineKeyword = keywords.some(kw => line.includes(kw));
    if (hasLineKeyword) {
      const parsed = extractDateFromString(line);
      if (parsed) {
        return { ok: true, date: parsed };
      }
    }
  }

  // Fallback: try parsing date from the entire body
  const parsedDate = extractDateFromString(cleanBody);
  if (parsedDate) {
    return { ok: true, date: parsedDate };
  }

  // 4. Look for relative terms
  if (Number.isNaN(emailDate.getTime())) {
    return { ok: true, date: new Date().toISOString().slice(0, 10) };
  }

  if (cleanBody.includes('yesterday')) {
    const d = new Date(emailDate);
    d.setDate(d.getDate() - 1);
    return { ok: true, date: d.toISOString().slice(0, 10) };
  }

  if (cleanBody.includes('today')) {
    return { ok: true, date: emailDate.toISOString().slice(0, 10) };
  }

  return { ok: true, date: emailDate.toISOString().slice(0, 10) };
};

export const processInboundReply = async (reportId, senderEmail, rawMime, replyDate, pb = createPocketBaseClient()) => {
  await authenticateSuperuserClient(pb);

  const [{ record: submissionsRecord, value: submissions }, { value: projects }] = await Promise.all([
    findAppState(pb, REPORT_REMINDER_KEYS.submissions, []),
    findAppState(pb, REPORT_REMINDER_KEYS.projects, []),
  ]);

  const reportList = Array.isArray(submissions) ? submissions : [];
  const projectList = Array.isArray(projects) ? projects : [];

  const reportIndex = reportList.findIndex(r => String(r.id) === String(reportId));
  if (reportIndex === -1) {
    throw new Error(`Report submission with ID "${reportId}" not found.`);
  }
  const report = reportList[reportIndex];

  const project = projectList.find(p => String(p.id) === String(report.projectId));
  if (!project) {
    throw new Error(`Project with ID "${report.projectId}" not found for this report.`);
  }

  const focalUser = await pb.collection('users').getOne(project.focalUserId);
  if (!focalUser || !focalUser.email) {
    throw new Error('Focal person user record or email not found.');
  }

  const cleanSender = String(senderEmail).trim().toLowerCase();
  const cleanFocalEmail = String(focalUser.email).trim().toLowerCase();
  if (cleanSender !== cleanFocalEmail) {
    throw new Error(`Unauthorized sender: "${senderEmail}". Expected focal person: "${focalUser.email}".`);
  }

  const parsedText = extractTextFromMime(rawMime);
  const cleanBodyText = cleanEmailBody(parsedText);

  const parseResult = parseEmailReply(cleanBodyText, replyDate);
  try {
    fs.writeFileSync('f:/PROJECTS/psoaurora-latest/inbound-email-debug.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      reportId,
      senderEmail,
      replyDate,
      rawMime,
      parsedText,
      cleanBodyText,
      parseResult
    }, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write inbound email debug file:', err);
  }
  if (!parseResult.ok) {
    throw new Error(`Parse failed: ${parseResult.reason}`);
  }

  const now = new Date().toISOString();
  const updatedReport = {
    ...report,
    submittedDate: parseResult.date,
    archived: true,
    updatedAt: now,
  };

  const nextSubmissions = reportList.map((r, idx) => idx === reportIndex ? updatedReport : r);

  const generated = createNextReportInstance(updatedReport, nextSubmissions);
  if (generated) {
    nextSubmissions.unshift(generated);
  }

  if (submissionsRecord && submissionsRecord.id) {
    await pb.collection('app_state').update(submissionsRecord.id, { value: nextSubmissions });
  } else {
    await pb.collection('app_state').create({
      key: REPORT_REMINDER_KEYS.submissions,
      scope: 'global',
      ownerId: '',
      value: nextSubmissions
    });
  }

  const logRecord = await findAppState(pb, REPORT_REMINDER_KEYS.log, []);
  const logs = Array.isArray(logRecord.value) ? logRecord.value : [];
  logs.push({
    id: crypto.randomUUID(),
    reportId: report.id,
    projectId: project.id,
    focalUserId: project.focalUserId,
    focalEmail: cleanFocalEmail,
    sentAt: now,
    status: 'sent',
    reminderStage: 'manual-test',
    reminderDate: parseResult.date,
    errorMessage: `Submission automatically recorded via email reply from ${senderEmail}. Text: "${cleanBodyText.slice(0, 100)}"`
  });
  await upsertAppState(pb, REPORT_REMINDER_KEYS.log, logs);

  // Send confirmation email asynchronously
  void sendSubmissionConfirmationEmail({
    focalEmail: cleanFocalEmail,
    focalName: focalUser.name || focalUser.email,
    projectName: project.name || 'Unnamed project',
    reportTitle: report.title || 'Untitled report',
    period: report.period || '',
    deadline: report.deadline || '',
    submittedDate: parseResult.date,
    recordedVia: 'Email Reply Parser',
  }).catch((err) => {
    console.error('[report-reminders] Error in sendSubmissionConfirmationEmail:', err.message);
  });

  return {
    ok: true,
    reportId: report.id,
    title: report.title,
    period: report.period,
    submittedDate: parseResult.date,
    generatedNextPeriod: generated ? generated.period : null
  };
};

export const sendSubmissionConfirmationEmail = async ({
  focalEmail,
  focalName,
  projectName,
  reportTitle,
  period,
  deadline,
  submittedDate,
  recordedVia,
}) => {
  const subject = `[Confirmed] Submission Recorded: ${reportTitle} - ${period}`;
  const displayDeadline = formatDisplayDate(deadline);
  const displaySubmittedDate = formatDisplayDate(submittedDate);
  
  const htmlBody = `
<div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; background-color: #ffffff; color: #18181b;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
    <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">Submission Confirmed</h1>
    <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; font-weight: 500;">Report Submission Recorded</p>
  </div>
  <div style="padding: 24px;">
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">Hello <strong>${focalName || focalEmail}</strong>,</p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #3f3f46;">
      This email confirms that the submission date for the following report has been successfully recorded in the PSO Aurora Report Monitoring System.
    </p>
    
    <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 4px 0; color: #71717a; width: 120px; font-weight: 600;">Project:</td>
          <td style="padding: 4px 0; color: #18181b; font-weight: 700;">${projectName}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #71717a; font-weight: 600;">Report Title:</td>
          <td style="padding: 4px 0; color: #18181b; font-weight: 700;">${reportTitle}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #71717a; font-weight: 600;">Report Period:</td>
          <td style="padding: 4px 0; color: #18181b;">${period}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #71717a; font-weight: 600;">Deadline:</td>
          <td style="padding: 4px 0; color: #18181b;">${displayDeadline}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #71717a; font-weight: 600;">Submitted Date:</td>
          <td style="padding: 4px 0; color: #10b981; font-weight: 700;">${displaySubmittedDate}</td>
        </tr>
      </table>
    </div>
    
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #71717a; text-align: center;">
      Thank you for keeping your reporting requirements up to date.
    </p>
  </div>
  <div style="padding: 18px 24px; background-color: #111827; color: #d1d5db; font-size: 12px; line-height: 1.5; text-align: center;">
    This is an automated confirmation from the PSO Aurora Report Monitoring System.<br />
    Philippine Statistics Authority - Aurora Provincial Statistical Office
  </div>
</div>
`;

  const textBody = `
Submission Confirmed
Report Submission Recorded

Hello ${focalName || focalEmail},

This email confirms that the submission date for the following report has been successfully recorded in the PSO Aurora Report Monitoring System:

Project: ${projectName}
Report Title: ${reportTitle}
Report Period: ${period}
Deadline: ${displayDeadline}
Submitted Date: ${displaySubmittedDate}

Thank you for keeping your reporting requirements up to date.
---
Philippine Statistics Authority - Aurora Provincial Statistical Office
`;

  try {
    await sendReportReminderEmail({ to: focalEmail, subject, htmlBody, textBody });
    console.log(`[report-reminders] Confirmation email sent to ${focalEmail} via ${recordedVia}.`);
    return true;
  } catch (error) {
    console.error(`[report-reminders] Failed to send confirmation email to ${focalEmail}:`, error.message);
    return false;
  }
};
