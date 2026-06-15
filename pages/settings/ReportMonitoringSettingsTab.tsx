import React from "react";
import { AlertTriangle, Bell, Clock, Mail, Trash2 } from "lucide-react";
import { Button, Card, Input } from "../../components/ui";
import type { ReportReminderSettings } from "../../types";

interface ReportMonitoringSettingsTabProps {
  settings: ReportReminderSettings;
  setSettings: React.Dispatch<React.SetStateAction<ReportReminderSettings>>;
  handlePurgeReports: () => void;
}

export const ReportMonitoringSettingsTab: React.FC<ReportMonitoringSettingsTabProps> = ({
  settings,
  setSettings,
  handlePurgeReports,
}) => {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
      <Card
        title="Reminder Automation"
        description="Configure the backend reminder job for report deadlines"
      >
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <Bell size={18} />
              </div>
              <div>
                <p className="text-sm font-black text-zinc-900 dark:text-white">
                  Email reminders
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  The ops runner sends reminders when the scheduled command runs.
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${settings.enabled ? "bg-blue-600 justify-end" : "bg-zinc-300 dark:bg-zinc-700 justify-start"}`}
              aria-label="Toggle report reminder emails"
            >
              <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Default Lead Days"
              type="number"
              min={0}
              value={settings.defaultLeadDays}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  defaultLeadDays: Math.max(0, Number(event.target.value) || 0),
                }))
              }
            />
            <Input
              label="Daily Check Time"
              type="time"
              value={settings.dailyCheckTime}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  dailyCheckTime: event.target.value,
                }))
              }
            />
          </div>

          <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20 flex gap-3">
            <Clock size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed font-medium">
              Individual projects and report schedules can override the default lead days. The backend command skips reminders already logged for the same report.
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="HTML Email Template"
        description="Templates support {{projectName}}, {{reportTitle}}, {{period}}, {{deadline}}, {{deadlineHeadline}}, {{deadlineDescription}}, {{daysUntilDeadline}}, {{reminderStage}}, {{reminderDate}}, {{focalPersonName}}, {{focalPersonEmail}}, {{reportId}}, and {{psaLogo}}"
      >
        <div className="space-y-4">
          <Input
            label="Subject Template"
            value={settings.subjectTemplate}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                subjectTemplate: event.target.value,
              }))
            }
          />
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">
              HTML Body Template
            </label>
            <textarea
              value={settings.bodyTemplate}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  bodyTemplate: event.target.value,
                }))
              }
              rows={12}
              className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all resize-y"
            />
          </div>
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 flex gap-3">
            <Mail size={18} className="text-zinc-400 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Configure SMTP environment variables on the server before scheduling the reminder command: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM. Set PSA_LOGO_URL to show the PSA logo in email clients.
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Danger Zone"
        description="Irreversible system-wide actions for report monitoring"
        className="!border-red-200 dark:!border-red-900/30"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 rounded-3xl bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20 gap-6">
          <div className="flex gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0" />
            <div>
              <h4 className="text-sm font-black text-red-700 dark:text-red-400 uppercase tracking-tight">
                Purge Report Monitoring Data
              </h4>
              <p className="text-xs text-red-600/70 mt-1 leading-relaxed">
                Removes all report projects, report schedules, and reminder logs. Reminder settings are preserved.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={handlePurgeReports}
            className="bg-red-600 text-white hover:bg-red-700 !px-8 h-12 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em]"
          >
            <Trash2 size={14} className="mr-2" /> Wipe Reports
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default React.memo(ReportMonitoringSettingsTab);
