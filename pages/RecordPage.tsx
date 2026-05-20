import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  History,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  Fingerprint,
  Check,
  Edit2,
  Clock,
  Copy,
  ArrowDownToLine,
  FileBarChart,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Card, Button, Tabs, Modal } from "../components/ui";
import { useSearchParams } from "react-router-dom";
import { useDialog } from "../DialogContext";
import { useRbac } from "../RbacContext";
import { useUsers } from "../UserContext";
import { PermissionGate } from "../components/PermissionGate";
import { useToast } from "../ToastContext";
import { STORAGE_KEYS } from "../constants/storageKeys";
import {
  readRegistryDocTypesFromStorage,
  type RegistryDocTypeConfig,
} from "../services/registryRecords";
import {
  readStorageJson,
  readStorageJsonSafe,
  writeStorageJson,
} from "../services/storage";
import { useLocalStorageState } from "../hooks/useLocalStorageState";

interface AuditLog {
  action: string;
  timestamp: string;
  user: string;
  comment?: string;
}

interface RegistryRecord {
  date: string;
  type: string;
  name: string;
  reg: string;
  status: string;
  details: Record<string, string>;
  logs: AuditLog[];
}

interface SchemaField {
  id: string;
  label: string;
  type:
    | "text"
    | "number"
    | "date"
    | "select"
    | "prefix"
    | "checkbox"
    | "email"
    | "tel"
    | "textarea"
    | "multiselect"
    | "url"
    | "datetime"
    | "time"
    | "section"
    | "rating"
    | "color";
  required: boolean;
  options?: string[];
  collectionSource?: string;
}

const DEFAULT_RECORDS: RegistryRecord[] = [
  {
    date: "2024-12-24",
    type: "Birth Certificate",
    name: "Althea Grace Cruz",
    reg: "BC-001293",
    status: "Archived",
    details: {
      "Place of Birth": "Baler, Aurora",
      "Mother's Name": "Maria Cruz",
      "Father's Name": "Jose Cruz",
    },
    logs: [
      {
        action: "Record Created",
        timestamp: "Dec 24, 2024 10:20 AM",
        user: "Admin",
      },
    ],
  },
  {
    date: "2024-12-23",
    type: "Marriage Certificate",
    name: "Santos - Garcia",
    reg: "MC-000522",
    status: "Pending",
    details: {
      "Date of Marriage": "2024-12-20",
      "Location/Venue": "San Luis Church",
    },
    logs: [
      {
        action: "Record Created",
        timestamp: "Dec 23, 2024 02:45 PM",
        user: "Clerk",
      },
    ],
  },
  {
    date: "2024-11-15",
    type: "Death Certificate",
    name: "Benjamin Salonga",
    reg: "DC-000141",
    status: "Archived",
    details: { Cause: "Natural Causes", Age: "88" },
    logs: [
      {
        action: "Record Created",
        timestamp: "Nov 15, 2024 09:00 AM",
        user: "Admin",
      },
    ],
  },
];

const readDocFieldsFromStorage = (): Record<string, SchemaField[]> => {
  const parsed = readStorageJsonSafe<unknown>(STORAGE_KEYS.recordDocFields, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, SchemaField[]>)
    : {};
};

const normalizeDetailValue = (
  fieldType: SchemaField["type"],
  value: string,
): string => {
  if (fieldType === "multiselect") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(", ");
  }

  if (fieldType === "checkbox") {
    if (!value) return "No";
    const lowered = value.toLowerCase();
    if (lowered === "true" || lowered === "yes") return "Yes";
    if (lowered === "false" || lowered === "no") return "No";
    return value;
  }

  return value.trim();
};

const formatRegistryColumnLabel = (
  columnName: keyof RegistryRecord,
): string => {
  return String(columnName)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
};

export const RecordPage: React.FC = () => {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const { can } = useRbac();
  const { currentUser } = useUsers();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsSnapshot = searchParams.toString();
  const tabParam = searchParams.get("tab") || "";
  const actionParam = searchParams.get("action") || "";
  const [activeTab, setActiveTab] = useState("history");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmittingRecord, setIsSubmittingRecord] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [docTypes, setDocTypes] = useLocalStorageState<RegistryDocTypeConfig[]>(
    STORAGE_KEYS.recordDocTypes,
    readRegistryDocTypesFromStorage(),
  );
  const [docFields, setDocFields] = useLocalStorageState<Record<string, SchemaField[]>>(
    STORAGE_KEYS.recordDocFields,
    readDocFieldsFromStorage(),
  );

  const enabledDocTypes = useMemo<RegistryDocTypeConfig[]>(() => {
    return docTypes.filter((doc) => doc.enabled);
  }, [docTypes]);

  const enabledDocTypeNames = useMemo(() => {
    return enabledDocTypes.map((doc) => doc.name);
  }, [enabledDocTypes]);

  const [dataCollections, setDataCollections] = useLocalStorageState<
    Record<string, string[]>
  >(STORAGE_KEYS.dataCollections, {
    Positions: [
      "Admin Clerk",
      "Statistician",
      "Field Officer",
      "Provincial Lead",
    ],
    Municipalities: [
      "Baler",
      "Casiguran",
      "Dilasag",
      "Dinalungan",
      "Dingalan",
      "Dipaculao",
      "Maria Aurora",
      "San Luis",
    ],
    Genders: ["Male", "Female", "Prefer not to say"],
  });

  // Report Filters
  const [reportFilters, setReportFilters] = useState({
    startDate: "",
    endDate: "",
    type: "All Documents",
  });

  const refConfigs = useMemo(() => {
    const mapped = docTypes.reduce<
      Record<
        string,
        {
          prefix: string;
          separator: string;
          padding: number;
          start: number;
          increment: number;
        }
      >
    >((acc, doc) => {
      acc[doc.name] = {
        prefix: doc.refPrefix,
        separator: doc.refSeparator,
        padding: doc.refPadding,
        start: doc.refStart,
        increment: doc.refIncrement,
      };
      return acc;
    }, {});

    if (Object.keys(mapped).length > 0) {
      return mapped;
    }

    return {
      "Birth Certificate": {
        prefix: "BC",
        separator: "-",
        padding: 6,
        start: 1000,
        increment: 1,
      },
      "Marriage Certificate": {
        prefix: "MC",
        separator: "-",
        padding: 6,
        start: 500,
        increment: 1,
      },
      "Death Certificate": {
        prefix: "DC",
        separator: "-",
        padding: 6,
        start: 100,
        increment: 1,
      },
      CENOMAR: {
        prefix: "CN",
        separator: "-",
        padding: 6,
        start: 1,
        increment: 1,
      },
    };
  }, [docTypes]);

  const [records, setRecords] = useLocalStorageState<RegistryRecord[]>(
    STORAGE_KEYS.registryRecords,
    DEFAULT_RECORDS,
  );

  const reportDocumentTypes = useMemo(() => {
    const merged = new Set<string>([
      ...enabledDocTypeNames,
      ...records.map((record) => record.type),
    ]);
    return Array.from(merged);
  }, [enabledDocTypeNames, records]);

  const [formData, setFormData] = useState({
    type: enabledDocTypeNames[0] || "",
    name: currentUser?.name || "",
    date: new Date().toISOString().split("T")[0],
    editComment: "",
  });
  const [hasSelectedDocType, setHasSelectedDocType] = useState(false);
  const [newEntryStatus, setNewEntryStatus] = useState<"Pending" | "Completed">(
    "Pending",
  );
  const [detailValues, setDetailValues] = useState<Record<string, string>>({});
  const [editingOriginalDetails, setEditingOriginalDetails] = useState<
    Record<string, string>
  >({});

  const recordTabs = useMemo(() => {
    return [
      {
        id: "history",
        label: "History",
        icon: History,
        permission: "records.view" as const,
      },
      {
        id: "report",
        label: "Report",
        icon: FileBarChart,
        permission: "settings.data" as const,
      },
    ].filter((tab) => !tab.permission || can(tab.permission));
  }, [can]);

  useEffect(() => {
    if (
      !recordTabs.find((tab) => tab.id === activeTab) &&
      recordTabs.length > 0
    ) {
      setActiveTab(recordTabs[0].id);
    }
  }, [recordTabs, activeTab]);

  useEffect(() => {
    if (!tabParam) return;
    if (tabParam === activeTab) return;
    if (!recordTabs.find((tab) => tab.id === tabParam)) return;
    setActiveTab(tabParam);
  }, [tabParam, recordTabs, activeTab]);

  const handleTabChange = useCallback(
    (nextTab: string) => {
      setActiveTab(nextTab);

      const next = new URLSearchParams(searchParamsSnapshot);
      next.set("tab", nextTab);
      if (next.toString() === searchParamsSnapshot) return;

      setSearchParams(next, { replace: true });
    },
    [searchParamsSnapshot, setSearchParams],
  );

  const [lastCreated, setLastCreated] = useState<RegistryRecord | null>(null);
  const [lastCreatedAtLabel, setLastCreatedAtLabel] = useState("");
  const [editingReg, setEditingReg] = useState<string | null>(null);

  useEffect(() => {
    const refreshSettingsOnFocus = () => {
      setDocTypes(readRegistryDocTypesFromStorage());
      setDocFields(readDocFieldsFromStorage());
      const parsedCollections = readStorageJsonSafe<unknown>(
        STORAGE_KEYS.dataCollections,
        null,
      );
      if (
        parsedCollections &&
        typeof parsedCollections === "object" &&
        !Array.isArray(parsedCollections)
      ) {
        setDataCollections(parsedCollections as Record<string, string[]>);
      }
    };

    window.addEventListener("focus", refreshSettingsOnFocus);
    return () => {
      window.removeEventListener("focus", refreshSettingsOnFocus);
    };
  }, []);

  useEffect(() => {
    if (!enabledDocTypeNames.includes(formData.type)) {
      setFormData((prev) => ({ ...prev, type: enabledDocTypeNames[0] || "" }));
    }
  }, [enabledDocTypeNames, formData.type]);

  useEffect(() => {
    if (!isModalOpen || isEditMode) return;

    const defaultName = currentUser?.name?.trim();
    if (!defaultName) return;

    setFormData((prev) => {
      if (prev.name.trim()) return prev;
      return { ...prev, name: defaultName };
    });
  }, [currentUser?.name, isEditMode, isModalOpen]);

  useEffect(() => {
    if (
      reportFilters.type !== "All Documents" &&
      !reportDocumentTypes.includes(reportFilters.type)
    ) {
      setReportFilters((prev) => ({ ...prev, type: "All Documents" }));
    }
  }, [reportDocumentTypes, reportFilters.type]);

  const selectedDocType = useMemo(
    () => docTypes.find((doc) => doc.name === formData.type) || null,
    [docTypes, formData.type],
  );

  const activeSchemaFields = useMemo<SchemaField[]>(() => {
    if (!selectedDocType) return [];
    const configuredFields = docFields[selectedDocType.id];
    return Array.isArray(configuredFields) ? configuredFields : [];
  }, [selectedDocType, docFields]);

  const buildInitialDetailValues = useMemo(
    () => (fields: SchemaField[], sourceDetails?: Record<string, string>) => {
      const nextValues: Record<string, string> = {};
      fields.forEach((field) => {
        if (field.type === "section") return;
        const sourceValue = sourceDetails?.[field.label];
        nextValues[field.id] =
          typeof sourceValue === "string" ? sourceValue : "";
      });
      return nextValues;
    },
    [],
  );

  // Derived Data for Filters
  const nameColumnLabel = useMemo(() => formatRegistryColumnLabel("name"), []);

  const getRecordLocationLabel = (record: RegistryRecord): string => {
    const prioritizeKeys = [
      "Municipality",
      "Place of Birth",
      "Location/Venue",
      "Location",
      "Address",
    ];

    for (const key of prioritizeKeys) {
      const directValue = record.details[key];
      if (
        typeof directValue === "string" &&
        directValue.trim() &&
        directValue !== "Not Specified"
      ) {
        return directValue.split(",")[0].trim();
      }
    }

    for (const [key, value] of Object.entries(record.details)) {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value === "Not Specified"
      )
        continue;
      if (
        /(municipality|location|place|venue|city|barangay|office)/i.test(key)
      ) {
        return value.split(",")[0].trim();
      }
    }

    return "Unspecified";
  };

  const filteredRecords = records.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reg.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.type.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const reportRecords = useMemo(() => {
    return records.filter((r) => {
      const matchType =
        reportFilters.type === "All Documents" || r.type === reportFilters.type;
      const matchStart =
        !reportFilters.startDate ||
        new Date(r.date) >= new Date(reportFilters.startDate);
      const matchEnd =
        !reportFilters.endDate ||
        new Date(r.date) <= new Date(reportFilters.endDate);
      return matchType && matchStart && matchEnd;
    });
  }, [records, reportFilters]);

  const reportCompletedCount = useMemo(
    () =>
      reportRecords.filter((record) => record.status === "Completed").length,
    [reportRecords],
  );

  const reportPendingCount = useMemo(
    () => reportRecords.filter((record) => record.status === "Pending").length,
    [reportRecords],
  );

  const reportActiveTypeCount = useMemo(
    () => new Set(reportRecords.map((record) => record.type)).size,
    [reportRecords],
  );

  const reportGroupingMode = useMemo<"location" | "documentType">(() => {
    if (reportRecords.length === 0) return "documentType";

    const recordsWithLocation = reportRecords.filter(
      (record) => getRecordLocationLabel(record) !== "Unspecified",
    ).length;
    const minimumUsefulLocationRows = Math.max(
      1,
      Math.ceil(reportRecords.length * 0.3),
    );
    return recordsWithLocation >= minimumUsefulLocationRows
      ? "location"
      : "documentType";
  }, [reportRecords]);

  const reportPrimaryHeaderLabel =
    reportGroupingMode === "location"
      ? "Location / Municipality"
      : "Document Type";
  const reportSecondaryHeaderLabel =
    reportGroupingMode === "location" ? "Registry Activity" : "Records Logged";
  const reportTertiaryHeaderLabel = "Completion Rate";
  const reportSummaryDescription =
    reportGroupingMode === "location"
      ? "Live grouping by location metadata from history and current report filters"
      : "Live grouping by document types (location metadata not consistently available in current records)";

  const reportActivityRows = useMemo(() => {
    if (reportRecords.length === 0) {
      return [] as Array<{
        label: string;
        count: number;
        completed: number;
        completionRate: number;
        share: number;
      }>;
    }

    const grouped = reportRecords.reduce<
      Record<string, { count: number; completed: number }>
    >((acc, record) => {
      const label =
        reportGroupingMode === "location"
          ? getRecordLocationLabel(record) || "Unspecified"
          : record.type || "Unspecified Type";

      if (!acc[label]) {
        acc[label] = { count: 0, completed: 0 };
      }

      acc[label].count += 1;
      if (record.status === "Completed") {
        acc[label].completed += 1;
      }

      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([label, aggregate]) => {
        const typedAggregate = aggregate as {
          count: number;
          completed: number;
        };
        const count = typedAggregate.count;
        const completed = typedAggregate.completed;
        return {
          label,
          count,
          completed,
          completionRate: count > 0 ? (completed / count) * 100 : 0,
          share: (count / reportRecords.length) * 100,
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [reportGroupingMode, reportRecords]);

  const selectedSchemaPrefix = useMemo(() => {
    const prefixFields = activeSchemaFields.filter(
      (field) => field.type === "prefix",
    );
    for (const field of prefixFields) {
      const value = normalizeDetailValue(
        field.type,
        detailValues[field.id] || "",
      ).trim();
      if (value) return value;
    }
    return "";
  }, [activeSchemaFields, detailValues]);

  const generateRegistryNumber = (type: string, prefixOverride?: string) => {
    const config = refConfigs[type as keyof typeof refConfigs] || {
      prefix: "REG",
      separator: "-",
      padding: 6,
      start: 1,
      increment: 1,
    };
    const base = Math.max(1, Number(config.start) || 1);
    const increment = Math.max(1, Number(config.increment) || 1);
    const resolvedPrefix =
      (prefixOverride || config.prefix || "REG").trim() || "REG";
    const marker = `${resolvedPrefix}${config.separator}`;

    const highest = records
      .filter((record) => record.type === type && record.reg.startsWith(marker))
      .reduce((max, record) => {
        const numericPart = Number(record.reg.slice(marker.length));
        if (Number.isFinite(numericPart)) {
          return Math.max(max, numericPart);
        }
        return max;
      }, base - increment);

    const nextNumber = highest + increment;
    return `${resolvedPrefix}${config.separator}${String(nextNumber).padStart(config.padding, "0")}`;
  };

  useEffect(() => {
    if (!isModalOpen || isEditMode) return;
    setDetailValues(buildInitialDetailValues(activeSchemaFields));
  }, [activeSchemaFields, buildInitialDetailValues, isEditMode, isModalOpen]);

  const getInputTypeByField = (field: SchemaField): string => {
    if (field.type === "datetime") return "datetime-local";
    if (field.type === "rating") return "number";
    if (field.type === "multiselect" || field.type === "prefix") return "text";
    return field.type;
  };

  const openAddModal = useCallback(() => {
    const defaultType = enabledDocTypeNames[0] || "";
    const defaultDoc = docTypes.find((doc) => doc.name === defaultType);
    const defaultFields = defaultDoc ? docFields[defaultDoc.id] || [] : [];

    setIsEditMode(false);
    setIsSubmittingRecord(false);
    setHasSelectedDocType(false);
    setNewEntryStatus("Pending");
    setEditingReg(null);
    setEditingOriginalDetails({});
    setFormData({
      type: defaultType,
      name: "",
      date: new Date().toISOString().split("T")[0],
      editComment: "",
    });
    setDetailValues(buildInitialDetailValues(defaultFields));
    setIsModalOpen(true);
  }, [buildInitialDetailValues, docFields, docTypes, enabledDocTypeNames]);

  useEffect(() => {
    if (actionParam !== "new-entry") return;
    if (!can("records.edit")) return;

    const next = new URLSearchParams(searchParamsSnapshot);
    next.delete("action");
    setSearchParams(next, { replace: true });

    openAddModal();
  }, [actionParam, can, openAddModal, setSearchParams, searchParamsSnapshot]);

  const openEditModal = (record: RegistryRecord) => {
    const nextDoc = docTypes.find((doc) => doc.name === record.type);
    const nextFields = nextDoc ? docFields[nextDoc.id] || [] : [];

    setIsEditMode(true);
    setEditingReg(record.reg);
    setNewEntryStatus(record.status as "Pending" | "Completed");
    setEditingOriginalDetails(record.details || {});
    setFormData({
      type: record.type,
      name: record.name,
      date: record.date,
      editComment: "",
    });
    setDetailValues(buildInitialDetailValues(nextFields, record.details || {}));
    setIsModalOpen(true);
  };

  const handleSubmit = (event?: React.FormEvent | React.MouseEvent) => {
    event?.preventDefault();

    if (!isEditMode && isSubmittingRecord) {
      return;
    }

    if (!isEditMode && !hasSelectedDocType) {
      toast("error", "Select a document classification first.");
      return;
    }

    if (isEditMode && !formData.name.trim()) {
      toast("error", `${nameColumnLabel} is required.`);
      return;
    }

    const requiredField = activeSchemaFields.find((field) => {
      if (!field.required || field.type === "section") return false;
      const value = normalizeDetailValue(
        field.type,
        detailValues[field.id] || "",
      );
      return !value;
    });

    if (requiredField) {
      toast("error", `"${requiredField.label}" is required.`);
      return;
    }

    if (!isEditMode) {
      setIsSubmittingRecord(true);
    }

    const now = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
    const actorName = currentUser?.name?.trim() || "System";

    const metadataEntries = activeSchemaFields
      .filter((field) => field.type !== "section")
      .map((field) => {
        const normalized = normalizeDetailValue(
          field.type,
          detailValues[field.id] || "",
        );
        return {
          label: field.label,
          value: normalized,
        };
      });

    const schemaDetails = metadataEntries.reduce<Record<string, string>>(
      (acc, entry) => {
        acc[entry.label] = entry.value || "Not Specified";
        return acc;
      },
      {},
    );

    const addModeDisplayName = (() => {
      if (isEditMode) return "";

      const preferredLabelMatchers = [
        /subject|description/i,
        /full\s*name|name|applicant|requestor|personnel|employee|officer/i,
        /title|document/i,
      ];

      for (const matcher of preferredLabelMatchers) {
        const match = metadataEntries.find(
          (entry) => matcher.test(entry.label) && entry.value,
        );
        if (match) return match.value;
      }

      const firstFilled = metadataEntries.find((entry) => entry.value);
      if (firstFilled) return firstFilled.value;

      return `${formData.type} Entry`;
    })();

    const resolvedRecordName = isEditMode
      ? formData.name.trim()
      : formData.name.trim() || addModeDisplayName;
    const resolvedRecordDate =
      formData.date || new Date().toISOString().split("T")[0];

    const schemaLabels = new Set(
      activeSchemaFields
        .filter((field) => field.type !== "section")
        .map((field) => field.label),
    );
    const retainedLegacyDetails = Object.entries(editingOriginalDetails).reduce<
      Record<string, string>
    >((acc, [key, value]) => {
      if (!schemaLabels.has(key)) {
        acc[key] = typeof value === "string" ? value : String(value);
      }
      return acc;
    }, {});

    const details =
      activeSchemaFields.length > 0
        ? { ...schemaDetails, ...retainedLegacyDetails }
        : { ...editingOriginalDetails };

    const updatedCollections = { ...dataCollections };
    let collectionsChanged = false;

    activeSchemaFields
      .filter((field) => field.type !== "section" && field.collectionSource)
      .forEach((field) => {
        const collectionName = field.collectionSource as string;
        const existingEntries = updatedCollections[collectionName] || [];
        const values = normalizeDetailValue(
          field.type,
          detailValues[field.id] || "",
        )
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);

        values.forEach((entry) => {
          if (!existingEntries.includes(entry)) {
            existingEntries.push(entry);
            collectionsChanged = true;
            toast(
              "info",
              `New item "${entry}" added to global ${collectionName}`,
            );
          }
        });

        updatedCollections[collectionName] = existingEntries;
      });

    if (collectionsChanged) {
      setDataCollections(updatedCollections);
      writeStorageJson(STORAGE_KEYS.dataCollections, updatedCollections);
    }

    if (isEditMode && editingReg) {
      setRecords(
        records.map((r) => {
          if (r.reg === editingReg) {
            return {
              ...r,
              date: resolvedRecordDate,
              name: resolvedRecordName,
              status: newEntryStatus,
              details,
              logs: [
                ...r.logs,
                {
                  action: "Record Modified",
                  timestamp: now,
                  user: actorName,
                  comment: formData.editComment || "General update",
                },
              ],
            };
          }
          return r;
        }),
      );
      setEditingOriginalDetails(details);
      setFormData((prev) => ({
        ...prev,
        date: resolvedRecordDate,
        name: resolvedRecordName,
        editComment: "",
      }));
      toast("success", `Record ${editingReg} updated successfully.`);
      setIsSubmittingRecord(false);
      return;
    }

    const regNo = generateRegistryNumber(formData.type, selectedSchemaPrefix);
    const newRecord: RegistryRecord = {
      date: resolvedRecordDate,
      type: formData.type,
      name: resolvedRecordName,
      reg: regNo,
      status: newEntryStatus,
      details,
      logs: [{ action: "Record Created", timestamp: now, user: actorName }],
    };

    window.setTimeout(() => {
      setRecords([newRecord, ...records]);
      setLastCreated(newRecord);
      setLastCreatedAtLabel(now);
      setIsModalOpen(false);
      setIsSuccessModalOpen(true);
      setIsSubmittingRecord(false);
      toast("success", `Record ${newRecord.reg} created successfully`);
    }, 420);
  };

  const handleExportPDF = async () => {
    if (reportRecords.length === 0) {
      toast("error", "No report data to export for the selected filters.");
      return;
    }

    setIsExporting(true);

    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = autoTableModule.default;

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "legal",
      });
      const generatedAt = new Date();
      const filterSummary = [
        `Date Range: ${reportFilters.startDate || "Any"} to ${reportFilters.endDate || "Any"}`,
        `Document Type: ${reportFilters.type}`,
      ];

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("REGISTRY MANAGEMENT REPORT", 14, 14);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Generated: ${generatedAt.toLocaleString()}`, 14, 20);
      doc.text(filterSummary.join(" | "), 14, 25);
      doc.text(
        `Total: ${reportRecords.length} | Completed: ${reportCompletedCount} | Pending: ${reportPendingCount} | Types: ${reportActiveTypeCount}`,
        14,
        30,
      );

      const tableRows = reportRecords.map((record, index) => [
        String(index + 1),
        record.reg,
        record.date,
        record.type,
        record.name,
        record.status,
        getRecordLocationLabel(record),
      ]);

      autoTable(doc, {
        startY: 34,
        head: [
          ["#", "Reference No.", "Date", "Type", "Name", "Status", "Location"],
        ],
        body: tableRows,
        styles: { fontSize: 7, cellPadding: 1.6 },
        headStyles: {
          fillColor: [37, 99, 235],
          fontSize: 7,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      const docWithAutoTable = doc as unknown as {
        lastAutoTable?: { finalY: number };
      };
      const reportFinalY = docWithAutoTable.lastAutoTable?.finalY ?? 34;

      const activityRows = reportActivityRows.map((row) => [
        row.label,
        `${row.count} record${row.count === 1 ? "" : "s"}`,
        `${row.completed}/${row.count} (${row.completionRate.toFixed(1)}%)`,
      ]);

      if (activityRows.length > 0) {
        autoTable(doc, {
          startY: reportFinalY + 8,
          head: [
            [
              reportPrimaryHeaderLabel,
              reportSecondaryHeaderLabel,
              reportTertiaryHeaderLabel,
            ],
          ],
          body: activityRows,
          styles: { fontSize: 7, cellPadding: 1.6 },
          headStyles: {
            fillColor: [30, 64, 175],
            fontSize: 7,
            fontStyle: "bold",
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: { 2: { halign: "right" } },
        });
      }

      const safeDate = generatedAt.toISOString().split("T")[0];
      doc.save(`Registry_Report_${safeDate}.pdf`);
      toast(
        "success",
        `Official PDF exported (${reportRecords.length} records).`,
      );
    } catch (error) {
      console.error("Failed to export official report PDF", error);
      toast("error", "Failed to export official PDF report.");
    } finally {
      setIsExporting(false);
    }
  };

  const deleteRecord = async (reg: string) => {
    if (await confirm(`Are you sure you want to delete record ${reg}?`)) {
      setRecords(records.filter((r) => r.reg !== reg));
      toast("success", `Record ${reg} deleted`);
    }
  };

  const inputBaseClass =
    "w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[13px] outline-none font-medium focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all";
  const referenceNumberPreview = isEditMode
    ? editingReg || "Unavailable"
    : formData.type
      ? generateRegistryNumber(formData.type, selectedSchemaPrefix)
      : "Select classification";
  const getDocReferenceFormatPreview = (doc: RegistryDocTypeConfig): string => {
    const prefix = (doc.refPrefix || "REG").trim() || "REG";
    const separator = doc.refSeparator ?? "-";
    const padding = Math.max(1, Number(doc.refPadding) || 1);
    return `${prefix}${separator}${"x".repeat(padding)}`;
  };
  const canShowMetadataForm = isEditMode || hasSelectedDocType;
  const successMetadataRows = useMemo(() => {
    if (!lastCreated) return [] as Array<{ label: string; value: string }>;

    const detailRows = Object.entries(lastCreated.details).map(
      ([label, value]) => ({
        label,
        value:
          typeof value === "string" && value.trim() ? value : "Not Specified",
      }),
    );

    if (detailRows.length > 0) {
      return detailRows;
    }

    return [
      { label: "Document Type", value: lastCreated.type },
      { label: "Subject", value: lastCreated.name },
      { label: "Initial Status", value: lastCreated.status },
      { label: "Date", value: lastCreated.date },
    ];
  }, [lastCreated]);

  const handleCopyReference = async () => {
    if (!lastCreated?.reg) return;

    try {
      await navigator.clipboard.writeText(lastCreated.reg);
      toast("success", "Reference number copied.");
    } catch {
      toast("error", "Unable to copy reference number.");
    }
  };

  const handleCreateAnotherRecord = () => {
    setIsSuccessModalOpen(false);
    openAddModal();
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Record Management
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium mt-1 uppercase tracking-wider">
            Provincial Office Data Hub
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          <Tabs
            tabs={recordTabs}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            className="border-b-0"
          />
          <div className="hidden sm:block h-8 w-px bg-zinc-200 dark:bg-zinc-800 mx-2 shrink-0" />
          <PermissionGate requires="records.edit">
            <Button
              variant="blue"
              className="w-full sm:w-auto shadow-lg shadow-blue-500/20"
              onClick={openAddModal}
            >
              <Plus size={16} className="mr-2" /> New Entry
            </Button>
          </PermissionGate>
        </div>
      </div>

      {activeTab === "history" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card
            title="Registry Records"
            description="Complete provincial history of processed documents"
            action={
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  size={14}
                />
                <input
                  type="text"
                  placeholder="Search by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none w-full sm:w-64 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            }
          >
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <th className="pb-4 px-3 sm:px-0 text-[13px] font-black text-zinc-400 uppercase tracking-widest">
                      Registry No.
                    </th>
                    <th className="pb-4 px-3 sm:px-0 text-[13px] font-black text-zinc-400 uppercase tracking-widest">
                      Date
                    </th>
                    <th className="pb-4 px-3 sm:px-0 text-[13px] font-black text-zinc-400 uppercase tracking-widest">
                      Type
                    </th>
                    <th className="pb-4 px-3 sm:px-0 text-[13px] font-black text-zinc-400 uppercase tracking-widest">
                      {nameColumnLabel}
                    </th>
                    <th className="pb-4 px-3 sm:px-0 text-[13px] font-black text-zinc-400 uppercase tracking-widest text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                  {filteredRecords.map((row) => (
                    <tr
                      key={row.reg}
                      className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                    >
                      <td
                        className="py-4 px-3 sm:px-0 cursor-pointer group/reg"
                        onClick={() => openEditModal(row)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-black text-zinc-900 dark:text-white tracking-tight group-hover/reg:text-blue-600 transition-colors">
                            {row.reg}
                          </span>
                          <div className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400 group-hover/reg:bg-blue-50 group-hover/reg:text-blue-600 transition-all">
                            <ArrowRight size={10} />
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-3 sm:px-0 text-[13px] text-zinc-500 font-medium">
                        {row.date}
                      </td>
                      <td className="py-4 px-3 sm:px-0 text-[13px] font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                        {row.type}
                      </td>
                      <td className="py-4 px-3 sm:px-0 text-[13px] font-bold tracking-tight">
                        <span className="block max-w-[240px] break-words leading-snug">
                          {row.name}
                        </span>
                      </td>
                      <td className="py-4 px-3 sm:px-0 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <PermissionGate requires="records.edit">
                            <button
                              onClick={() => openEditModal(row)}
                              className="p-2 text-zinc-400 hover:text-blue-500"
                              title="Edit Record"
                            >
                              <Edit2 size={14} />
                            </button>
                          </PermissionGate>
                          <PermissionGate requires="records.delete">
                            <button
                              onClick={() => deleteRecord(row.reg)}
                              className="p-2 text-zinc-400 hover:text-red-500"
                              title="Delete Record"
                            >
                              <Trash2 size={14} />
                            </button>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "report" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-4 p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm">
            <div className="flex-1 space-y-1.5">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                Start Date
              </label>
              <input
                type="date"
                value={reportFilters.startDate}
                onChange={(e) =>
                  setReportFilters({
                    ...reportFilters,
                    startDate: e.target.value,
                  })
                }
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                End Date
              </label>
              <input
                type="date"
                value={reportFilters.endDate}
                onChange={(e) =>
                  setReportFilters({
                    ...reportFilters,
                    endDate: e.target.value,
                  })
                }
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                Document Type
              </label>
              <select
                value={reportFilters.type}
                onChange={(e) =>
                  setReportFilters({ ...reportFilters, type: e.target.value })
                }
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs outline-none font-bold"
              >
                <option>All Documents</option>
                {reportDocumentTypes.map((typeName) => (
                  <option key={typeName}>{typeName}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="h-10 px-6 rounded-xl text-[10px] uppercase font-black tracking-widest w-full md:w-auto"
                onClick={handleExportPDF}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 size={14} className="animate-spin mr-2" />
                ) : (
                  <ArrowDownToLine size={14} className="mr-2" />
                )}
                Export Official PDF
              </Button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card title="Total Volume" description="Filtered record count">
              <p className="text-3xl font-black mt-2 text-zinc-900 dark:text-white tracking-tighter">
                {reportRecords.length}
              </p>
            </Card>
            <Card title="Completed" description="Records already completed">
              <p className="text-3xl font-black mt-2 text-emerald-600 tracking-tighter">
                {reportCompletedCount}
              </p>
            </Card>
            <Card title="Pending" description="Records awaiting completion">
              <p className="text-3xl font-black mt-2 text-amber-500 tracking-tighter">
                {reportPendingCount}
              </p>
            </Card>
            <Card title="Doc Types" description="Active types in result set">
              <p className="text-3xl font-black mt-2 text-blue-600 tracking-tighter">
                {reportActiveTypeCount}
              </p>
            </Card>
          </div>

          <Card
            title="Provincial Activity Summary"
            description={reportSummaryDescription}
          >
            {reportActivityRows.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No records match the selected filter range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 text-[13px] font-black text-zinc-400 uppercase tracking-widest">
                      <th className="pb-3">{reportPrimaryHeaderLabel}</th>
                      <th className="pb-3">{reportSecondaryHeaderLabel}</th>
                      <th className="pb-3 text-right">
                        {reportTertiaryHeaderLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                    {reportActivityRows.map((row) => (
                      <tr key={row.label}>
                        <td className="py-4 text-[11px] font-bold text-zinc-900 dark:text-white">
                          {row.label}
                        </td>
                        <td className="py-4 text-[11px] text-zinc-500">
                          {row.count} record{row.count === 1 ? "" : "s"}
                        </td>
                        <td className="py-4 text-right font-mono text-[11px] text-blue-600 font-bold">
                          {row.completed}/{row.count} (
                          {row.completionRate.toFixed(1)}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Main Entry/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          <div className="flex items-center gap-3">
            <span>
              {isEditMode
                ? `Edit Registry Entry: ${editingReg}`
                : "New Record Entry"}
            </span>
            {isEditMode && (
              <button
                type="button"
                onClick={() => {
                  if (newEntryStatus === "Completed" && !can("records.edit")) {
                    toast(
                      "error",
                      "Only roles with records.edit permission can revert to pending.",
                    );
                    return;
                  }
                  setNewEntryStatus((prev) =>
                    prev === "Pending" ? "Completed" : "Pending",
                  );
                }}
                className={`px-2 py-0 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border shrink-0 ${
                  newEntryStatus === "Completed"
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                    : "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                } ${newEntryStatus === "Completed" && !can("records.edit") ? "opacity-50 cursor-not-allowed" : ""}`}
                title={
                  newEntryStatus === "Completed" && !can("records.edit")
                    ? "Requires edit permission to toggle"
                    : "Toggle status"
                }
              >
                {newEntryStatus}
              </button>
            )}
          </div>
        }
        maxWidth={isEditMode ? "max-w-[760px]" : "max-w-[680px]"}
        className="rounded-[24px] border border-zinc-200/80 dark:border-zinc-800/80"
        headerClassName="px-3.5 sm:px-4 py-2.5 bg-zinc-50/80 dark:bg-zinc-900/60 border-zinc-200/70 dark:border-zinc-800/80"
        bodyClassName="px-3.5 sm:px-4 py-3"
        titleClassName="normal-case text-[15px] sm:text-[16px] font-bold tracking-tight"
        closeButtonClassName="text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20"
        footer={
          isEditMode ? (
            <div className="flex w-full sm:w-auto gap-2">
              <Button
                variant="ghost"
                className="rounded-xl px-5 h-10 flex-1 sm:flex-none"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="blue"
                className="rounded-xl px-6 h-10 shadow-lg shadow-blue-500/20 flex-1 sm:flex-none"
                onClick={handleSubmit}
              >
                Update Record
              </Button>
            </div>
          ) : undefined
        }
      >
        <div
          className={`grid ${isEditMode ? "grid-cols-1 xl:grid-cols-5" : "grid-cols-1"} gap-3 overflow-hidden ${isEditMode && newEntryStatus === "Completed" ? "opacity-70 pointer-events-none" : ""}`}
        >
          <form
            className={`${isEditMode ? "xl:col-span-2" : ""} space-y-2.5`}
            onSubmit={handleSubmit}
          >
            {!isEditMode && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.14em]">
                    Select Classification
                  </label>
                  <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                    {
                      activeSchemaFields.filter(
                        (field) => field.type !== "section",
                      ).length
                    }{" "}
                    metadata fields
                  </span>
                </div>
                <div className="max-h-[132px] overflow-y-auto pr-1 custom-scrollbar">
                  <div className="flex flex-wrap gap-1.5">
                    {enabledDocTypes.map((docType) => {
                      const typeName = docType.name;
                      const isActive =
                        hasSelectedDocType && formData.type === typeName;
                      return (
                        <button
                          key={typeName}
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              type: typeName,
                            }));
                            setHasSelectedDocType(true);
                          }}
                          className={`group w-[124px] sm:w-[132px] text-left rounded-xl border px-1.5 py-1.5 transition-all min-h-[58px] ${
                            isActive
                              ? "bg-blue-700 border-blue-700 text-white shadow-md shadow-blue-500/20"
                              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-[#0f172a] dark:text-zinc-200 hover:border-blue-400 dark:hover:border-blue-600"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p
                              title={typeName}
                              className={`flex-1 pr-1 antialiased text-[10px] font-extrabold uppercase leading-[1.15] ${
                                isActive
                                  ? "text-white tracking-[0.03em] drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                                  : "text-[#0f172a] dark:text-zinc-100 tracking-[0.02em]"
                              }`}
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {typeName}
                            </p>
                            <ArrowRight
                              size={12}
                              className={`mt-0.5 shrink-0 ${isActive ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" : "text-blue-600"}`}
                            />
                          </div>
                          <p
                            className={`mt-0.5 block w-full overflow-hidden text-ellipsis whitespace-nowrap antialiased text-[9px] font-bold tracking-[0.04em] ${
                              isActive
                                ? "text-blue-50 drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]"
                                : "text-[#1e3a8a] dark:text-zinc-400"
                            }`}
                          >
                            {getDocReferenceFormatPreview(docType)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {isEditMode && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="space-y-1 min-w-0">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      {nameColumnLabel}
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                      placeholder={currentUser?.name || "Enter full name"}
                      className={`${inputBaseClass} font-semibold`}
                    />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      Date
                    </label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) =>
                        setFormData({ ...formData, date: e.target.value })
                      }
                      className={`${inputBaseClass} py-2 text-[12px] font-semibold min-w-0`}
                    />
                  </div>
                </div>

                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    Reference Number
                  </label>
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800/60 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-[11px] font-mono font-black text-blue-600 dark:text-blue-300 inline-flex items-center gap-1.5 min-h-[40px]">
                    <Fingerprint size={12} className="shrink-0" />
                    <span className="break-all leading-tight">
                      {referenceNumberPreview}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {canShowMetadataForm ? (
              <div className="pt-1 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                {!isEditMode && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        {nameColumnLabel}
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(event) =>
                          setFormData((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                        placeholder={
                          currentUser?.name || "Auto from metadata if empty"
                        }
                        className={`${inputBaseClass} text-[12px] font-semibold`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        Date
                      </label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(event) =>
                          setFormData((prev) => ({
                            ...prev,
                            date: event.target.value,
                          }))
                        }
                        className={`${inputBaseClass} py-2 text-[12px] font-semibold`}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.14em]">
                    Metadata Input
                  </h4>

                  {activeSchemaFields.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                        No schema fields found for this document type. Configure
                        fields in Settings &gt; Registry &amp; Records.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {activeSchemaFields.map((field) => {
                        if (field.type === "section") {
                          return (
                            <div key={field.id} className="sm:col-span-2 pt-1">
                              <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-300 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
                                {field.label}
                              </p>
                            </div>
                          );
                        }

                        const value = detailValues[field.id] || "";
                        const label = `${field.label}${field.required ? " *" : ""}`;
                        const placeholder =
                          field.type === "multiselect"
                            ? "Comma-separated values"
                            : `Enter ${field.label.toLowerCase()}`;
                        const availableOptions = field.collectionSource
                          ? dataCollections[field.collectionSource] ||
                            field.options ||
                            []
                          : field.options || [];

                        if (field.type === "textarea") {
                          return (
                            <div
                              key={field.id}
                              className="space-y-1 sm:col-span-2"
                            >
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                                {label}
                              </label>
                              <textarea
                                value={value}
                                onChange={(event) =>
                                  setDetailValues((prev) => ({
                                    ...prev,
                                    [field.id]: event.target.value,
                                  }))
                                }
                                required={field.required}
                                placeholder={placeholder}
                                className={`${inputBaseClass} min-h-[72px] resize-y leading-relaxed`}
                              />
                            </div>
                          );
                        }

                        if (field.type === "checkbox") {
                          return (
                            <div key={field.id} className="space-y-1">
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                                {label}
                              </label>
                              <select
                                value={value || "No"}
                                onChange={(event) =>
                                  setDetailValues((prev) => ({
                                    ...prev,
                                    [field.id]: event.target.value,
                                  }))
                                }
                                className={`${inputBaseClass} font-semibold`}
                              >
                                <option>Yes</option>
                                <option>No</option>
                              </select>
                            </div>
                          );
                        }

                        if (
                          (field.type === "select" ||
                            field.type === "prefix") &&
                          availableOptions.length > 0
                        ) {
                          return (
                            <div key={field.id} className="space-y-1">
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                                {label}
                              </label>
                              <select
                                value={value}
                                onChange={(event) =>
                                  setDetailValues((prev) => ({
                                    ...prev,
                                    [field.id]: event.target.value,
                                  }))
                                }
                                required={field.required}
                                className={`${inputBaseClass} font-semibold`}
                              >
                                <option value="">Select {field.label}</option>
                                {availableOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        }

                        return (
                          <div key={field.id} className="space-y-1">
                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                              {label}
                            </label>
                            <input
                              type={getInputTypeByField(field)}
                              value={value}
                              onChange={(event) =>
                                setDetailValues((prev) => ({
                                  ...prev,
                                  [field.id]: event.target.value,
                                }))
                              }
                              required={field.required}
                              min={field.type === "rating" ? 1 : undefined}
                              max={field.type === "rating" ? 5 : undefined}
                              step={
                                field.type === "number" ||
                                field.type === "rating"
                                  ? "1"
                                  : undefined
                              }
                              placeholder={placeholder}
                              className={inputBaseClass}
                            />
                            {field.collectionSource && (
                              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                Source: {field.collectionSource}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!isEditMode && (
                  <div className="space-y-2.5 animate-in fade-in duration-300">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.14em]">
                        Initial Status <span className="text-red-500">*</span>
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setNewEntryStatus("Pending")}
                          className={`h-9 rounded-xl border text-[12px] font-black transition-all inline-flex items-center justify-center gap-2 ${
                            newEntryStatus === "Pending"
                              ? "border-zinc-500 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 shadow-sm"
                              : "border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
                          }
                          `}
                        >
                          <Clock size={13} /> Pending
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewEntryStatus("Completed")}
                          className={`h-9 rounded-xl border text-[12px] font-black transition-all inline-flex items-center justify-center gap-2 ${
                            newEntryStatus === "Completed"
                              ? "border-emerald-600 bg-emerald-500 text-white shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
                              : "border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-emerald-300 dark:hover:border-emerald-700"
                          }
                          `}
                        >
                          <Check size={14} /> Completed
                        </button>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      variant="blue"
                      disabled={isSubmittingRecord}
                      className={`w-full h-10 rounded-xl text-[12px] sm:text-[13px] font-black uppercase tracking-[0.1em] shadow-lg shadow-blue-500/25 ${isSubmittingRecord ? "animate-pulse" : ""}`}
                    >
                      {isSubmittingRecord ? (
                        <>
                          <Loader2 size={14} className="mr-2 animate-spin" />{" "}
                          Generating...
                        </>
                      ) : (
                        "Commit Record & Generate"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/30 px-4 py-4 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                Select a document classification to load metadata fields.
              </div>
            )}
          </form>

          {isEditMode && (
            <div className="xl:col-span-3 h-full flex flex-col pt-2 xl:pt-0 xl:border-l border-zinc-100 dark:border-zinc-800 xl:pl-5">
              <div className="space-y-3 flex-1">
                <label className="text-[11px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                  <Clock size={12} /> Modification Audit Trail & Reasoning
                </label>
                <textarea
                  value={formData.editComment}
                  onChange={(e) =>
                    setFormData({ ...formData, editComment: e.target.value })
                  }
                  className="w-full h-20 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none resize-none font-bold placeholder:font-normal focus:ring-1 focus:ring-amber-500 transition-all"
                  placeholder="State the reason for this record update for provincial audit purposes..."
                />

                <div className="mt-2 space-y-3">
                  <h5 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2">
                    Previous Audit History
                  </h5>
                  <div className="space-y-3 max-h-[260px] overflow-y-auto pr-2 custom-scrollbar">
                    {records
                      .find((r) => r.reg === editingReg)
                      ?.logs.map((log, i) => (
                        <div
                          key={i}
                          className="flex gap-3 p-3 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800/50 group hover:border-blue-500/30 transition-all"
                        >
                          <div className="flex flex-col items-center">
                            <div
                              className={`w-2.5 h-2.5 rounded-full ${i === 0 ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-700"} ring-4 ring-white dark:ring-zinc-950`}
                            />
                            {i !==
                              records.find((r) => r.reg === editingReg)!.logs
                                .length -
                                1 && (
                              <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800 my-1" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-black text-zinc-900 dark:text-white uppercase text-[10px] tracking-tight bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-100 dark:border-zinc-700 shadow-sm">
                                {log.action}
                              </span>
                              <span className="text-zinc-400 text-[10px] font-bold">
                                {log.timestamp}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-zinc-500 dark:text-zinc-400 text-[11px] font-bold italic leading-relaxed">
                                {log.comment
                                  ? `"${log.comment}"`
                                  : "No comment provided"}
                              </p>
                              <p className="text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase tracking-widest">
                                Auth: {log.user}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Success Modal */}
      <Modal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        title=" "
        maxWidth="max-w-3xl"
        className="rounded-[24px] border border-zinc-200/80 dark:border-zinc-800/80"
        headerClassName="bg-zinc-100/60 dark:bg-zinc-900/60 border-zinc-200/70 dark:border-zinc-800/80"
        titleClassName="text-transparent"
        closeButtonClassName="text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20"
        bodyClassName="px-5 sm:px-7 py-5 sm:py-6"
      >
        <div className="space-y-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full border border-emerald-200 dark:border-emerald-600/30 bg-emerald-100/70 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 size={30} />
            </div>
            <h4 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
              System Authentication
            </h4>
            <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
              Unique Identification Generated
            </p>
          </div>

          <div className="rounded-[22px] border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-4 sm:p-5 text-center">
            <p className="text-[13px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.16em]">
              Reference Number
            </p>
            <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
              <span className="max-w-full text-3xl sm:text-4xl font-black tracking-tight text-blue-700 dark:text-blue-400 break-all leading-tight">
                {lastCreated?.reg || "-"}
              </span>
              <button
                type="button"
                onClick={handleCopyReference}
                className="w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-blue-600 hover:border-blue-300 dark:hover:border-blue-600 transition-all inline-flex items-center justify-center"
                title="Copy reference number"
              >
                <Copy size={15} />
              </button>
            </div>
            <div className="mt-3 flex justify-center">
              <div className="max-w-[300px] inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
                <Clock size={12} />
                <span
                  className="break-words leading-tight"
                  title={lastCreatedAtLabel || lastCreated?.date || "-"}
                >
                  {lastCreatedAtLabel || lastCreated?.date || "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <h5 className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.14em]">
              Metadata Summary
            </h5>
            {successMetadataRows.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No metadata available.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {successMetadataRows.map((item) => (
                  <div
                    key={`${item.label}-${item.value}`}
                    className="space-y-1"
                  >
                    <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.08em] leading-none">
                      {item.label}
                    </p>
                    <p className="text-lg sm:text-xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight break-words leading-tight">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-10 text-[12px] font-black uppercase tracking-[0.12em]"
              onClick={() => setIsSuccessModalOpen(false)}
            >
              Close Window
            </Button>
            <Button
              variant="blue"
              className="h-10 text-[12px] font-black uppercase tracking-[0.12em] shadow-lg shadow-blue-500/20"
              onClick={handleCreateAnotherRecord}
            >
              <Plus size={14} className="mr-1.5" /> New Record
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
