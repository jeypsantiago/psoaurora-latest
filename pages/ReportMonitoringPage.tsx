import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Range } from "xlsx-js-style";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit3,
  FileSpreadsheet,
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
import { Badge, Button, Input, Modal } from "../components/ui";
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
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");
  const [deadlineFilter, setDeadlineFilter] = useState<
    "all" | "due-soon" | "overdue" | "submitted" | "no-submission"
  >("all");
  const [focalFilter, setFocalFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
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
  const canExportSummaryExcel = Boolean(currentUserId);
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

  const focalFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    return allReportRows
      .map((row) => row.focal)
      .filter((focal): focal is User => {
        if (!focal?.id || seen.has(focal.id)) return false;
        seen.add(focal.id);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allReportRows]);

  const applyReportFilters = (rows: ReportRow[], includeProjectFilter: boolean) => {
    const search = projectReportQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (focalFilter !== "all" && row.focal?.id !== focalFilter) return false;
      if (includeProjectFilter && projectFilter !== "all" && row.project?.id !== projectFilter) {
        return false;
      }
      if (deadlineFilter === "due-soon" && row.status !== "due-soon") return false;
      if (deadlineFilter === "overdue" && row.status !== "overdue") return false;
      if (deadlineFilter === "submitted" && !row.report.submittedDate) return false;
      if (deadlineFilter === "no-submission" && row.report.submittedDate) return false;
      if (!search) return true;

      return [
        row.project?.name,
        row.project?.notes,
        row.report.title,
        row.report.period,
        row.report.remarks,
        row.focal?.name,
        row.focal?.email,
        row.focal?.position,
        formatReportFrequency(row.report.frequency),
        statusLabel[row.status],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  };

  const filteredVisibleProjectRows = applyReportFilters(visibleProjectRows, false);
  const filteredReportRows = applyReportFilters(reportRows, true);
  const rightPanelRows = activeTab === "projects" ? filteredVisibleProjectRows : filteredReportRows;
  const summaryExportRows =
    activeTab === "projects"
      ? filteredProjectGroups.flatMap((group) => {
          if (!group) return [];
          const rows = projectReportView === "history" ? group.historyRows : group.currentRows;
          return applyReportFilters(rows, false);
        })
      : rightPanelRows;
  const rightPanelTitle =
    activeTab === "projects"
      ? selectedProjectGroup?.project.name || "Project Reports"
      : activeTab === "due-soon"
        ? "Due Soon Reports"
        : "All Report Schedules";

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
    const rows = filteredReportRows.map((row) => ({
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

  const exportSummaryExcel = async () => {
    const rows = summaryExportRows;
    if (rows.length === 0) {
      toast("warning", "No report rows to export.");
      return;
    }

    const XLSXStyle = await import("xlsx-js-style");
    const XLSX =
      (XLSXStyle as unknown as { default?: typeof XLSXStyle }).default || XLSXStyle;

    const groupedRows = new Map<string, { projectName: string; rows: ReportRow[] }>();
    for (const row of rows) {
      const projectKey = row.project?.id || row.report.projectId || "missing-project";
      const projectName = row.project?.name || "Missing project";
      const group = groupedRows.get(projectKey);
      if (group) {
        group.rows.push(row);
      } else {
        groupedRows.set(projectKey, { projectName, rows: [row] });
      }
    }

    const headerRowCount = 3;
    const generatedDate = new Date().toLocaleDateString("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const sheetRows: Array<Array<string>> = [
      ["REPORT MONITORING SUMMARY"],
      [`Generated on ${generatedDate}`],
      [],
    ];
    const merges: Range[] = [];

    for (const group of groupedRows.values()) {
      const titleRowIndex = sheetRows.length;
      const titleRow = ["Project/Activity"];
      const labelRow = [group.projectName];
      const valueRow = [""];

      group.rows.forEach((row, index) => {
        const startColumn = 1 + index * 2;
        titleRow[startColumn] = row.report.title;
        titleRow[startColumn + 1] = "";
        labelRow[startColumn] = "Deadline";
        labelRow[startColumn + 1] = "Date Submitted";
        valueRow[startColumn] = formatReportDate(row.report.deadline);
        valueRow[startColumn + 1] = row.report.submittedDate
          ? formatReportDate(row.report.submittedDate)
          : "Not submitted";
        merges.push({
          s: { r: titleRowIndex, c: startColumn },
          e: { r: titleRowIndex, c: startColumn + 1 },
        });
      });

      sheetRows.push(titleRow, labelRow, valueRow, []);
    }

    const maxColumnCount = Math.max(1, ...sheetRows.map((row) => row.length));
    sheetRows[0] = [
      sheetRows[0][0],
      ...Array.from({ length: maxColumnCount - 1 }, () => ""),
    ];
    sheetRows[1] = [
      sheetRows[1][0],
      ...Array.from({ length: maxColumnCount - 1 }, () => ""),
    ];
    merges.unshift(
      {
        s: { r: 0, c: 0 },
        e: { r: 0, c: maxColumnCount - 1 },
      },
      {
        s: { r: 1, c: 0 },
        e: { r: 1, c: maxColumnCount - 1 },
      },
    );

    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    worksheet["!merges"] = merges;
    worksheet["!cols"] = [
      { wch: 24 },
      ...Array.from({ length: maxColumnCount - 1 }, () => ({
        wch: 18,
      })),
    ];
    worksheet["!rows"] = sheetRows.map((_, index) => {
      if (index === 0) return { hpt: 30 };
      if (index === 1) return { hpt: 21 };
      if (index === 2) return { hpt: 8 };
      const blockRow = (index - headerRowCount) % 4;
      return { hpt: blockRow === 3 ? 8 : blockRow === 0 ? 24 : 21 };
    });

    const tableBorder = {
      top: { style: "thin", color: { rgb: "D6DEE8" } },
      right: { style: "thin", color: { rgb: "D6DEE8" } },
      bottom: { style: "thin", color: { rgb: "D6DEE8" } },
      left: { style: "thin", color: { rgb: "D6DEE8" } },
    };
    const baseCellStyle = {
      alignment: {
        horizontal: "center",
        vertical: "center",
        wrapText: true,
      },
      border: tableBorder,
      font: {
        name: "Calibri",
        sz: 11,
        color: { rgb: "111827" },
      },
    };

    sheetRows.forEach((row, rowIndex) => {
      if (rowIndex < 2) {
        for (let columnIndex = 0; columnIndex < maxColumnCount; columnIndex += 1) {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = worksheet[cellAddress] || { t: "s", v: "" };
          const isTitle = rowIndex === 0;

          cell.s = {
            alignment: {
              horizontal: "center",
              vertical: "center",
              wrapText: true,
            },
            border: tableBorder,
            font: {
              name: "Calibri",
              sz: isTitle ? 16 : 11,
              bold: isTitle,
              italic: !isTitle,
              color: { rgb: isTitle ? "1E3A8A" : "475569" },
            },
            fill: {
              patternType: "solid",
              fgColor: { rgb: isTitle ? "EAF2FF" : "F8FAFC" },
            },
          };
          worksheet[cellAddress] = cell;
        }
        return;
      }
      if (rowIndex === 2) return;

      const blockRow = (rowIndex - headerRowCount) % 4;
      if (blockRow === 3) return;

      row.forEach((_value, columnIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
        const cell = worksheet[cellAddress] || { t: "s", v: "" };
        const isProjectColumn = columnIndex === 0;
        const isTitleRow = blockRow === 0;
        const isLabelRow = blockRow === 1;
        const isValueRow = blockRow === 2;

        cell.s = {
          ...baseCellStyle,
          font: {
            ...baseCellStyle.font,
            bold: isTitleRow || isLabelRow || isProjectColumn,
            color: {
              rgb: isTitleRow
                ? "1E3A8A"
                : isValueRow && cell.v === "Not submitted"
                  ? "991B1B"
                  : "111827",
            },
          },
          fill: {
            patternType: "solid",
            fgColor: {
              rgb: isTitleRow
                ? isProjectColumn
                  ? "DCEBFF"
                  : "EAF2FF"
                : isLabelRow
                  ? isProjectColumn
                    ? "F1F7FF"
                    : "F8FBFF"
                  : isProjectColumn
                    ? "F8FAFC"
                    : cell.v === "Not submitted"
                      ? "FEE2E2"
                      : "FFFFFF",
            },
          },
        };
        worksheet[cellAddress] = cell;
      });
    });

    for (const merge of merges) {
      const cellAddress = XLSX.utils.encode_cell(merge.s);
      const cell = worksheet[cellAddress];
      if (cell && typeof cell === "object") {
        cell.s = {
          ...cell.s,
          alignment: {
            horizontal: "center",
            vertical: "center",
            wrapText: true,
          },
        };
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Summary");
    XLSX.writeFile(
      workbook,
      `report-monitoring-summary-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const renderSubmittedCell = (report: ReportSubmission) =>
    can("reports.edit") ? (
      <button
        type="button"
        onClick={() => openSubmittedDateEditor(report)}
        className="inline-flex w-full min-w-0 items-center truncate rounded-md border border-transparent px-1.5 py-1 text-left text-xs font-semibold text-zinc-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:text-zinc-300 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
        title="Edit submitted date"
      >
        {formatReportDate(report.submittedDate)}
      </button>
    ) : (
      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        {formatReportDate(report.submittedDate)}
      </span>
    );

  const renderReportStatus = (status: ReportStatus) => {
    const classes: Record<ReportStatus, string> = {
      submitted:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
      pending:
        "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
      "due-soon":
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
      overdue:
        "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
    };
    return (
      <span
        className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${classes[status]}`}
      >
        {statusLabel[status]}
      </span>
    );
  };

  const getReminderBadge = (row: ReportRow) => {
    if (!settings.enabled) {
      return {
        label: "Disabled",
        className:
          "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
      };
    }
    if (row.lastReminder?.status === "sent" || row.lastReminder?.status === "manual-test") {
      return {
        label: "Sent",
        className:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
      };
    }
    if (!row.focal?.email || row.lastReminder?.status === "failed") {
      return {
        label: "Not Ready",
        className:
          "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
      };
    }
    if (row.status === "due-soon" || row.status === "overdue") {
      return {
        label: "Ready",
        className:
          "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
      };
    }
    return {
      label: "Not Ready",
      className:
        "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
    };
  };

  const renderReportActions = (row: ReportRow) => (
    <div className="flex flex-wrap justify-end gap-0.5">
      {isSuperAdmin && (
        <button
          onClick={() => sendManualTestReminder(row)}
          disabled={manualSendingReportId === row.report.id}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-50 hover:text-blue-600 disabled:opacity-50 dark:hover:bg-zinc-900"
          title="Send test reminder"
        >
          {manualSendingReportId === row.report.id ? (
            <MailCheck size={14} />
          ) : (
            <Send size={14} />
          )}
        </button>
      )}
      {can("reports.edit") && row.isHistory && !row.hasCurrentNext && (
        <button
          onClick={() => generateNextReport(row.report)}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-50 hover:text-emerald-600 dark:hover:bg-zinc-900"
          title="Generate next period"
        >
          <FilePlus2 size={14} />
        </button>
      )}
      {can("reports.edit") && (
        <button
          onClick={() => openEditReport(row.report)}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-50 hover:text-blue-600 dark:hover:bg-zinc-900"
          title="Edit report"
        >
          <Edit3 size={14} />
        </button>
      )}
      {can("reports.delete") && (
        <button
          onClick={() => deleteReport(row.report)}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-50 hover:text-red-500 dark:hover:bg-zinc-900"
          title="Delete report"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );

  const renderReportRows = (rows: ReportRow[], options: { showProject: boolean }) => (
    <div className="max-h-[calc(100vh-330px)] min-h-[320px] overflow-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <table className="w-full table-fixed border-collapse text-left">
        <colgroup>
          {options.showProject && <col className="w-[12%]" />}
          <col className={options.showProject ? "w-[15%]" : "w-[16%]"} />
          <col className={options.showProject ? "w-[5%]" : "w-[6%]"} />
          <col className={options.showProject ? "w-[8%]" : "w-[9%]"} />
          <col className={options.showProject ? "w-[8%]" : "w-[9%]"} />
          <col className={options.showProject ? "w-[14%]" : "w-[15%]"} />
          <col className={options.showProject ? "w-[10%]" : "w-[10%]"} />
          <col className={options.showProject ? "w-[7%]" : "w-[7%]"} />
          <col className={options.showProject ? "w-[6%]" : "w-[6%]"} />
          <col className={options.showProject ? "w-[9%]" : "w-[14%]"} />
          <col className={options.showProject ? "w-[6%]" : "w-[8%]"} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-900">
          <tr>
            {[
              ...(options.showProject ? ["Project"] : []),
              "Report / Period",
              "Freq.",
              "Deadline",
              "Submitted",
              "Focal / Office",
              "Reminder Window",
              "Reminder Status",
              "Status",
              "Remarks",
              "Actions",
            ].map((heading) => (
              <th
                key={heading}
                className="border-b border-r border-zinc-200 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-600 last:border-r-0 dark:border-zinc-800 dark:text-zinc-400"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const reminderBadge = getReminderBadge(row);
            return (
            <tr
              key={row.report.id}
              className={`group border-b border-zinc-100 last:border-b-0 dark:border-zinc-800 ${
                row.status === "overdue"
                  ? "bg-red-50/40 dark:bg-red-500/5"
                  : row.status === "due-soon"
                    ? "bg-amber-50/40 dark:bg-amber-500/5"
                    : "hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
              }`}
            >
              {options.showProject && (
                <td className="max-w-[210px] border-r border-zinc-100 px-3 py-2 align-top dark:border-zinc-800">
                  <p className="truncate text-xs font-bold text-zinc-900 dark:text-white">
                    {row.project?.name || "Missing project"}
                  </p>
                  <p className="text-[10px] font-medium text-zinc-500">
                    {row.project?.active === false ? "Inactive" : "Active"}
                  </p>
                </td>
              )}
              <td className="border-r border-zinc-100 px-3 py-2 align-top dark:border-zinc-800">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <p className="min-w-0 max-w-full truncate text-xs font-bold text-zinc-800 dark:text-zinc-100">
                    {row.report.title}
                  </p>
                  <span className="inline-flex max-w-[120px] items-center truncate rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {row.report.period || "No period"}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Badge variant={row.isHistory ? "default" : "info"} className="!px-1.5 !text-[9px]">
                    {row.isHistory ? "History" : "Recurring"}
                  </Badge>
                  {row.report.generatedFromReportId && !row.isHistory && (
                    <Badge variant="success" className="!px-1.5 !text-[9px]">Next generated</Badge>
                  )}
                </div>
              </td>
              <td className="border-r border-zinc-100 px-3 py-2 align-top dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {formatReportFrequency(row.report.frequency)}
                </span>
              </td>
              <td className="border-r border-zinc-100 px-3 py-2 align-top dark:border-zinc-800">
                <span className={`text-xs font-bold ${row.status === "overdue" ? "text-red-700 dark:text-red-300" : row.status === "due-soon" ? "text-amber-700 dark:text-amber-300" : "text-zinc-900 dark:text-white"}`}>
                  {formatReportDate(row.report.deadline)}
                </span>
              </td>
              <td className="border-r border-zinc-100 px-3 py-1.5 align-top dark:border-zinc-800">{renderSubmittedCell(row.report)}</td>
              <td className="max-w-[210px] border-r border-zinc-100 px-3 py-2 align-top dark:border-zinc-800">
                <p className="truncate text-xs font-bold text-zinc-900 dark:text-white">
                  {row.focal?.name || "Needs attention"}
                </p>
                <p className="truncate text-[10px] text-zinc-500">{row.focal?.position || row.focal?.email || "No office/unit recorded"}</p>
              </td>
              <td className="border-r border-zinc-100 px-3 py-2 align-top dark:border-zinc-800">
                <p className="text-xs font-bold text-zinc-900 dark:text-white">
                  {row.leadDays} days before
                </p>
                <p className="text-[11px] text-zinc-500">
                  {row.lastReminder
                    ? `${row.lastReminder.status}: ${formatReportDate(row.lastReminder.sentAt.slice(0, 10))}`
                    : "Not sent"}
                </p>
              </td>
              <td className="border-r border-zinc-100 px-2 py-2 text-center align-top dark:border-zinc-800">
                <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${reminderBadge.className}`}>
                  {reminderBadge.label}
                </span>
              </td>
              <td className="border-r border-zinc-100 px-2 py-2 text-center align-top dark:border-zinc-800">
                {renderReportStatus(row.status)}
              </td>
              <td className="max-w-[220px] border-r border-zinc-100 px-3 py-2 align-top dark:border-zinc-800">
                <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                  {row.report.remarks || "-"}
                </p>
              </td>
              <td className="px-1.5 py-1.5 align-top">
                <div className="flex justify-center gap-0.5">
                  {renderReportActions(row)}
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="py-10 text-center">
          <MailWarning size={30} className="mx-auto text-zinc-400 mb-3" />
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            No reports match the current view.
          </p>
          <p className="text-xs text-zinc-500 mt-1">Adjust filters or add a report schedule.</p>
        </div>
      )}
    </div>
  );

  const modalShellClass =
    "!max-h-[85vh] !rounded-[20px] border border-zinc-200 shadow-2xl dark:border-zinc-800";
  const modalHeaderClass =
    "!items-start !px-5 !py-4 !border-zinc-200 dark:!border-zinc-800";
  const modalTitleClass =
    "!normal-case !tracking-normal !leading-tight";
  const modalBodyClass = "!p-5";
  const modalFooterClass =
    "!px-5 !py-4 !border-zinc-200 !bg-zinc-50/80 dark:!border-zinc-800 dark:!bg-zinc-900/30";
  const modalCloseClass = "!rounded-lg !p-2";
  const fieldClass =
    "!h-10 !rounded-lg !border-zinc-300 !bg-white !px-3 !py-2 !text-[13px] dark:!border-zinc-700 dark:!bg-zinc-950";
  const selectClass =
    "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[13px] font-medium text-zinc-900 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
  const textareaClass =
    "min-h-[88px] w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[13px] text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
  const fieldLabelClass =
    "ml-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400";
  const sectionTitleClass =
    "text-[11px] font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300";
  const projectModalTitle = projectForm.id ? "Edit Activity/Project" : "New Activity/Project";
  const projectModalSubtitle = projectForm.id
    ? "Update project details, focal person, frequency, reminder settings, and activity status."
    : "Create a project or activity to attach report schedules and monitor deadlines.";
  const projectReminderSummary = projectForm.reminderLeadDays.trim()
    ? `${projectForm.reminderLeadDays.trim()} days`
    : `${settings.defaultLeadDays} days default`;
  const reportModalTitle = reportForm.id ? "Edit Report Schedule" : "New Report Schedule";
  const reportModalSubtitle =
    "Add a report requirement, deadline, submission status, and reminder settings.";

  return (
    <div className="-mt-3 space-y-2 pb-4 sm:-mt-5">
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-zinc-900 dark:text-white">
              Report Monitoring
            </h1>
            <p className="mt-0.5 max-w-3xl text-[13px] text-zinc-600 dark:text-zinc-400">
              Track project report schedules, focal persons, submissions, deadlines, and reminder readiness.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                {
                  label: "Projects",
                  value: `${stats.totalProjects.toLocaleString()} total`,
                  hint: `${stats.activeProjects.toLocaleString()} active`,
                  icon: FolderKanban,
                  chipClass:
                    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300",
                  iconClass: "text-blue-600 dark:text-blue-300",
                },
                {
                  label: "Due Soon",
                  value: stats.dueSoon.toLocaleString(),
                  hint: `${settings.defaultLeadDays}-day window`,
                  icon: CalendarClock,
                  chipClass:
                    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300",
                  iconClass: "text-amber-600 dark:text-amber-300",
                },
                {
                  label: "Overdue",
                  value: stats.overdue.toLocaleString(),
                  hint: "Past deadline",
                  icon: AlertTriangle,
                  chipClass:
                    "border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300",
                  iconClass: "text-red-600 dark:text-red-300",
                },
                {
                  label: "Submitted",
                  value: stats.submittedThisMonth.toLocaleString(),
                  hint: "This month",
                  icon: CheckCircle2,
                  chipClass:
                    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300",
                  iconClass: "text-emerald-600 dark:text-emerald-300",
                },
              ].map((chip) => (
                <div
                  key={chip.label}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] ${chip.chipClass}`}
                >
                  <chip.icon size={13} className={chip.iconClass} />
                  <span className="font-bold">{chip.label}:</span>
                  <span className="font-semibold">{chip.value}</span>
                  <span className="opacity-75">{chip.hint}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:pt-1">
            <Button variant="outline" onClick={() => navigate("/settings?tab=reports")} className="!rounded-lg !px-3 !py-1.5 !text-xs">
              <Settings2 size={14} className="mr-2" /> Settings
            </Button>
            {canExportSummaryExcel && (
              <Button variant="outline" onClick={exportSummaryExcel} className="!rounded-lg !px-3 !py-1.5 !text-xs">
                <FileSpreadsheet size={14} className="mr-2" /> Summary Excel
              </Button>
            )}
            {can("reports.export") && (
              <Button variant="outline" onClick={exportCsv} className="!rounded-lg !px-3 !py-1.5 !text-xs">
                <Download size={14} className="mr-2" /> Export
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex w-fit items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
            {[
              { id: "projects", label: "Projects", icon: FolderKanban },
              { id: "all", label: "All Reports", icon: ClipboardCheck },
              { id: "due-soon", label: "Due Soon", icon: Bell },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ViewTab)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  activeTab === tab.id
                    ? "bg-white text-blue-700 shadow-sm dark:bg-zinc-800 dark:text-blue-300"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <tab.icon size={13} /> {tab.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative xl:min-w-[260px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={projectReportQuery}
                onChange={(event) => setProjectReportQuery(event.target.value)}
                placeholder="Search report..."
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-xs font-medium outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ReportStatus | "all")}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold outline-none focus:border-blue-300 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="all">All statuses</option>
              <option value="submitted">Submitted</option>
              <option value="pending">Pending</option>
              <option value="due-soon">Due Soon</option>
              <option value="overdue">Overdue</option>
            </select>
            <select
              value={deadlineFilter}
              onChange={(event) => setDeadlineFilter(event.target.value as typeof deadlineFilter)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold outline-none focus:border-blue-300 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="all">All due dates</option>
              <option value="due-soon">Due soon</option>
              <option value="overdue">Overdue</option>
              <option value="submitted">Submitted</option>
              <option value="no-submission">No submission</option>
            </select>
            <select
              value={focalFilter}
              onChange={(event) => setFocalFilter(event.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold outline-none focus:border-blue-300 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="all">All focal persons</option>
              {focalFilterOptions.map((focal) => (
                <option key={focal.id} value={focal.id}>
                  {focal.name}
                </option>
              ))}
            </select>
            <select
              value={projectFilter}
              onChange={(event) => {
                const value = event.target.value;
                setProjectFilter(value);
                if (value !== "all") setSelectedProjectId(value);
              }}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold outline-none focus:border-blue-300 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="all">All projects</option>
              {visibleProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeTab === "all" && (
          <div className="mt-2 flex w-fit items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
            {[
              { id: "current", label: "Current" },
              { id: "history", label: "History" },
              { id: "all", label: "All Records" },
            ].map((scope) => (
              <button
                key={scope.id}
                type="button"
                onClick={() => setRecordScope(scope.id as RecordScope)}
                className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                  recordScope === scope.id
                    ? "bg-white text-blue-700 shadow-sm dark:bg-zinc-800 dark:text-blue-300"
                    : "text-zinc-500"
                }`}
              >
                {scope.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white">
                  Projects / Activities
                </h2>
                <p className="text-[11px] font-medium text-zinc-500">
                  {filteredProjectGroups.length.toLocaleString()} of {projectGroups.length.toLocaleString()} shown
                </p>
              </div>
              {can("reports.edit") && (
                <Button variant="blue" onClick={openNewProject} className="!rounded-lg !px-2.5 !py-2 !text-xs">
                  <Plus size={13} className="mr-1.5" /> New
                </Button>
              )}
            </div>
            <div className="relative mt-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                list="report-project-search-list"
                value={projectSearchQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setProjectSearchQuery(value);
                  const match = projectGroups.find(
                    (group) => group?.project.name.toLowerCase() === value.trim().toLowerCase(),
                  );
                  if (match) setSelectedProjectId(match.project.id);
                }}
                placeholder="Search projects..."
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-8 text-xs font-medium outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950"
              />
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <datalist id="report-project-search-list">
                {projectGroups.map((group) =>
                  group ? <option key={group.project.id} value={group.project.name} /> : null,
                )}
              </datalist>
            </div>
          </div>

          <div className="max-h-[calc(100vh-320px)] min-h-[380px] overflow-y-auto">
            {filteredProjectGroups.length === 0 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                <FolderKanban size={28} className="mb-3 text-zinc-400" />
                <p className="text-sm font-bold text-zinc-900 dark:text-white">
                  {projectGroups.length === 0
                    ? "No projects or activities yet."
                    : "No project or activity found."}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {projectGroups.length === 0
                    ? "Create a project/activity to start monitoring reports."
                    : "Try a different project, focal person, or report filter."}
                </p>
                {can("reports.edit") && (
                  <Button variant="blue" onClick={openNewProject} className="mt-4 !rounded-lg !px-3 !py-2 !text-xs">
                    <Plus size={13} className="mr-1.5" /> New Activity/Project
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredProjectGroups.map((group) => {
                  if (!group) return null;
                  const { project, focal, counts } = group;
                  const selected = selectedProjectGroup?.project.id === project.id;
                  const health =
                    !project.active ? "Inactive" : counts.overdue > 0 ? "Has Overdue" : counts.dueSoon > 0 ? "Due Soon" : "Active";
                  const healthClass =
                    health === "Has Overdue"
                      ? "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                      : health === "Due Soon"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                        : health === "Inactive"
                          ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? "bg-blue-50 dark:bg-blue-500/10"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-zinc-900 dark:text-white">
                          {project.name}
                        </p>
                        <p className="truncate text-[11px] text-zinc-500">
                          {focal?.position || focal?.email || "No office/unit recorded"}
                        </p>
                        <p className="truncate text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                          {focal?.name || "Focal user missing"}
                        </p>
                      </div>
                      <div className="flex min-w-[92px] flex-col items-end gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${healthClass}`}>
                          {health}
                        </span>
                        <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                          {counts.total.toLocaleString()} reports
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {counts.overdue} overdue / {counts.dueSoon} soon
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-extrabold text-zinc-900 dark:text-white">
                    {rightPanelTitle}
                  </h2>
                  {activeTab === "projects" && selectedProjectGroup && (
                    <>
                      <Badge variant={selectedProjectGroup.project.active ? "success" : "default"}>
                        {selectedProjectGroup.project.active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="info">
                        {formatReportFrequency(selectedProjectGroup.project.defaultFrequency)}
                      </Badge>
                      {selectedProjectGroup.hasAttention && <Badge variant="warning">Attention Required</Badge>}
                    </>
                  )}
                </div>
                {activeTab === "projects" && selectedProjectGroup ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                    <span><strong className="text-zinc-700 dark:text-zinc-300">Focal:</strong> {selectedProjectGroup.focal?.name || "Focal user missing"}</span>
                    <span><strong className="text-zinc-700 dark:text-zinc-300">Office/Unit:</strong> {selectedProjectGroup.focal?.position || "Not recorded"}</span>
                    <span><strong className="text-zinc-700 dark:text-zinc-300">Next Deadline:</strong> {formatReportDate(selectedProjectGroup.nextDeadline)}</span>
                    <span><strong className="text-zinc-700 dark:text-zinc-300">Lead:</strong> {selectedProjectGroup.project.reminderLeadDays ?? settings.defaultLeadDays} days</span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">
                    {activeTab === "due-soon"
                      ? "Current reports approaching deadline or already overdue."
                      : "Submission dates, deadlines, reminder windows, and focal person readiness."}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeTab === "projects" && selectedProjectGroup && can("reports.edit") && (
                  <>
                    <Button variant="blue" onClick={() => openNewReportForProject(selectedProjectGroup.project)} className="!rounded-lg !px-3 !py-2 !text-xs">
                      <Plus size={13} className="mr-1.5" /> Add Report
                    </Button>
                    <Button variant="outline" onClick={() => openEditProject(selectedProjectGroup.project)} className="!rounded-lg !px-3 !py-2 !text-xs">
                      <Edit3 size={13} className="mr-1.5" /> Edit Project
                    </Button>
                  </>
                )}
                {activeTab === "projects" && selectedProjectGroup && can("reports.delete") && (
                  <Button variant="outline" onClick={() => deleteProject(selectedProjectGroup.project)} className="!rounded-lg !px-3 !py-2 !text-xs">
                    <Trash2 size={13} className="mr-1.5" /> Delete
                  </Button>
                )}
                {activeTab === "all" && can("reports.edit") && (
                  <Button variant="blue" onClick={openNewReport} disabled={visibleProjects.length === 0} className="!rounded-lg !px-3 !py-2 !text-xs">
                    <Plus size={13} className="mr-1.5" /> Add Report
                  </Button>
                )}
              </div>
            </div>

            {activeTab === "projects" && selectedProjectGroup && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
                  {[
                    { id: "active" as ProjectReportView, label: "Active", count: selectedProjectGroup.currentRows.length },
                    { id: "history" as ProjectReportView, label: "History", count: selectedProjectGroup.historyRows.length },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setProjectReportView(option.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                        projectReportView === option.id
                          ? "bg-white text-blue-700 shadow-sm dark:bg-zinc-800 dark:text-blue-300"
                          : "text-zinc-500"
                      }`}
                    >
                      {option.label}
                      <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[9px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                        {option.count.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedProjectGroup.project.notes && (
                  <p className="max-w-2xl truncate text-xs text-zinc-500">
                    {selectedProjectGroup.project.notes}
                  </p>
                )}
              </div>
            )}
          </div>

          {selectedProjectGroup || activeTab !== "projects" ? (
            <div className="p-3">
              {renderReportRows(rightPanelRows, { showProject: activeTab !== "projects" })}
            </div>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <ClipboardCheck size={30} className="mb-3 text-zinc-400" />
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                Select a project/activity or create a new one to start monitoring reports.
              </p>
              {can("reports.edit") && (
                <Button variant="blue" onClick={openNewProject} className="mt-4 !rounded-lg !px-3 !py-2 !text-xs">
                  <Plus size={13} className="mr-1.5" /> New Activity/Project
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      <Modal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        title={
          <span className="block">
            <span className="block text-lg font-extrabold text-zinc-900 dark:text-white">
              {projectModalTitle}
            </span>
            <span className="mt-1 block text-xs font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
              {projectModalSubtitle}
            </span>
          </span>
        }
        maxWidth="max-w-2xl"
        className={modalShellClass}
        headerClassName={modalHeaderClass}
        titleClassName={modalTitleClass}
        bodyClassName={modalBodyClass}
        footerClassName={modalFooterClass}
        closeButtonClassName={modalCloseClass}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsProjectModalOpen(false)} className="!rounded-lg !px-3 !py-2 !text-xs">Cancel</Button>
            <Button variant="blue" onClick={saveProject} className="!rounded-lg !px-3 !py-2 !text-xs">Save Activity/Project</Button>
          </>
        }
      >
        <div className="space-y-5">
          {projectForm.id && (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
              <span>{projectForm.active ? "Active Project" : "Inactive Project"}</span>
              <span className="text-zinc-300">/</span>
              <span>{formatReportFrequency(projectForm.defaultFrequency)}</span>
              <span className="text-zinc-300">/</span>
              <span>Reminder: {projectReminderSummary}</span>
            </div>
          )}

          <section className="space-y-3">
            <p className={sectionTitleClass}>Activity Details</p>
            <Input
              label="Activity/Project Name"
              value={projectForm.name}
              onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
              className={fieldClass}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={fieldLabelClass}>Focal Person</label>
                <div className="flex h-10 items-center rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-[13px] font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-100">
                  {usersById.get(projectForm.focalUserId)?.name || currentUser?.name || "Your account"}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={fieldLabelClass}>Default Frequency</label>
                <select
                  value={projectForm.defaultFrequency}
                  onChange={(event) => setProjectForm({ ...projectForm, defaultFrequency: event.target.value as ReportFrequency })}
                  className={selectClass}
                >
                  {REPORT_FREQUENCY_OPTIONS.map((frequency) => <option key={frequency} value={frequency}>{formatReportFrequency(frequency)}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <p className={sectionTitleClass}>Default Monitoring Settings</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Reminder Override Days"
                type="number"
                min={0}
                placeholder={`${settings.defaultLeadDays} default`}
                value={projectForm.reminderLeadDays}
                onChange={(event) => setProjectForm({ ...projectForm, reminderLeadDays: event.target.value })}
                className={fieldClass}
              />
              <label className="mt-[21px] flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10">
                <input
                  type="checkbox"
                  checked={projectForm.active}
                  onChange={(event) => setProjectForm({ ...projectForm, active: event.target.checked })}
                  className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-zinc-900 dark:text-white">Active project</span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">Include this activity in monitoring counts.</span>
                </span>
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <p className={sectionTitleClass}>Notes</p>
            <div className="space-y-1.5">
              <label className={fieldLabelClass}>Notes</label>
              <textarea
                value={projectForm.notes}
                onChange={(event) => setProjectForm({ ...projectForm, notes: event.target.value })}
                rows={3}
                className={textareaClass}
              />
            </div>
          </section>
        </div>
      </Modal>

      <Modal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        title={
          <span className="block">
            <span className="block text-lg font-extrabold text-zinc-900 dark:text-white">
              {reportModalTitle}
            </span>
            <span className="mt-1 block text-xs font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
              {reportModalSubtitle}
            </span>
          </span>
        }
        maxWidth="max-w-3xl"
        className={modalShellClass}
        headerClassName={modalHeaderClass}
        titleClassName={modalTitleClass}
        bodyClassName={modalBodyClass}
        footerClassName={modalFooterClass}
        closeButtonClassName={modalCloseClass}
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
                className="mr-auto !rounded-lg !px-3 !py-2 !text-xs"
              >
                <Send size={14} className="mr-2" /> Send Test Reminder
              </Button>
            )}
            <Button variant="ghost" onClick={() => setIsReportModalOpen(false)} className="!rounded-lg !px-3 !py-2 !text-xs">Cancel</Button>
            <Button variant="blue" onClick={saveReport} className="!rounded-lg !px-3 !py-2 !text-xs">Save Report</Button>
          </>
        }
      >
        <div className="space-y-5">
          <section className="space-y-3">
            <p className={sectionTitleClass}>Project and Report Details</p>
            <div className="space-y-1.5">
              <label className={fieldLabelClass}>Project</label>
              <select
                value={reportForm.projectId}
                onChange={(event) => {
                  const project = projectsById.get(event.target.value);
                  setReportForm({ ...reportForm, projectId: event.target.value, frequency: project?.defaultFrequency || reportForm.frequency });
                }}
                className={selectClass}
              >
                <option value="">Select project</option>
                {visibleProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>
            <Input
              label="Report Title"
              value={reportForm.title}
              onChange={(event) => setReportForm({ ...reportForm, title: event.target.value })}
              className={fieldClass}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Report Period"
                placeholder="e.g. January 2026, Q1 2026"
                value={reportForm.period}
                onChange={(event) => setReportForm({ ...reportForm, period: event.target.value })}
                className={fieldClass}
              />
              <div className="space-y-1.5">
                <label className={fieldLabelClass}>Frequency</label>
                <select
                  value={reportForm.frequency}
                  onChange={(event) => setReportForm({ ...reportForm, frequency: event.target.value as ReportFrequency })}
                  className={selectClass}
                >
                  {REPORT_FREQUENCY_OPTIONS.map((frequency) => <option key={frequency} value={frequency}>{formatReportFrequency(frequency)}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <p className={sectionTitleClass}>Schedule and Submission Details</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label="Deadline"
                type="date"
                value={reportForm.deadline}
                onChange={(event) => setReportForm({ ...reportForm, deadline: event.target.value })}
                className={fieldClass}
              />
              <Input
                label="Submitted Date"
                type="date"
                value={reportForm.submittedDate}
                onChange={(event) => setReportForm({ ...reportForm, submittedDate: event.target.value })}
                className={fieldClass}
              />
              <Input
                label="Reminder Override"
                type="number"
                min={0}
                placeholder={`${settings.defaultLeadDays} default`}
                value={reportForm.reminderLeadDays}
                onChange={(event) => setReportForm({ ...reportForm, reminderLeadDays: event.target.value })}
                className={fieldClass}
              />
            </div>
            <div className="grid gap-2 text-[11px] text-zinc-500 sm:grid-cols-3 dark:text-zinc-400">
              <p>Deadline determines due soon and overdue status.</p>
              <p>Submitted date marks the report as submitted.</p>
              <p>Reminder override changes this report's reminder window.</p>
            </div>
          </section>

          <section className="space-y-3">
            <p className={sectionTitleClass}>Remarks</p>
            <div className="space-y-1.5">
              <label className={fieldLabelClass}>Remarks</label>
              <textarea
                value={reportForm.remarks}
                onChange={(event) => setReportForm({ ...reportForm, remarks: event.target.value })}
                rows={3}
                className={textareaClass}
              />
            </div>
          </section>
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
