import type {
  ReportFrequency,
  ReportProject,
  ReportReminderSettings,
  ReportSubmission,
} from "../types";

export type ReportStatus = "submitted" | "pending" | "due-soon" | "overdue";

export const REPORT_FREQUENCY_OPTIONS: ReportFrequency[] = [
  "monthly",
  "quarterly",
  "annually",
];

export const DEFAULT_REPORT_REMINDER_SETTINGS: ReportReminderSettings = {
  enabled: true,
  dailyReminderEnabled: true,
  defaultLeadDays: 5,
  overdueReminderDays: 5,
  dailyCheckTime: "08:00",
  subjectTemplate: "Report reminder: {{reportTitle}} due on {{deadline}}",
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

const OLD_DEADLINE_DESCRIPTION =
  "This is an official reminder that the report below is approaching its submission deadline. Please ensure that it is completed, reviewed, and submitted on or before the due date.";

const upgradeReportReminderTemplate = (template: string): string =>
  String(template || "")
    .replace(
      /<img\s+src="https?:\/\/(?:aurora|psa)\.pso-aurora\.com\/PSA\.png"[^>]*>/gi,
      "{{psaLogo}}",
    )
    .replace(
      /<h1([^>]*)>\s*Report due on\s*<strong>\{\{deadline\}\}<\/strong>\s*<\/h1>/gi,
      "<h1$1>{{deadlineHeadline}}</h1>",
    )
    .replace(
      /<h1([^>]*)>\s*Test reminder for selected report\s*<\/h1>/gi,
      "<h1$1>{{deadlineHeadline}}</h1>",
    )
    .replace(
      /Report Submission Due\s+in\s*(<span\b[^>]*>)?\s*\{\{daysRemaining\}\}\s+day\(s\)\s*(<\/span>)?/gi,
      (_match, open = "", close = "") => `${open}{{deadlineHeadline}}${close}`,
    )
    .replace(/Submission Countdown/gi, "{{deadlineHeadline}}")
    .replace(
      /This report is due\s+in\s*(<strong\b[^>]*>)?\s*\{\{daysRemaining\}\}\s+day\(s\)\s*(<\/strong>)?\.\s*Timely submission helps maintain accurate monitoring and compliance records\./gi,
      "{{countdownSentence}}",
    )
    .replace(
      /This report is due\s+in\s*(<strong\b[^>]*>)?\s*\{\{daysRemaining\}\}\s+day\(s\)\s*(<\/strong>)?\s*\./gi,
      "{{countdownSentence}}",
    )
    .replace(
      new RegExp(OLD_DEADLINE_DESCRIPTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      "{{deadlineDescription}}",
    )
    .replace(
      /This\s+is\s+an\s+official\s+reminder\s+that\s+the\s+report\s+below\s+is\s+approaching\s+its\s+submission\s+deadline\.\s*Please\s+complete,\s*review,\s*and\s+submit\s+it\s+on\s+or\s+before\s+the\s+deadline\./gi,
      "{{deadlineDescription}}",
    )
    .replace(
      /This\s+is\s+an\s+official\s+reminder\s+that\s+the\s+report\s+below\s+is\s+approaching\s+its\s+submission\s+deadline\.(?:\s|<br\s*\/?>|<\/?p[^>]*>)*Please\s+complete,\s*review,\s*and\s+submit\s+it\s+on\s+or\s+before\s+the\s+deadline\./gi,
      "{{deadlineDescription}}",
    )
    .replace(
      /This\s+is\s+an\s+official\s+reminder\s+that\s+the\s+report\s+below\s+is\s+approaching\s+its\s+submission\s+deadline\.\s*Please\s+ensure\s+that\s+it\s+is\s+completed,\s*reviewed,\s*and\s+submitted\s+on\s+or\s+before\s+the\s+due\s+date\./gi,
      "{{deadlineDescription}}",
    )
    .replace(
      /This\s+is\s+an\s+official\s+reminder\s+that\s+the\s+report\s+below\s+is\s+approaching\s+its\s+submission\s+deadline\.(?:\s|<br\s*\/?>|<\/?p[^>]*>)*Please\s+ensure\s+that\s+it\s+is\s+completed,\s*reviewed,\s*and\s+submitted\s+on\s+or\s+before\s+the\s+due\s+date\./gi,
      "{{deadlineDescription}}",
    )
    .replace(
      /This is an official reminder regarding the report below\. Please complete, review, and submit it <strong>on or before the deadline<\/strong>\./gi,
      "{{deadlineDescription}}",
    )
    .replace(
      /This is an official reminder regarding the report below\. Please complete, review, and submit it on or before the deadline\./gi,
      "{{deadlineDescription}}",
    )
    .replace(
      /This\s+is\s+a\s+manual\s+test\s+reminder\s+for\s+the\s+report\s+below\.\s*Please\s+verify\s+the\s+recipient,\s*content,\s*and\s+SMTP\s+delivery\./gi,
      "{{deadlineDescription}}",
    )
    .replace(/Report Submission Due\s+in\s+\{\{daysRemaining\}\}\s+day\(s\)/gi, "{{deadlineHeadline}}")
    .replace(/in\s+\{\{daysRemaining\}\}\s+day\(s\)/gi, "{{daysRemaining}}")
    .replace(/\{\{daysRemaining\}\}\s+day\(s\)/gi, "{{daysRemaining}}");

const normalizeReminderNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};

export const normalizeReportReminderSettings = (
  value: Partial<ReportReminderSettings> | null | undefined,
): ReportReminderSettings => {
  const settings = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_REPORT_REMINDER_SETTINGS,
    ...settings,
    enabled:
      typeof settings.enabled === "boolean"
        ? settings.enabled
        : DEFAULT_REPORT_REMINDER_SETTINGS.enabled,
    dailyReminderEnabled:
      typeof settings.dailyReminderEnabled === "boolean"
        ? settings.dailyReminderEnabled
        : DEFAULT_REPORT_REMINDER_SETTINGS.dailyReminderEnabled,
    defaultLeadDays: normalizeReminderNumber(
      settings.defaultLeadDays,
      DEFAULT_REPORT_REMINDER_SETTINGS.defaultLeadDays,
    ),
    overdueReminderDays: normalizeReminderNumber(
      settings.overdueReminderDays,
      DEFAULT_REPORT_REMINDER_SETTINGS.overdueReminderDays,
    ),
    subjectTemplate: upgradeReportReminderTemplate(
      settings.subjectTemplate || DEFAULT_REPORT_REMINDER_SETTINGS.subjectTemplate,
    ),
    bodyTemplate: upgradeReportReminderTemplate(
      settings.bodyTemplate || DEFAULT_REPORT_REMINDER_SETTINGS.bodyTemplate,
    ),
  };
};

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

export const normalizeLeadDays = (value: unknown, fallback = 5): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};

export const formatReportFrequency = (frequency: ReportFrequency): string => {
  if (frequency === "monthly") return "Monthly";
  if (frequency === "quarterly") return "Quarterly";
  return "Annually";
};

export const isReportHistoryRecord = (
  report: Pick<ReportSubmission, "submittedDate" | "archived">,
): boolean => Boolean(report.submittedDate || report.archived);

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const parseDateOnly = (value?: string): Date | null => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

export const addReportFrequencyToDate = (
  value: string,
  frequency: ReportFrequency,
): string => {
  const source = parseDateOnly(value) || startOfToday();
  const monthsToAdd = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const targetMonthIndex = source.getMonth() + monthsToAdd;
  const targetYear = source.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(source.getDate(), daysInMonth(targetYear, normalizedMonth));
  return toDateOnly(new Date(targetYear, normalizedMonth, targetDay));
};

export const getGeneratedPeriodLabel = (
  deadline: string,
  frequency: ReportFrequency,
): string => {
  const date = parseDateOnly(deadline) || startOfToday();
  const year = date.getFullYear();
  if (frequency === "monthly") {
    return date.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  }
  if (frequency === "quarterly") {
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${year}`;
  }
  return String(year);
};

export const normalizeReportSeries = (
  reports: ReportSubmission[],
): { reports: ReportSubmission[]; changed: boolean } => {
  let changed = false;
  const normalized = reports.map((report, index) => {
    const next: ReportSubmission = {
      ...report,
      seriesId: report.seriesId || report.id || crypto.randomUUID(),
      sequence: Number.isFinite(Number(report.sequence))
        ? Number(report.sequence)
        : index + 1,
      archived: Boolean(report.archived || report.submittedDate),
    };
    if (
      next.seriesId !== report.seriesId ||
      next.sequence !== report.sequence ||
      next.archived !== report.archived
    ) {
      changed = true;
    }
    return next;
  });
  return { reports: normalized, changed };
};

export const createNextReportInstance = (
  report: ReportSubmission,
  existingReports: ReportSubmission[],
): ReportSubmission | null => {
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

export const getReportLeadDays = (
  report: Pick<ReportSubmission, "reminderLeadDays">,
  project: Pick<ReportProject, "reminderLeadDays"> | undefined,
  settings: Pick<ReportReminderSettings, "defaultLeadDays">,
): number => {
  if (report.reminderLeadDays !== null && report.reminderLeadDays !== undefined) {
    return normalizeLeadDays(report.reminderLeadDays, settings.defaultLeadDays);
  }
  if (project?.reminderLeadDays !== null && project?.reminderLeadDays !== undefined) {
    return normalizeLeadDays(project.reminderLeadDays, settings.defaultLeadDays);
  }
  return normalizeLeadDays(settings.defaultLeadDays, 5);
};

export const getReportStatus = (
  report: Pick<ReportSubmission, "deadline" | "submittedDate" | "reminderLeadDays">,
  project: Pick<ReportProject, "reminderLeadDays"> | undefined,
  settings: Pick<ReportReminderSettings, "defaultLeadDays">,
): ReportStatus => {
  if (report.submittedDate) return "submitted";

  const deadline = new Date(`${report.deadline}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) return "pending";

  const today = startOfToday();
  if (deadline < today) return "overdue";

  const leadDays = getReportLeadDays(report, project, settings);
  const dueSoonStart = new Date(deadline);
  dueSoonStart.setDate(deadline.getDate() - leadDays);
  return today >= dueSoonStart ? "due-soon" : "pending";
};

export const formatReportDate = (value?: string): string => {
  if (!value) return "Not submitted";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};
