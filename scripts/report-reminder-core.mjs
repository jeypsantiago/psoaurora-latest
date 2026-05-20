import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import PocketBase from 'pocketbase';

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

const findAppState = async (pb, key, fallback) => {
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
  const message = [
    `From: ${encodeAddress(fromName, from)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
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
      projectName: project.name || 'Unnamed project',
      reportTitle: report.title || 'Untitled report',
      period: report.period || '',
      deadline: String(report.deadline || ''),
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

    const subject = fillTemplate(settings.subjectTemplate, values);
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
