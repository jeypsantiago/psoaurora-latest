import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit3,
  FilePlus2,
  FolderKanban,
  MailCheck,
  MailWarning,
  Plus,
  Search,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { Badge, Button, Card, Input, Modal } from "../components/ui";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { useDialog } from "../DialogContext";
import { useRbac } from "../RbacContext";
import { getAuthToken } from "../services/pocketbase";
import {
  DEFAULT_REPORT_REMINDER_SETTINGS,
  createNextReportInstance,
  formatReportDate,
  formatReportFrequency,
  getGeneratedPeriodLabel,
  getReportLeadDays,
  getReportStatus,
  isReportHistoryRecord,
  normalizeReportSeries,
  REPORT_FREQUENCY_OPTIONS,
  type ReportStatus,
} from "../services/reportMonitoring";
import { readStorageJsonSafe, writeStorageJson } from "../services/storage";
import { useToast } from "../ToastContext";
import type {
  ReportFrequency,
  ReportProject,
  ReportReminderLog,
  ReportReminderSettings,
  ReportSubmission,
} from "../types";
import { useUsers, type User } from "../UserContext";

type ViewTab = "projects" | "all" | "due-soon";
type RecordScope = "current" | "history" | "all";
type ProjectReportView = "active" | "history";

interface ReportRow {
  report: ReportSubmission;
  project?: ReportProject;
  focal?: User;
  status: ReportStatus;
  leadDays: number;
  lastReminder?: ReportReminderLog;
  isHistory: boolean;
  hasCurrentNext: boolean;
}

interface ProjectFormState {
  id?: string;
  name: string;
  focalUserId: string;
  defaultFrequency: ReportFrequency;
  active: boolean;
  reminderLeadDays: string;
  notes: string;
}

interface ReportFormState {
  id?: string;
  projectId: string;
  title: string;
  period: string;
  frequency: ReportFrequency;
  deadline: string;
  submittedDate: string;
  reminderLeadDays: string;
  remarks: string;
}

const emptyProjectForm = (users: User[]): ProjectFormState => ({
  name: "",
  focalUserId: users[0]?.id || "",
  defaultFrequency: "monthly",
  active: true,
  reminderLeadDays: "",
  notes: "",
});

const emptyReportForm = (projects: ReportProject[]): ReportFormState => ({
  projectId: projects[0]?.id || "",
  title: "",
  period: "",
  frequency: projects[0]?.defaultFrequency || "monthly",
  deadline: new Date().toISOString().slice(0, 10),
  submittedDate: "",
  reminderLeadDays: "",
  remarks: "",
});

const statusLabel: Record<ReportStatus, string> = {
  submitted: "Submitted",
  pending: "Pending",
  "due-soon": "Due Soon",
  overdue: "Overdue",
};

const statusBadge: Record<ReportStatus, "default" | "success" | "warning" | "info"> = {
  submitted: "success",
  pending: "default",
  "due-soon": "warning",
  overdue: "warning",
};

const byUpdatedDesc = <T extends { updatedAt: string; createdAt: string }>(a: T, b: T) =>
  (Date.parse(b.updatedAt || b.createdAt) || 0) -
  (Date.parse(a.updatedAt || a.createdAt) || 0);

const isOwnedBy = (
  value: Pick<ReportProject | ReportSubmission, "ownerUserId"> | undefined,
  userId?: string,
) => Boolean(userId && value?.ownerUserId === userId);

export const ReportMonitoringPage: React.FC = () => {
  const { users, currentUser } = useUsers();
  const { can } = useRbac();
  const { toast } = useToast();
  const { confirm } = useDialog();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState<ReportProject[]>(() =>
    readStorageJsonSafe<ReportProject[]>(STORAGE_KEYS.reportProjects, []),
  );
  const [reports, setReports] = useState<ReportSubmission[]>(() =>
    normalizeReportSeries(
      readStorageJsonSafe<ReportSubmission[]>(STORAGE_KEYS.reportSubmissions, []),
    ).reports,
  );
  const [settings] = useState<ReportReminderSettings>(() =>
    readStorageJsonSafe<ReportReminderSettings>(
      STORAGE_KEYS.reportSettings,
      DEFAULT_REPORT_REMINDER_SETTINGS,
    ),
  );
  const [reminderLog, setReminderLog] = useState<ReportReminderLog[]>(() =>
    readStorageJsonSafe<ReportReminderLog[]>(STORAGE_KEYS.reportReminderLog, []),
  );

  const [activeTab, setActiveTab] = useState<ViewTab>("projects");
  const [recordScope, setRecordScope] = useState<RecordScope>("current");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectReportView, setProjectReportView] = useState<ProjectReportView>("active");
  const [projectReportQuery, setProjectReportQuery] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [manualSendingReportId, setManualSendingReportId] = useState<string | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [submittedDateReport, setSubmittedDateReport] =
    useState<ReportSubmission | null>(null);
  const [submittedDateValue, setSubmittedDateValue] = useState("");
  const [projectForm, setProjectForm] = useState<ProjectFormState>(() =>
    emptyProjectForm(users),
  );
  const [reportForm, setReportForm] = useState<ReportFormState>(() =>
    emptyReportForm(projects),
  );
  const didMountProjectsPersistence = useRef(false);
  const didMountReportsPersistence = useRef(false);

  const usersById = useMemo(() => {
    const map = new Map(users.map((user) => [user.id, user]));
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser);
    }
    return map;
  }, [currentUser, users]);
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const isSuperAdmin = Boolean(
    currentUser?.isSuperAdmin || currentUser?.roles?.includes("Super Admin"),
  );
  const currentUserId = currentUser?.id || "";
  const canManageAllReports = isSuperAdmin;
  const visibleProjects = useMemo(
    () =>
      canManageAllReports
        ? projects
        : projects.filter((project) => isOwnedBy(project, currentUserId)),
    [canManageAllReports, currentUserId, projects],
  );
  const visibleProjectIds = useMemo(
    () => new Set(visibleProjects.map((project) => project.id)),
    [visibleProjects],
  );
  const visibleReports = useMemo(
    () =>
      canManageAllReports
        ? reports
        : reports.filter((report) => {
            if (isOwnedBy(report, currentUserId)) return true;
            const project = projectsById.get(report.projectId);
            return isOwnedBy(project, currentUserId);
          }),
    [canManageAllReports, currentUserId, projectsById, reports],
  );

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "projects" || tabParam === "all" || tabParam === "due-soon") {
      setActiveTab(tabParam);
    }
    if (tabParam === "reports") {
      setActiveTab("all");
    }
    if (searchParams.get("action") === "new-report" && can("reports.edit")) {
      openNewReport();
    }
    if (searchParams.get("action") === "new-project" && can("reports.edit")) {
      setActiveTab("projects");
      openNewProject();
    }
    if (searchParams.get("action") === "settings") {
      navigate("/settings?tab=reports");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!didMountProjectsPersistence.current) {
      didMountProjectsPersistence.current = true;
      return;
    }
    writeStorageJson(STORAGE_KEYS.reportProjects, projects);
  }, [projects]);

  useEffect(() => {
    if (!didMountReportsPersistence.current) {
      didMountReportsPersistence.current = true;
      return;
    }
    writeStorageJson(STORAGE_KEYS.reportSubmissions, reports);
  }, [reports]);

  useEffect(() => {
    if (!currentUserId) return;

    setProjects((prev) => {
      let changed = false;
      const next = prev.map((project) => {
        if (project.focalUserId) return project;
        if (!canManageAllReports && project.ownerUserId !== currentUserId) return project;
        changed = true;
        return {
          ...project,
          focalUserId: project.ownerUserId || currentUserId,
        };
      });
      return changed ? next : prev;
    });
  }, [canManageAllReports, currentUserId]);

  const allReportRows = useMemo<ReportRow[]>(() =>
    visibleReports.map((report) => {
      const project = projectsById.get(report.projectId);
      const focal = project ? usersById.get(project.focalUserId) : undefined;
      const status = getReportStatus(report, project, settings);
      const leadDays = getReportLeadDays(report, project, settings);
      const seriesId = report.seriesId || report.id;
      const isHistory = isReportHistoryRecord(report);
      const hasCurrentNext = visibleReports.some(
        (entry) =>
          entry.id !== report.id &&
          (entry.seriesId || entry.id) === seriesId &&
          !isReportHistoryRecord(entry),
      );
      const lastReminder = reminderLog
        .filter((entry) => entry.reportId === report.id)
        .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))[0];
      return { report, project, focal, status, leadDays, lastReminder, isHistory, hasCurrentNext };
    }),
  [projectsById, reminderLog, settings, usersById, visibleReports]);

  const reportRows = useMemo(() => {
    return allReportRows
      .filter((row) => {
        if (activeTab === "due-soon" && row.status !== "due-soon" && row.status !== "overdue") {
          return false;
        }
        if (activeTab === "due-soon" && row.isHistory) return false;
        if (activeTab === "all") {
          if (recordScope === "current" && row.isHistory) return false;
          if (recordScope === "history" && !row.isHistory) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateDiff =
          (Date.parse(`${a.report.deadline}T00:00:00`) || 0) -
          (Date.parse(`${b.report.deadline}T00:00:00`) || 0);
        return activeTab === "due-soon" ? dateDiff : byUpdatedDesc(a.report, b.report);
      });
  }, [activeTab, allReportRows, recordScope]);

  const projectGroups = useMemo(() => {
    const rowsByProject = new Map<string, ReportRow[]>();
    for (const row of allReportRows) {
      if (activeTab === "due-soon" && row.status !== "due-soon" && row.status !== "overdue") {
        continue;
      }
      if (activeTab === "due-soon" && row.isHistory) continue;
      const nextRows = rowsByProject.get(row.report.projectId) || [];
      nextRows.push(row);
      rowsByProject.set(row.report.projectId, nextRows);
    }

    return visibleProjects
      .map((project) => {
        const focal = usersById.get(project.focalUserId);
        const rows = [...(rowsByProject.get(project.id) || [])].sort((a, b) => {
          const dateDiff =
            (Date.parse(`${a.report.deadline}T00:00:00`) || 0) -
            (Date.parse(`${b.report.deadline}T00:00:00`) || 0);
          return dateDiff || a.report.title.localeCompare(b.report.title);
        });
        if (activeTab === "due-soon" && rows.length === 0) {
          return null;
        }
        const currentRows = rows.filter((row) => !row.isHistory);
        const historyRows = rows
          .filter((row) => row.isHistory)
          .sort(
            (a, b) =>
              (Date.parse(`${b.report.deadline}T00:00:00`) || 0) -
              (Date.parse(`${a.report.deadline}T00:00:00`) || 0),
          );
        const dueSoon = currentRows.filter((row) => row.status === "due-soon").length;
        const overdue = currentRows.filter((row) => row.status === "overdue").length;
        const submitted = historyRows.length;
        const nextDeadlineRow = currentRows
          .sort(
            (a, b) =>
              (Date.parse(`${a.report.deadline}T00:00:00`) || 0) -
              (Date.parse(`${b.report.deadline}T00:00:00`) || 0),
          )[0];
        const hasRecentFailure = rows.some((row) => row.lastReminder?.status === "failed");
        return {
          project,
          focal,
          rows,
          currentRows,
          historyRows,
          counts: {
            total: currentRows.length,
            dueSoon,
            overdue,
            submitted,
          },
          nextDeadline: nextDeadlineRow?.report.deadline,
          hasAttention:
            !focal ||
            !String(focal.email || "").trim() ||
            hasRecentFailure,
          hasRecentFailure,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (!a || !b) return 0;
        if (a.project.active !== b.project.active) return a.project.active ? -1 : 1;
        if (a.counts.overdue !== b.counts.overdue) return b.counts.overdue - a.counts.overdue;
        if (a.counts.dueSoon !== b.counts.dueSoon) return b.counts.dueSoon - a.counts.dueSoon;
        const aDate = Date.parse(`${a.nextDeadline || "9999-12-31"}T00:00:00`) || Number.MAX_SAFE_INTEGER;
        const bDate = Date.parse(`${b.nextDeadline || "9999-12-31"}T00:00:00`) || Number.MAX_SAFE_INTEGER;
        return aDate - bDate || a.project.name.localeCompare(b.project.name);
      });
  }, [activeTab, allReportRows, usersById, visibleProjects]);

  const filteredProjectGroups = useMemo(() => {
    const search = projectSearchQuery.trim().toLowerCase();
    if (!search) return projectGroups;
    return projectGroups.filter((group) => {
      if (!group) return false;
      return [
        group.project.name,
        group.focal?.name,
        group.focal?.email,
        group.project.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [projectGroups, projectSearchQuery]);

  const selectedProjectGroup = useMemo(
    () =>
      filteredProjectGroups.find((group) => group?.project.id === selectedProjectId) ||
      filteredProjectGroups[0] ||
      null,
    [filteredProjectGroups, selectedProjectId],
  );

  useEffect(() => {
    if (filteredProjectGroups.length === 0) {
      if (selectedProjectId) setSelectedProjectId(null);
      return;
    }

    const nextProjectId = selectedProjectGroup?.project.id || null;
    if (nextProjectId && selectedProjectId !== nextProjectId) {
      setSelectedProjectId(nextProjectId);
    }
  }, [filteredProjectGroups, selectedProjectGroup, selectedProjectId]);

  useEffect(() => {
    setProjectReportQuery("");
  }, [selectedProjectId]);

  useEffect(() => {
    if (activeTab === "due-soon" && projectReportView === "history") {
      setProjectReportView("active");
    }
  }, [activeTab, projectReportView]);

  const selectedCurrentRows = useMemo(() => {
    const search = projectReportQuery.trim().toLowerCase();
    const rows = selectedProjectGroup?.currentRows || [];
    if (!search) return rows;
    return rows.filter((row) =>
      [
        row.report.title,
        row.report.period,
        row.report.remarks,
        row.focal?.name,
        row.focal?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [projectReportQuery, selectedProjectGroup]);

  const selectedHistoryRows = useMemo(() => {
    const search = projectReportQuery.trim().toLowerCase();
    const rows = selectedProjectGroup?.historyRows || [];
    if (!search) return rows;
    return rows.filter((row) =>
      [
        row.report.title,
        row.report.period,
        row.report.remarks,
        row.focal?.name,
        row.focal?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [projectReportQuery, selectedProjectGroup]);

  const visibleProjectRows =
    activeTab !== "due-soon" && projectReportView === "history"
      ? selectedHistoryRows
      : selectedCurrentRows;

  const stats = useMemo(() => {
    const currentReports = visibleReports.filter((report) => !isReportHistoryRecord(report));
    const rows = currentReports.map((report) => {
      const project = projectsById.get(report.projectId);
      return getReportStatus(report, project, settings);
    });
    const now = new Date();
    return {
      totalProjects: visibleProjects.length,
      activeProjects: visibleProjects.filter((project) => project.active).length,
      dueSoon: rows.filter((status) => status === "due-soon").length,
      overdue: rows.filter((status) => status === "overdue").length,
      submittedThisMonth: visibleReports.filter((report) => {
        if (!report.submittedDate) return false;
        const submitted = new Date(`${report.submittedDate}T00:00:00`);
        return (
          submitted.getFullYear() === now.getFullYear() &&
          submitted.getMonth() === now.getMonth()
        );
      }).length,
    };
  }, [projectsById, settings, visibleProjects, visibleReports]);

  function openNewProject() {
    setProjectForm({
      ...emptyProjectForm(users),
      focalUserId: currentUserId,
    });
    setIsProjectModalOpen(true);
  }

  const openEditProject = (project: ReportProject) => {
    setProjectForm({
      id: project.id,
      name: project.name,
      focalUserId: project.focalUserId,
      defaultFrequency: project.defaultFrequency,
      active: project.active,
      reminderLeadDays:
        project.reminderLeadDays === null || project.reminderLeadDays === undefined
          ? ""
          : String(project.reminderLeadDays),
      notes: project.notes || "",
    });
    setIsProjectModalOpen(true);
  };

  function openNewReport() {
    setReportForm(emptyReportForm(visibleProjects));
    setIsReportModalOpen(true);
  }

  const openNewReportForProject = (project: ReportProject) => {
    setReportForm({
      ...emptyReportForm(visibleProjects),
      projectId: project.id,
      frequency: project.defaultFrequency,
    });
    setSelectedProjectId(project.id);
    setIsReportModalOpen(true);
  };

  const openEditReport = (report: ReportSubmission) => {
    setReportForm({
      id: report.id,
      projectId: report.projectId,
      title: report.title,
      period: report.period,
      frequency: report.frequency,
      deadline: report.deadline,
      submittedDate: report.submittedDate || "",
      reminderLeadDays:
        report.reminderLeadDays === null || report.reminderLeadDays === undefined
          ? ""
          : String(report.reminderLeadDays),
      remarks: report.remarks || "",
    });
    setIsReportModalOpen(true);
  };

  const openSubmittedDateEditor = (report: ReportSubmission) => {
    if (!can("reports.edit")) return;
    setSubmittedDateReport(report);
    setSubmittedDateValue(report.submittedDate || new Date().toISOString().slice(0, 10));
  };

  const saveProject = () => {
    if (!can("reports.edit")) return;
    const name = projectForm.name.trim();
    const existingProject = projects.find((project) => project.id === projectForm.id);
    const focalUserId = existingProject?.focalUserId || currentUserId;
    if (!name || !focalUserId) {
      toast("error", "Project name and focal person are required.");
      return;
    }
    const now = new Date().toISOString();
    const isNewProject = !existingProject;
    const nextProject: ReportProject = {
      id: existingProject?.id || crypto.randomUUID(),
      name,
      focalUserId,
      ownerUserId: existingProject?.ownerUserId || currentUserId,
      defaultFrequency: projectForm.defaultFrequency,
      active: projectForm.active,
      reminderLeadDays:
        projectForm.reminderLeadDays.trim() === ""
          ? null
          : Math.max(0, Number(projectForm.reminderLeadDays) || 0),
      notes: projectForm.notes.trim(),
      createdAt: existingProject?.createdAt || now,
      updatedAt: now,
    };
    setProjects((prev) =>
      prev.some((project) => project.id === nextProject.id)
        ? prev.map((project) => (project.id === nextProject.id ? nextProject : project))
        : [nextProject, ...prev],
    );
    setSelectedProjectId(nextProject.id);
    setActiveTab("projects");
    setIsProjectModalOpen(false);
    toast("success", "Report project saved.");
    if (isNewProject) {
      setReportForm({
        ...emptyReportForm([nextProject]),
        projectId: nextProject.id,
        frequency: nextProject.defaultFrequency,
      });
      setIsReportModalOpen(true);
    }
  };

  const saveReport = () => {
    if (!can("reports.edit")) return;
    const title = reportForm.title.trim();
    const selectedProject = projectsById.get(reportForm.projectId);
    if (!title || !reportForm.projectId || !reportForm.deadline) {
      toast("error", "Report title, project, and deadline are required.");
      return;
    }
    if (!selectedProject || (!canManageAllReports && !visibleProjectIds.has(selectedProject.id))) {
      toast("error", "Select one of your report projects.");
      return;
    }
    const now = new Date().toISOString();
    const existingReport = reports.find((report) => report.id === reportForm.id);
    const nextReport: ReportSubmission = {
      id: reportForm.id || crypto.randomUUID(),
      projectId: reportForm.projectId,
      ownerUserId: existingReport?.ownerUserId || selectedProject.ownerUserId || currentUserId,
      title,
      period:
        reportForm.period.trim() ||
        getGeneratedPeriodLabel(reportForm.deadline, reportForm.frequency),
      frequency: reportForm.frequency,
      deadline: reportForm.deadline,
      submittedDate: reportForm.submittedDate || undefined,
      reminderLeadDays:
        reportForm.reminderLeadDays.trim() === ""
          ? null
          : Math.max(0, Number(reportForm.reminderLeadDays) || 0),
      remarks: reportForm.remarks.trim(),
      seriesId: existingReport?.seriesId || reportForm.id || crypto.randomUUID(),
      periodStart: existingReport?.periodStart,
      periodEnd: existingReport?.periodEnd,
      sequence: existingReport?.sequence || 1,
      archived: Boolean(reportForm.submittedDate || existingReport?.archived),
      generatedFromReportId: existingReport?.generatedFromReportId,
      createdAt: existingReport?.createdAt || now,
      updatedAt: now,
    };
    setReports((prev) => {
      const savedReports = prev.some((report) => report.id === nextReport.id)
        ? prev.map((report) => (report.id === nextReport.id ? nextReport : report))
        : [nextReport, ...prev];
      const generated = nextReport.submittedDate
        ? createNextReportInstance(nextReport, savedReports)
        : null;
      return generated ? [generated, ...savedReports] : savedReports;
    });
    setIsReportModalOpen(false);
    toast(
      "success",
      nextReport.submittedDate
        ? "Report saved and next period checked."
        : "Report schedule saved.",
    );
  };

  const deleteProject = async (project: ReportProject) => {
    if (!can("reports.delete")) return;
    const ok = await confirm(
      `Delete "${project.name}" and all report schedules under it? This cannot be undone.`,
      { title: "Delete Report Project", confirmLabel: "Delete" },
    );
    if (!ok) return;
    setProjects((prev) => prev.filter((entry) => entry.id !== project.id));
    setReports((prev) => prev.filter((entry) => entry.projectId !== project.id));
    toast("success", "Report project deleted.");
  };

  const deleteReport = async (report: ReportSubmission) => {
    if (!can("reports.delete")) return;
    const ok = await confirm(
      `Delete "${report.title}"? This cannot be undone.`,
      { title: "Delete Report Schedule", confirmLabel: "Delete" },
    );
    if (!ok) return;
    setReports((prev) => prev.filter((entry) => entry.id !== report.id));
    toast("success", "Report schedule deleted.");
  };

  const refreshReminderLog = () => {
    setReminderLog(
      readStorageJsonSafe<ReportReminderLog[]>(STORAGE_KEYS.reportReminderLog, []),
    );
  };

  const sendManualTestReminder = async (row: ReportRow) => {
    if (!isSuperAdmin) return;
    if (!row.project) {
      toast("error", "Cannot send a test reminder because the project is missing.");
      return;
    }
    if (!row.focal?.email) {
      toast("error", "Cannot send a test reminder because the focal person has no email.");
      return;
    }
    const ok = await confirm(
      `Send a test reminder for "${row.report.title}" to ${row.focal.email}?`,
      { title: "Send Test Reminder", confirmLabel: "Send Test" },
    );
    if (!ok) return;

    setManualSendingReportId(row.report.id);
    try {
      const token = await getAuthToken();
      const response = await fetch("/api/report-reminders/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reportId: row.report.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        const message =
          result.message ||
          result.error ||
          "The test reminder request did not complete successfully.";
        throw new Error(String(message).slice(0, 240));
      }
      refreshReminderLog();
      toast("success", "Test reminder sent.");
    } catch (error) {
      toast(
        "error",
        error instanceof TypeError
          ? "Cannot reach the report reminder API. Confirm the deployed app is running the production Node server."
          : error instanceof Error
            ? error.message
            : "Unable to send the test reminder.",
      );
    } finally {
      setManualSendingReportId(null);
    }
  };

  const generateNextReport = (report: ReportSubmission) => {
    if (!can("reports.edit")) return;
    const generated = createNextReportInstance(report, reports);
    if (!generated) {
      toast("info", "A current next period already exists for this report.");
      return;
    }
    setReports((prev) => [generated, ...prev]);
    toast("success", `Generated next period: ${generated.period || generated.deadline}.`);
  };

  const updateSubmittedDate = async (nextDate?: string) => {
    if (!submittedDateReport || !can("reports.edit")) return;
    const normalizedDate = nextDate || undefined;
    const now = new Date().toISOString();
    const targetSeriesId = submittedDateReport.seriesId || submittedDateReport.id;
    if (!normalizedDate && isReportHistoryRecord(submittedDateReport)) {
      const ok = await confirm(
        `Reactivate "${submittedDateReport.title}" for ${submittedDateReport.period || "this period"}? This clears the submitted date and removes any unsubmitted generated next period for the same recurring report.`,
        { title: "Reactivate Report Period", confirmLabel: "Reactivate" },
      );
      if (!ok) return;
    }
    setReports((prev) => {
      const updatedReport: ReportSubmission = {
        ...submittedDateReport,
        submittedDate: normalizedDate,
        archived: Boolean(normalizedDate),
        updatedAt: now,
      };
      let nextReports = prev.map((report) =>
        report.id === submittedDateReport.id ? updatedReport : report,
      );
      if (!normalizedDate) {
        nextReports = nextReports.filter(
          (report) =>
            !(
              report.id !== submittedDateReport.id &&
              (report.seriesId || report.id) === targetSeriesId &&
              !isReportHistoryRecord(report) &&
              report.generatedFromReportId === submittedDateReport.id
            ),
        );
        return nextReports;
      }
      const generated = createNextReportInstance(updatedReport, nextReports);
      return generated ? [generated, ...nextReports] : nextReports;
    });
    setSubmittedDateReport(null);
    setSubmittedDateValue("");
    toast(
      "success",
      normalizedDate ? "Submitted date updated." : "Submitted date cleared.",
    );
  };

  const exportCsv = () => {
    const rows = reportRows.map((row) => ({
      Project: row.project?.name || "Missing project",
      Report: row.report.title,
      Period: row.report.period,
      Frequency: formatReportFrequency(row.report.frequency),
      FocalPerson: row.focal?.name || "Needs attention",
      FocalEmail: row.focal?.email || "",
      Deadline: row.report.deadline,
      SubmittedDate: row.report.submittedDate || "",
      Status: statusLabel[row.status],
      ReminderLeadDays: row.leadDays,
      RecordType: row.isHistory ? "History" : "Current",
    }));
    const csv = [
      Object.keys(rows[0] || { Project: "" }).join(","),
      ...rows.map((row) =>
        Object.values(row)
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report-monitoring-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderSubmittedCell = (report: ReportSubmission) =>
    can("reports.edit") ? (
      <button
        type="button"
        onClick={() => openSubmittedDateEditor(report)}
        className="inline-flex min-w-[132px] flex-col items-start rounded-xl border border-transparent px-2.5 py-2 text-left text-sm text-zinc-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:text-zinc-300 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
        title="Edit submitted date"
      >
        <span className="font-bold">{formatReportDate(report.submittedDate)}</span>
        <span className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">
          Edit Date
        </span>
      </button>
    ) : (
      <span className="text-sm text-zinc-600 dark:text-zinc-300">
        {formatReportDate(report.submittedDate)}
      </span>
    );

  const renderReportActions = (row: ReportRow) => (
    <div className="flex justify-end gap-1">
      {isSuperAdmin && (
        <button
          onClick={() => sendManualTestReminder(row)}
          disabled={manualSendingReportId === row.report.id}
          className="p-2 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-900"
          title="Send test reminder"
        >
          {manualSendingReportId === row.report.id ? (
            <MailCheck size={15} />
          ) : (
            <Send size={15} />
          )}
        </button>
      )}
      {can("reports.edit") && row.isHistory && !row.hasCurrentNext && (
        <button
          onClick={() => generateNextReport(row.report)}
          className="p-2 rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          title="Generate next period"
        >
          <FilePlus2 size={15} />
        </button>
      )}
      {can("reports.edit") && (
        <button
          onClick={() => openEditReport(row.report)}
          className="p-2 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          title="Edit report"
        >
          <Edit3 size={15} />
        </button>
      )}
      {can("reports.delete") && (
        <button
          onClick={() => deleteReport(row.report)}
          className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          title="Delete report"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );

  const renderReportCards = (rows: ReportRow[]) => (
    <div className="space-y-3">
      {rows.map((row) => (
        <article
          key={row.report.id}
          className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-black leading-tight text-zinc-900 dark:text-white">
                  {row.report.title}
                </h4>
                <Badge variant={statusBadge[row.status]}>{statusLabel[row.status]}</Badge>
                <Badge variant="info">{formatReportFrequency(row.report.frequency)}</Badge>
                {row.isHistory && <Badge variant="default">History</Badge>}
                {row.report.generatedFromReportId && !row.isHistory && (
                  <Badge variant="success">Next generated</Badge>
                )}
              </div>
              <p className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                {row.report.period || "No period"}
              </p>
              {row.report.remarks && (
                <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {row.report.remarks}
                </p>
              )}
            </div>
            {renderReportActions(row)}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Deadline
              </p>
              <p className="mt-1 text-sm font-black text-zinc-900 dark:text-white">
                {formatReportDate(row.report.deadline)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Submitted
              </p>
              <div className="mt-1">{renderSubmittedCell(row.report)}</div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Reminder
              </p>
              <p className="mt-1 text-sm font-black text-zinc-900 dark:text-white">
                {row.leadDays} days before
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {row.lastReminder
                  ? `${row.lastReminder.status}: ${formatReportDate(row.lastReminder.sentAt.slice(0, 10))}`
                  : "Not sent"}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Focal Person
              </p>
              <p className="mt-1 truncate text-sm font-black text-zinc-900 dark:text-white">
                {row.focal?.name || "Needs attention"}
              </p>
              <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                {row.focal?.email || "No email available"}
              </p>
            </div>
          </div>
        </article>
      ))}
      {rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <MailWarning size={30} className="mx-auto mb-3 text-zinc-400" />
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            No reports match this project view.
          </p>
          <p className="mt-1 text-xs text-zinc-500">Add a report schedule or adjust filters.</p>
        </div>
      )}
    </div>
  );

  const renderReportRows = (rows: ReportRow[], options: { showProject: boolean }) => (
    <div className="overflow-x-auto -mx-5 sm:mx-0">
      <table className="w-full min-w-[1080px] text-left">
        <thead>
          <tr className="border-b border-zinc-100 dark:border-zinc-800">
            {[
              ...(options.showProject ? ["Project"] : []),
              "Report",
              "Frequency",
              "Deadline",
              "Submitted",
              "Focal Person",
              "Reminder",
              "Status",
              "",
            ].map((heading) => (
              <th
                key={heading}
                className="pb-4 px-5 sm:px-0 text-[11px] font-bold text-zinc-400 uppercase tracking-wider"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <tr key={row.report.id} className="group">
              {options.showProject && (
                <td className="py-4 px-5 sm:px-0">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">
                    {row.project?.name || "Missing project"}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {row.project?.active === false ? "Inactive" : "Active"}
                  </p>
                </td>
              )}
              <td className="py-4 px-5 sm:px-0">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {row.report.title}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant={row.isHistory ? "default" : "info"}>
                    {row.isHistory ? "History" : "Recurring"}
                  </Badge>
                  {row.report.generatedFromReportId && !row.isHistory && (
                    <Badge variant="success">Next generated</Badge>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500">{row.report.period || "No period"}</p>
                {row.report.remarks && (
                  <p className="text-[11px] text-zinc-500 max-w-[260px] truncate">
                    {row.report.remarks}
                  </p>
                )}
              </td>
              <td className="py-4 px-5 sm:px-0">
                <Badge variant="info">{formatReportFrequency(row.report.frequency)}</Badge>
              </td>
              <td className="py-4 px-5 sm:px-0 text-sm font-bold text-zinc-900 dark:text-white">
                {formatReportDate(row.report.deadline)}
              </td>
              <td className="py-4 px-5 sm:px-0">{renderSubmittedCell(row.report)}</td>
              <td className="py-4 px-5 sm:px-0">
                <p className="text-xs font-bold text-zinc-900 dark:text-white">
                  {row.focal?.name || "Needs attention"}
                </p>
                <p className="text-[11px] text-zinc-500">{row.focal?.email || "No email available"}</p>
              </td>
              <td className="py-4 px-5 sm:px-0">
                <p className="text-xs font-bold text-zinc-900 dark:text-white">
                  {row.leadDays} days before
                </p>
                <p className="text-[11px] text-zinc-500">
                  {row.lastReminder
                    ? `${row.lastReminder.status}: ${formatReportDate(row.lastReminder.sentAt.slice(0, 10))}`
                    : "Not sent"}
                </p>
              </td>
              <td className="py-4 px-5 sm:px-0">
                <Badge variant={statusBadge[row.status]}>{statusLabel[row.status]}</Badge>
              </td>
              <td className="py-4 px-5 sm:px-0">
                <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  {renderReportActions(row)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="py-12 text-center">
          <MailWarning size={30} className="mx-auto text-zinc-400 mb-3" />
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            No reports match the current view.
          </p>
          <p className="text-xs text-zinc-500 mt-1">Adjust filters or add a report schedule.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Report Monitoring
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
            Track project report schedules, focal persons, submissions, deadlines, and reminder readiness.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/settings?tab=reports")}>
            <Settings2 size={14} className="mr-2" /> Settings
          </Button>
          {can("reports.export") && (
            <Button variant="outline" onClick={exportCsv}>
              <Download size={14} className="mr-2" /> Export
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        {[
          { label: "Projects", value: stats.totalProjects, hint: `${stats.activeProjects} active`, icon: FolderKanban },
          { label: "Due Soon", value: stats.dueSoon, hint: `${settings.defaultLeadDays}-day default reminder`, icon: CalendarClock },
          { label: "Overdue", value: stats.overdue, hint: "Past deadline", icon: AlertTriangle },
          { label: "Submitted", value: stats.submittedThisMonth, hint: "This month", icon: CheckCircle2 },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-zinc-200/90 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {card.label}
              </p>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
                <card.icon size={14} />
              </div>
            </div>
            <p className="mt-2 text-xl font-extrabold text-zinc-900 dark:text-white">
              {card.value.toLocaleString()}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-zinc-500 dark:text-zinc-400">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl w-fit overflow-x-auto">
          {[
            { id: "projects", label: "Projects", icon: FolderKanban },
            { id: "all", label: "All Reports", icon: ClipboardCheck },
            { id: "due-soon", label: "Due Soon", icon: Bell },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ViewTab)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-white shadow-sm" : "text-zinc-500"}`}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {activeTab === "all" && (
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl w-fit">
              {[
                { id: "current", label: "Current" },
                { id: "history", label: "History" },
                { id: "all", label: "All" },
              ].map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => setRecordScope(scope.id as RecordScope)}
                  className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${recordScope === scope.id ? "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-white shadow-sm" : "text-zinc-500"}`}
                >
                  {scope.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeTab === "projects" ? (
        <Card
          title="Project Board"
          description="Select a project or activity to review report deadlines, due dates, submissions, and reminder readiness instantly"
          action={can("reports.edit") && <Button variant="blue" onClick={openNewProject}><Plus size={14} className="mr-2" /> New Activity/Project</Button>}
        >
          {projectGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
              <FolderKanban size={30} className="mx-auto text-zinc-400 mb-3" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">No project groups match this view.</p>
              <p className="text-xs text-zinc-500 mt-1">Adjust filters or create a project and report schedule.</p>
              {can("reports.edit") && (
                <Button variant="blue" onClick={openNewProject} className="mt-4">
                  <Plus size={14} className="mr-2" /> New Activity/Project
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      list="report-project-search-list"
                      value={projectSearchQuery}
                      onChange={(event) => {
                        const value = event.target.value;
                        setProjectSearchQuery(value);
                        const match = projectGroups.find(
                          (group) =>
                            group?.project.name.toLowerCase() === value.trim().toLowerCase(),
                        );
                        if (match) {
                          setSelectedProjectId(match.project.id);
                        }
                      }}
                      placeholder="Search activities or projects..."
                      className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-blue-500/40"
                    />
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-700 dark:text-zinc-300"
                    />
                    <datalist id="report-project-search-list">
                      {projectGroups.map((group) =>
                        group ? <option key={group.project.id} value={group.project.name} /> : null,
                      )}
                    </datalist>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                    {filteredProjectGroups.length.toLocaleString()} of {projectGroups.length.toLocaleString()} shown
                  </p>
                </div>

                <div className="space-y-3 xl:max-h-[calc(100vh-430px)] xl:overflow-y-auto xl:pr-1">
                {filteredProjectGroups.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
                    <FolderKanban size={26} className="mx-auto mb-3 text-zinc-400" />
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">
                      No activity or project found.
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Try a project name, focal name, or focal email.
                    </p>
                  </div>
                ) : filteredProjectGroups.map((group) => {
                  if (!group) return null;
                  const { project, focal, counts } = group;
                  const selected = selectedProjectGroup?.project.id === project.id;
                  const health =
                    !project.active ? "gray" : counts.overdue > 0 ? "red" : counts.dueSoon > 0 ? "amber" : "green";
                  const healthClasses: Record<string, string> = {
                    green: "bg-emerald-500",
                    amber: "bg-amber-500",
                    red: "bg-red-500",
                    gray: "bg-zinc-400",
                  };
                  const counterPills = [
                    {
                      label: "Reports",
                      value: counts.total,
                      className:
                        "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
                    },
                    {
                      label: "Due Soon",
                      value: counts.dueSoon,
                      className:
                        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
                    },
                    {
                      label: "Overdue",
                      value: counts.overdue,
                      className:
                        "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
                    },
                    {
                      label: "Submitted",
                      value: counts.submitted,
                      className:
                        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
                    },
                  ];

                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition-all ${
                        selected
                          ? "border-blue-300 bg-blue-50/70 shadow-sm ring-2 ring-blue-500/10 dark:border-blue-500/40 dark:bg-blue-500/10"
                          : "border-zinc-200 bg-white hover:border-blue-200 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-500/30 dark:hover:bg-zinc-900/60"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap gap-1">
                        {counterPills.map((counter) => (
                          <span
                            key={counter.label}
                            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${counter.className}`}
                          >
                            <span>{counter.label}</span>
                            <span>{counter.value.toLocaleString()}</span>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${healthClasses[health]}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 text-sm font-black leading-snug text-zinc-900 dark:text-white">
                              {project.name}
                            </h3>
                            <Badge variant={project.active ? "success" : "default"}>
                              {project.active ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="info">{formatReportFrequency(project.defaultFrequency)}</Badge>
                            {group.hasAttention && <Badge variant="warning">Attention Required</Badge>}
                          </div>
                          <div className="mt-3 grid gap-2 text-xs">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                Focal Name
                              </p>
                              <p className="truncate font-bold text-zinc-800 dark:text-zinc-100">
                                {focal?.name || "Focal user missing"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                Email
                              </p>
                              <p className="truncate font-medium text-zinc-500 dark:text-zinc-400">
                                {focal?.email || "No email available"}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                  Next Deadline
                                </p>
                                <p className="font-bold text-zinc-800 dark:text-zinc-100">
                                  {formatReportDate(group.nextDeadline)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                  Lead Days
                                </p>
                                <p className="font-bold text-zinc-800 dark:text-zinc-100">
                                  {project.reminderLeadDays ?? settings.defaultLeadDays} days
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>

              {selectedProjectGroup ? (
                <section className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <div className="flex flex-col gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-black leading-tight text-zinc-900 dark:text-white">
                          {selectedProjectGroup.project.name}
                        </h3>
                        <Badge variant={selectedProjectGroup.project.active ? "success" : "default"}>
                          {selectedProjectGroup.project.active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="info">
                          {formatReportFrequency(selectedProjectGroup.project.defaultFrequency)}
                        </Badge>
                        {selectedProjectGroup.hasAttention && (
                          <Badge variant="warning">Attention Required</Badge>
                        )}
                      </div>
                      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            Focal Name
                          </p>
                          <p className="font-bold text-zinc-900 dark:text-white">
                            {selectedProjectGroup.focal?.name || "Focal user missing"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            Email
                          </p>
                          <p className="truncate font-medium text-zinc-600 dark:text-zinc-300">
                            {selectedProjectGroup.focal?.email || "No email available"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            Next Deadline
                          </p>
                          <p className="font-bold text-zinc-900 dark:text-white">
                            {formatReportDate(selectedProjectGroup.nextDeadline)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            Lead Days
                          </p>
                          <p className="font-bold text-zinc-900 dark:text-white">
                            {selectedProjectGroup.project.reminderLeadDays ?? settings.defaultLeadDays} days
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {can("reports.edit") && (
                        <>
                          <Button variant="blue" onClick={() => openNewReportForProject(selectedProjectGroup.project)}>
                            <Plus size={14} className="mr-2" /> Add Report to Project
                          </Button>
                          <Button variant="outline" onClick={() => openEditProject(selectedProjectGroup.project)}>
                            <Edit3 size={14} className="mr-2" /> Edit Project
                          </Button>
                        </>
                      )}
                      {can("reports.delete") && (
                        <Button variant="outline" onClick={() => deleteProject(selectedProjectGroup.project)}>
                          <Trash2 size={14} className="mr-2" /> Delete Project
                        </Button>
                      )}
                    </div>
                  </div>

                  {selectedProjectGroup.project.notes && (
                    <p className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                      {selectedProjectGroup.project.notes}
                    </p>
                  )}

                  <div className="mt-4 space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                        {[
                          {
                            id: "active" as ProjectReportView,
                            label: "Active",
                            count: selectedProjectGroup.currentRows.length,
                          },
                          {
                            id: "history" as ProjectReportView,
                            label: "History",
                            count: selectedProjectGroup.historyRows.length,
                          },
                        ]
                          .filter((option) => activeTab !== "due-soon" || option.id === "active")
                          .map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setProjectReportView(option.id)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                projectReportView === option.id
                                  ? "border-blue-300 bg-blue-50 text-blue-700 ring-2 ring-blue-500/10 dark:border-sky-400/70 dark:bg-sky-400/20 dark:text-sky-100 dark:ring-sky-400/15"
                                  : "border-transparent text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                              }`}
                            >
                              <span>{option.label}</span>
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${
                                  projectReportView === option.id
                                    ? "bg-blue-600 text-white dark:bg-sky-300 dark:text-slate-950"
                                    : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                }`}
                              >
                                {option.count.toLocaleString()}
                              </span>
                            </button>
                          ))}
                      </div>
                      <div className="relative w-full lg:w-80">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                          value={projectReportQuery}
                          onChange={(event) => setProjectReportQuery(event.target.value)}
                          placeholder="Search this project reports..."
                          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950"
                        />
                      </div>
                    </div>

                    {renderReportCards(visibleProjectRows)}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </Card>
      ) : (
        <Card
          title={activeTab === "due-soon" ? "Due Soon Reports" : "All Report Schedules"}
          description={
            activeTab === "due-soon"
              ? "Current reports approaching deadline or already overdue, sorted by nearest deadline"
              : "Submission dates, deadlines, reminder windows, and focal person readiness"
          }
          action={
            activeTab === "all" &&
            can("reports.edit") && (
              <Button variant="blue" onClick={openNewReport} disabled={visibleProjects.length === 0}>
                <Plus size={14} className="mr-2" /> Add Report
              </Button>
            )
          }
        >
          {renderReportRows(reportRows, { showProject: true })}
        </Card>
      )}

      <Modal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        title={projectForm.id ? "Edit Activity/Project" : "New Activity/Project"}
        footer={<><Button variant="ghost" onClick={() => setIsProjectModalOpen(false)}>Cancel</Button><Button variant="blue" onClick={saveProject}>Save Activity/Project</Button></>}
      >
        <div className="space-y-4">
          <Input label="Activity/Project Name" value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Focal Person</label>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-100">
                {usersById.get(projectForm.focalUserId)?.name || currentUser?.name || "Your account"}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Default Frequency</label>
              <select value={projectForm.defaultFrequency} onChange={(event) => setProjectForm({ ...projectForm, defaultFrequency: event.target.value as ReportFrequency })} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none">
                {REPORT_FREQUENCY_OPTIONS.map((frequency) => <option key={frequency} value={frequency}>{formatReportFrequency(frequency)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Reminder Override Days" type="number" min={0} placeholder={`${settings.defaultLeadDays} default`} value={projectForm.reminderLeadDays} onChange={(event) => setProjectForm({ ...projectForm, reminderLeadDays: event.target.value })} />
            <label className="flex items-center gap-3 mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 cursor-pointer">
              <input type="checkbox" checked={projectForm.active} onChange={(event) => setProjectForm({ ...projectForm, active: event.target.checked })} className="w-4 h-4 rounded text-blue-600" />
              <span className="text-sm font-bold text-zinc-900 dark:text-white">Active project</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Notes</label>
            <textarea value={projectForm.notes} onChange={(event) => setProjectForm({ ...projectForm, notes: event.target.value })} rows={3} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        title={reportForm.id ? "Edit Report Schedule" : "New Report Schedule"}
        footer={
          <>
            {isSuperAdmin && reportForm.id && (
              <Button
                variant="outline"
                onClick={() => {
                  const row = allReportRows.find((entry) => entry.report.id === reportForm.id);
                  if (row) void sendManualTestReminder(row);
                }}
                disabled={manualSendingReportId === reportForm.id}
                className="mr-auto"
              >
                <Send size={14} className="mr-2" /> Send Test Reminder
              </Button>
            )}
            <Button variant="ghost" onClick={() => setIsReportModalOpen(false)}>Cancel</Button>
            <Button variant="blue" onClick={saveReport}>Save Report</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Project</label>
            <select value={reportForm.projectId} onChange={(event) => {
              const project = projectsById.get(event.target.value);
              setReportForm({ ...reportForm, projectId: event.target.value, frequency: project?.defaultFrequency || reportForm.frequency });
            }} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none">
              <option value="">Select project</option>
              {visibleProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <Input label="Report Title" value={reportForm.title} onChange={(event) => setReportForm({ ...reportForm, title: event.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Report Period" placeholder="e.g. January 2026, Q1 2026" value={reportForm.period} onChange={(event) => setReportForm({ ...reportForm, period: event.target.value })} />
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Frequency</label>
              <select value={reportForm.frequency} onChange={(event) => setReportForm({ ...reportForm, frequency: event.target.value as ReportFrequency })} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none">
                {REPORT_FREQUENCY_OPTIONS.map((frequency) => <option key={frequency} value={frequency}>{formatReportFrequency(frequency)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Deadline" type="date" value={reportForm.deadline} onChange={(event) => setReportForm({ ...reportForm, deadline: event.target.value })} />
            <Input label="Submitted Date" type="date" value={reportForm.submittedDate} onChange={(event) => setReportForm({ ...reportForm, submittedDate: event.target.value })} />
            <Input label="Reminder Override" type="number" min={0} placeholder={`${settings.defaultLeadDays} default`} value={reportForm.reminderLeadDays} onChange={(event) => setReportForm({ ...reportForm, reminderLeadDays: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Remarks</label>
            <textarea value={reportForm.remarks} onChange={(event) => setReportForm({ ...reportForm, remarks: event.target.value })} rows={3} className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(submittedDateReport)}
        onClose={() => {
          setSubmittedDateReport(null);
          setSubmittedDateValue("");
        }}
        title="Edit Submitted Date"
        maxWidth="max-w-sm"
        footer={
          <>
            {submittedDateReport?.submittedDate && (
              <Button
                variant="ghost"
                onClick={() => updateSubmittedDate(undefined)}
                className="mr-auto text-red-600 hover:text-red-700 dark:text-red-400"
              >
                Clear Date
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setSubmittedDateReport(null);
                setSubmittedDateValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="blue"
              onClick={() => updateSubmittedDate(submittedDateValue)}
              disabled={!submittedDateValue}
            >
              Save Date
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
              Report
            </p>
            <p className="mt-1 text-sm font-black text-zinc-900 dark:text-white">
              {submittedDateReport?.title || "Report schedule"}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Deadline: {formatReportDate(submittedDateReport?.deadline)}
            </p>
          </div>
          <Input
            label="Submitted Date"
            type="date"
            value={submittedDateValue}
            onChange={(event) => setSubmittedDateValue(event.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
};
