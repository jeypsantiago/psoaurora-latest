import React, {
  Suspense,
  lazy,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  Database,
  Package,
  Building2,
  Users,
  ShieldCheck,
  Save,
  ChevronRight,
  CheckCircle2,
  Trash2,
  Plus,
  GripVertical,
  Mail,
  AlertTriangle,
  RefreshCw,
  Briefcase,
  Monitor,
  ClipboardCheck,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  Modal,
  Input,
} from "../components/ui";
import { useDialog } from "../DialogContext";
import { useUsers, User, Role } from "../UserContext";
import {
  PERMISSION_GROUPS,
  Permission,
  PERMISSION_DESCRIPTIONS,
  EmploymentConfig,
  ReportReminderSettings,
} from "../types";
import {
  DEFAULT_REPORT_REMINDER_SETTINGS,
  normalizeReportReminderSettings,
} from "../services/reportMonitoring";
import {
  getDefaultGmailWhitelist,
  normalizeGmailWhitelist,
} from "../services/gmailWhitelist";
import { useToast } from "../ToastContext";
import { useLandingConfig, type LandingConfig } from "../LandingConfigContext";
import { STORAGE_KEYS } from "../constants/storageKeys";
import {
  clearAllManagedAppState,
  upsertAppStateFromStorageValue,
} from "../services/appState";
import { backend, BACKEND_URL } from "../services/backend";
import {
  getStorageItem,
  removeStorageItem,
  readStorageJson,
  readStorageJsonSafe,
  readStorageString,
  setStorageItem,
  writeStorageJson,
} from "../services/storage";
import {
  deleteLandingAssetBySource,
  dataImageUrlToFile,
  isBackendFilePath,
  isDataImageUrl,
  resolveMediaSource,
  uploadLandingAssetFile,
} from "../services/mediaAssets";
import { useFileUpload } from "../hooks/useFileUpload";
import { inspectPublicCensusFeed } from "../services/censusData";
import {
  readRegistryDocTypesFromStorage,
  type RegistryDocTypeConfig,
} from "../services/registryRecords";
import { fetchPublicAppStateRecord as fetchPublicBackendAppStateRecord } from "../services/publicAppState";
import {
  getDefaultRoleBadgeColor,
  getRoleBadgeStyle,
  ROLE_BADGE_COLOR_OPTIONS,
  ROLE_BADGE_NEON_COLOR_OPTIONS,
} from "../utils/roleBadges";

const loadSecurityAccessTab = () =>
  import("./settings/SecurityAccessTab").then((module) => ({
    default: module.SecurityAccessTab,
  }));
const loadRecordSettingsTab = () => import("./settings/RecordSettingsTab");
const loadSupplySettingsTab = () => import("./settings/SupplySettingsTab");
const loadEmploymentSettingsTab = () =>
  import("./settings/EmploymentSettingsTab");
const loadPropertySettingsTab = () => import("./settings/PropertySettingsTab");
const loadReportMonitoringSettingsTab = () =>
  import("./settings/ReportMonitoringSettingsTab");
const loadGmailHubTab = () =>
  import("./settings/GmailHubTab").then((module) => ({
    default: module.GmailHubTab,
  }));
const loadPortalConfigurationTab = () =>
  import("./settings/PortalConfigurationTab").then((module) => ({
    default: module.PortalConfigurationTab,
  }));
const loadConnectivityTab = () =>
  import("./settings/ConnectivityTab").then((module) => ({
    default: module.ConnectivityTab,
  }));

const SecurityAccessTab = lazy(loadSecurityAccessTab);
const RecordSettingsTab = lazy(loadRecordSettingsTab);
const SupplySettingsTab = lazy(loadSupplySettingsTab);
const EmploymentSettingsTab = lazy(loadEmploymentSettingsTab);
const PropertySettingsTab = lazy(loadPropertySettingsTab);
const ReportMonitoringSettingsTab = lazy(loadReportMonitoringSettingsTab);
const GmailHubTab = lazy(loadGmailHubTab);
const PortalConfigurationTab = lazy(loadPortalConfigurationTab);
const ConnectivityTab = lazy(loadConnectivityTab);

const SETTINGS_TAB_PREFETCHERS: Record<string, () => Promise<unknown>> = {
  record: loadRecordSettingsTab,
  supply: loadSupplySettingsTab,
  employment: loadEmploymentSettingsTab,
  property: loadPropertySettingsTab,
  reports: loadReportMonitoringSettingsTab,
  users: loadSecurityAccessTab,
  gmail: loadGmailHubTab,
  portal: loadPortalConfigurationTab,
  connectivity: loadConnectivityTab,
};

interface SettingsTabErrorBoundaryProps {
  children: React.ReactNode;
  label: string;
}

interface SettingsTabErrorBoundaryState {
  error: Error | null;
  resetKey: number;
}

const SettingsTabErrorBoundaryBase = React.Component as unknown as new (
  props: SettingsTabErrorBoundaryProps,
) => {
  props: Readonly<SettingsTabErrorBoundaryProps>;
  state: Readonly<SettingsTabErrorBoundaryState>;
  setState: (
    state:
      | Partial<SettingsTabErrorBoundaryState>
      | ((state: Readonly<SettingsTabErrorBoundaryState>) => Partial<SettingsTabErrorBoundaryState>),
  ) => void;
};

class SettingsTabErrorBoundary extends SettingsTabErrorBoundaryBase {
  state: SettingsTabErrorBoundaryState = {
    error: null,
    resetKey: 0,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.warn(`${this.props.label} could not load.`, error);
  }

  retry = () => {
    this.setState((state) => ({
      error: null,
      resetKey: state.resetKey + 1,
    }));
  };

  render() {
    if (this.state.error) {
      return (
        <Card
          title={`${this.props.label} could not load`}
          description="This settings panel hit a loading problem. The rest of Settings is still available."
          action={
            <Button variant="outline" onClick={this.retry}>
              <RefreshCw size={14} className="mr-2" /> Retry
            </Button>
          }
        >
          <p className="text-xs font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
            {this.state.error.message ||
              "Reload this panel or refresh the page if the issue continues."}
          </p>
        </Card>
      );
    }

    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

interface FormField {
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
  options?: string[]; // For manual select type
  collectionSource?: string; // Connected data collection key
}

type DocType = RegistryDocTypeConfig;

interface RISConfig {
  prefix: string;
  separator: string;
  padding: number;
  increment: number;
  startNumber: number;
}

const DEFAULT_DOC_FIELDS: Record<string, FormField[]> = {
  birth: [
    { id: "1", label: "First Name", type: "text", required: true },
    { id: "2", label: "Last Name", type: "text", required: true },
    { id: "3", label: "Date of Birth", type: "date", required: true },
    { id: "4", label: "Place of Birth", type: "text", required: true },
  ],
  marriage: [
    { id: "5", label: "Groom Name", type: "text", required: true },
    { id: "6", label: "Bride Name", type: "text", required: true },
    { id: "7", label: "Date of Marriage", type: "date", required: true },
  ],
  death: [
    { id: "8", label: "Name of Deceased", type: "text", required: true },
    { id: "9", label: "Date of Death", type: "date", required: true },
  ],
  cenomar: [{ id: "10", label: "Subject Name", type: "text", required: true }],
};

const SettingsTabFallback: React.FC<{ label: string }> = ({ label }) => (
  <Card className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 p-6">
    <div className="flex items-center gap-3">
      <span className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      <div className="space-y-1">
        <p className="text-sm font-bold text-zinc-900 dark:text-white">
          Loading settings module
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
    </div>
  </Card>
);

type PublicLandingSyncState =
  | "idle"
  | "checking"
  | "published"
  | "outdated"
  | "missing"
  | "private_only"
  | "error";

type PublicCensusSyncState =
  | "idle"
  | "checking"
  | "published"
  | "missing"
  | "private_only"
  | "invalid"
  | "stale"
  | "error";

type BackendConnectionState =
  | "idle"
  | "checking"
  | "connected"
  | "degraded"
  | "disconnected";

interface PublicLandingSyncStatus {
  state: PublicLandingSyncState;
  message: string;
  checkedAt: number | null;
  backendRecordId: string | null;
}

interface PublicCensusSyncStatus {
  state: PublicCensusSyncState;
  message: string;
  checkedAt: number | null;
  mastersRecordId: string | null;
  cyclesRecordId: string | null;
  activeCycleCount: number;
}

interface BackendConnectionStatus {
  state: BackendConnectionState;
  message: string;
  checkedAt: number | null;
  latencyMs: number | null;
  httpStatus: number | null;
}

type OpsRunnerState = "idle" | "checking" | "online" | "offline";

interface OpsRunnerStatus {
  state: OpsRunnerState;
  message: string;
  checkedAt: number | null;
  runnerVersion: string | null;
}

type OpsCommandState = "idle" | "running" | "success" | "error";

const quotedFilterValue = (value: string) =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const fetchPublicAppStateRecord = async (
  key: string,
): Promise<{
  ok: boolean;
  status: number;
  record: { id?: string; value?: unknown } | null;
}> => {
  return fetchPublicBackendAppStateRecord(key);
};

const stableNormalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => stableNormalize(entry));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return entries.reduce<Record<string, unknown>>((acc, [key, entry]) => {
      acc[key] = stableNormalize(entry);
      return acc;
    }, {});
  }

  return value;
};

const stableStringify = (value: unknown): string =>
  JSON.stringify(stableNormalize(value));

const safeParseJson = (value: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractManagedBackendAssetSource = (source: string): string | null => {
  const trimmed = source.trim();
  if (!trimmed) return null;

  if (isBackendFilePath(trimmed)) {
    return resolveMediaSource(trimmed);
  }

  return null;
};

const collectLandingAssetRecordIds = (config: LandingConfig): Set<string> => {
  const sources = [
    config.hero.backgroundImage || "",
    ...config.team.members.map((member) => member.image || ""),
  ];

  const ids = new Set<string>();
  for (const source of sources) {
    const recordId = extractManagedBackendAssetSource(source);
    if (recordId) {
      ids.add(recordId);
    }
  }

  return ids;
};

const getRemovedLandingAssetRecordIds = (
  previousConfig: LandingConfig,
  nextConfig: LandingConfig,
): string[] => {
  const previousIds = collectLandingAssetRecordIds(previousConfig);
  if (previousIds.size === 0) return [];

  const nextIds = collectLandingAssetRecordIds(nextConfig);
  return Array.from(previousIds).filter((recordId) => !nextIds.has(recordId));
};

const optimizeImageFileToDataUrl = (
  sourceFile: File,
  options?: { maxDimension?: number; maxDataUrlLength?: number },
): Promise<string> => {
  const maxDimension = options?.maxDimension ?? 1200;
  const maxDataUrlLength = options?.maxDataUrlLength ?? 900_000;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const source = reader.result;
      if (typeof source !== "string") {
        reject(new Error("invalid-image-source"));
        return;
      }

      const image = new Image();
      image.onload = () => {
        const scale = Math.min(
          1,
          maxDimension / Math.max(image.width, image.height),
        );
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas-not-supported"));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, width, height);

        const pixelData = ctx.getImageData(0, 0, width, height).data;
        let hasTransparency = false;
        for (let i = 3; i < pixelData.length; i += 4) {
          if (pixelData[i] < 250) {
            hasTransparency = true;
            break;
          }
        }

        const mimeType = hasTransparency ? "image/webp" : "image/jpeg";
        let quality = 0.86;
        let output = canvas.toDataURL(mimeType, quality);

        while (output.length > maxDataUrlLength && quality > 0.45) {
          quality -= 0.08;
          output = canvas.toDataURL(mimeType, quality);
        }

        if (output.length > maxDataUrlLength && hasTransparency) {
          output = canvas.toDataURL("image/png");
        }

        resolve(output);
      };
      image.onerror = () => reject(new Error("image-load-failed"));
      image.src = source;
    };
    reader.onerror = () => reject(new Error("file-read-failed"));
    reader.readAsDataURL(sourceFile);
  });
};

type TeamMember = LandingConfig["team"]["members"][number];
type FooterRelatedLink = LandingConfig["footer"]["relatedLinks"][number];
type FooterAboutLink = LandingConfig["footer"]["aboutLinks"][number];
type FooterContactInfo = LandingConfig["footer"]["contactInfo"][number];
type FooterEditSection = "relatedLinks" | "aboutLinks" | "contactInfo";

export const SettingsPage: React.FC = () => {
  const { alert, confirm, prompt } = useDialog();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("record");
  const settingsPrefetchStartedRef = useRef(false);

  // Sync activeTab with URL parameter ?tab=...
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (
      tabParam &&
      [
        "record",
        "supply",
        "employment",
        "property",
        "reports",
        "users",
        "gmail",
        "portal",
        "connectivity",
      ].includes(tabParam)
    ) {
      setActiveTab(tabParam);
      // Optional: Clear the param after reading to keep URL clean,
      // but usually better to keep it for refresh persistence
    }
  }, [searchParams]);

  useEffect(() => {
    if (settingsPrefetchStartedRef.current) return;
    settingsPrefetchStartedRef.current = true;

    const prefetchAllTabs = () => {
      Object.entries(SETTINGS_TAB_PREFETCHERS).forEach(([tabId, prefetch]) => {
        void prefetch().catch((error) => {
          console.warn(`Unable to prefetch settings tab "${tabId}".`, error);
        });
      });
    };

    const browserWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof browserWindow.requestIdleCallback === "function") {
      const idleId = browserWindow.requestIdleCallback(prefetchAllTabs, {
        timeout: 2000,
      });

      return () => {
        browserWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(prefetchAllTabs, 1800);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const prefetchSettingsTab = useCallback((tabId: string) => {
    void SETTINGS_TAB_PREFETCHERS[tabId]?.().catch((error) => {
      console.warn(`Unable to prefetch settings tab "${tabId}".`, error);
    });
  }, []);
  const [recordSubTab, setRecordSubTab] = useState("docs");
  const [supplySubTab, setSupplySubTab] = useState("ris");
  const [usersSubTab, setUsersSubTab] = useState("accounts");
  const [employmentSubTab, setEmploymentSubTab] = useState("config");
  const [propertySubTab, setPropertySubTab] = useState("numbering");

  const [reportSettings, setReportSettings] = useState<ReportReminderSettings>(
    () => {
      const savedSettings = readStorageJsonSafe<ReportReminderSettings>(
        STORAGE_KEYS.reportSettings,
        DEFAULT_REPORT_REMINDER_SETTINGS,
      );
      return normalizeReportReminderSettings(savedSettings);
    },
  );

  // -- State for Registry Settings --
  const [docTypes, setDocTypes] = useState<DocType[]>(() =>
    readRegistryDocTypesFromStorage(),
  );

  const [docFields, setDocFields] = useState<Record<string, FormField[]>>(
    () => {
      const parsed = readStorageJsonSafe<unknown>(
        STORAGE_KEYS.recordDocFields,
        DEFAULT_DOC_FIELDS,
      );
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, FormField[]>)
        : DEFAULT_DOC_FIELDS;
    },
  );

  // -- Data Collections State --
  const [dataCollections, setDataCollections] = useState<
    Record<string, string[]>
  >(() => {
    return readStorageJson<Record<string, string[]>>(
      STORAGE_KEYS.dataCollections,
      {
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
      },
    );
  });
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );

  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState("birth");

  // New Field State
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FormField["type"]>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [newFieldCollection, setNewFieldCollection] = useState("");

  useEffect(() => {
    if (docTypes.length === 0) {
      setSelectedDocId("");
      if (isBuilderOpen) {
        setIsBuilderOpen(false);
      }
      return;
    }

    if (!docTypes.some((doc) => doc.id === selectedDocId)) {
      setSelectedDocId(docTypes[0].id);
    }
  }, [docTypes, selectedDocId, isBuilderOpen]);

  // Rename State
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [docToRename, setDocToRename] = useState<DocType | null>(null);
  const [renamedValue, setRenamedValue] = useState("");

  // Ref Generator State
  const [isRefModalOpen, setIsRefModalOpen] = useState(false);
  const [docForRef, setDocForRef] = useState<DocType | null>(null);

  // -- State for Supply Settings --
  const [risConfig, setRisConfig] = useState<RISConfig>(() => {
    return readStorageJson<RISConfig>(STORAGE_KEYS.supplyRisConfig, {
      prefix: "RIS",
      separator: "-",
      padding: 6,
      increment: 1,
      startNumber: 1,
    });
  });
  const [unitMaster, setUnitMaster] = useState<string[]>(() => {
    return readStorageJson<string[]>(STORAGE_KEYS.supplyUnitMaster, [
      "Reams",
      "Forms",
      "Units",
      "Rolls",
      "Boxes",
      "Packs",
      "Bottles",
    ]);
  });
  const [_restockThreshold, _setRestockThreshold] = useState(20);
  const [_hubIntegration, _setHubIntegration] = useState(true);

  // -- State for Employment Settings --
  const [employmentConfig, setEmploymentConfig] = useState<EmploymentConfig>(
    () => {
      return readStorageJson<EmploymentConfig>(STORAGE_KEYS.employmentConfig, {
        prefix: "EMP",
        separator: "-",
        padding: 4,
        increment: 1,
        startNumber: 1,
      });
    },
  );

  const [surveyProjects, setSurveyProjects] = useState<string[]>(() => {
    return readStorageJson<string[]>(STORAGE_KEYS.employmentSurveyProjects, [
      "CBMS 2024",
      "PhilSys Registration",
      "Labor Force Survey",
    ]);
  });

  const [focalPersons, setFocalPersons] = useState<string[]>(() => {
    return readStorageJson<string[]>(STORAGE_KEYS.employmentFocalPersons, [
      "Juan Dela Cruz",
      "Maria Santos",
    ]);
  });

  const [designations, setDesignations] = useState<string[]>(() => {
    return readStorageJson<string[]>(STORAGE_KEYS.employmentDesignations, [
      "Admin Clerk",
      "Statistician",
      "Field Officer",
      "Provincial Lead",
    ]);
  });

  // -- State for Gmail Settings --
  const [whitelist, setWhitelist] = useState<string[]>(() => {
    return normalizeGmailWhitelist(
      readStorageJsonSafe<unknown>(
        STORAGE_KEYS.gmailWhitelist,
        getDefaultGmailWhitelist(),
      ),
    );
  });

  useEffect(() => {
    const normalizedWhitelist = normalizeGmailWhitelist(whitelist, []);
    if (normalizedWhitelist.length !== whitelist.length) {
      setWhitelist(normalizedWhitelist);
      return;
    }

    writeStorageJson(STORAGE_KEYS.gmailWhitelist, normalizedWhitelist);
  }, [whitelist]);

  useEffect(() => {
    const normalizedSettings = normalizeReportReminderSettings(reportSettings);
    if (
      normalizedSettings.subjectTemplate !== reportSettings.subjectTemplate ||
      normalizedSettings.bodyTemplate !== reportSettings.bodyTemplate
    ) {
      setReportSettings(normalizedSettings);
      return;
    }

    writeStorageJson(STORAGE_KEYS.reportSettings, normalizedSettings);
    const syncTimer = window.setTimeout(() => {
      void upsertAppStateFromStorageValue(
        STORAGE_KEYS.reportSettings,
        JSON.stringify(normalizedSettings),
      ).catch((error) => {
        console.warn("Unable to sync report reminder settings to backend.", error);
      });
    }, 300);

    return () => window.clearTimeout(syncTimer);
  }, [reportSettings]);

  useEffect(() => {
    writeStorageJson(STORAGE_KEYS.recordDocTypes, docTypes);
  }, [docTypes]);

  useEffect(() => {
    writeStorageJson(STORAGE_KEYS.recordDocFields, docFields);
  }, [docFields]);

  const handleAddWhitelistEntry = useCallback(async () => {
    const newEmail = await prompt(
      "Add Approved Sender",
      "Enter email address:",
      "",
    );

    if (
      newEmail &&
      typeof newEmail === "string"
    ) {
      const [normalizedEmail] = normalizeGmailWhitelist([newEmail], []);
      if (normalizedEmail && !whitelist.includes(normalizedEmail)) {
        setWhitelist([...whitelist, normalizedEmail]);
      }
    }
  }, [prompt, whitelist]);

  const handleRemoveWhitelistEntry = useCallback(
    (email: string) => {
      setWhitelist(whitelist.filter((entry) => entry !== email));
    },
    [whitelist],
  );

  // -- State for Property Settings --
  const [propertyConfig, setPropertyConfig] = useState<{
    ppePrefix: string;
    sePrefix: string;
    icsPrefix: string;
    parPrefix: string;
    separator: string;
    padding: number;
    increment: number;
    startNumber: number;
    includeYear: boolean;
    entityName: string;
    custodySeparator: string;
    custodyPadding: number;
    custodyStartNumber: number;
    custodyIncludeYear: boolean;
    locations: string[];
    auditSchedule: string;
  }>(() => {
    return readStorageJson(STORAGE_KEYS.propertyConfig, {
      ppePrefix: "PSA-PPE",
      sePrefix: "PSA-SE",
      icsPrefix: "ICS",
      parPrefix: "PAR",
      separator: "-",
      padding: 4,
      increment: 1,
      startNumber: 1,
      includeYear: true,
      entityName: "Philippine Statistics Authority",
      custodySeparator: "-",
      custodyPadding: 3,
      custodyStartNumber: 1,
      custodyIncludeYear: true,
      locations: [
        "RSSO V — Admin Office",
        "RSSO V — ICT Unit",
        "RSSO V — Records Section",
        "RSSO V — Field Operations",
        "RSSO V — Conference Room",
        "RSSO V — Server Room",
        "RSSO V — Motor Pool",
        "RSSO V — Printing Section",
        "RSSO V — Statistics Division",
        "RSSO V — Chief Office",
      ],
      auditSchedule: "Semi-Annual (Every 6 months)",
    });
  });

  const [propertyCategories, setPropertyCategories] = useState<
    {
      id: string;
      name: string;
      assetClass: "PPE" | "Semi-Expendable";
      usefulLife?: number;
    }[]
  >(() => {
    return readStorageJson(STORAGE_KEYS.propertyCategories, [
      { id: "cat-1", name: "IT Equipment", assetClass: "PPE", usefulLife: 5 },
      {
        id: "cat-2",
        name: "Furniture & Fixtures",
        assetClass: "PPE",
        usefulLife: 10,
      },
      { id: "cat-3", name: "Motor Vehicles", assetClass: "PPE", usefulLife: 7 },
      {
        id: "cat-4",
        name: "Office Equipment",
        assetClass: "Semi-Expendable",
        usefulLife: 2,
      },
      {
        id: "cat-5",
        name: "Communication Equipment",
        assetClass: "Semi-Expendable",
        usefulLife: 3,
      },
      {
        id: "cat-6",
        name: "Books & Periodicals",
        assetClass: "PPE",
        usefulLife: 10,
      },
      {
        id: "cat-7",
        name: "Building & Structures",
        assetClass: "PPE",
        usefulLife: 30,
      },
    ]);
  });

  // -- State for User Management (Now handled by UserContext) --
  const {
    users,
    roles,
    currentUser,
    addUser,
    updateUser,
    deleteUser,
    addRole,
    updateRole,
    deleteRole,
  } = useUsers();
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userFormData, setUserFormData] = useState({
    name: "",
    email: "",
    roles: [] as string[],
    gender: "Male",
    position: "",
    password: "",
  });

  // Role Management State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleFormData, setRoleFormData] = useState<Omit<Role, "id">>({
    name: "",
    description: "",
    permissions: [],
    badgeColor: getDefaultRoleBadgeColor("", 0),
  });

  // -- Feedback State --
  const [isSaved, setIsSaved] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [pendingSettingsSyncCount, setPendingSettingsSyncCount] = useState(0);
  const [isWipingAllData, setIsWipingAllData] = useState(false);
  const settingsSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isSyncingSettings = pendingSettingsSyncCount > 0;
  const isSuperAdmin =
    !!currentUser && currentUser.roles.includes("Super Admin");

  const { config: landingConfig, updateConfig: updateLandingConfig } =
    useLandingConfig();
  const [landingConfigForm, setLandingConfigForm] = useState(landingConfig);
  const [backendConnection, setBackendConnection] =
    useState<BackendConnectionStatus>({
      state: "idle",
      message: "Not checked yet.",
      checkedAt: null,
      latencyMs: null,
      httpStatus: null,
    });
  const [publicLandingSync, setPublicLandingSync] =
    useState<PublicLandingSyncStatus>({
      state: "idle",
      message: "Not checked yet.",
      checkedAt: null,
      backendRecordId: null,
    });
  const [publicCensusSync, setPublicCensusSync] =
    useState<PublicCensusSyncStatus>({
      state: "idle",
      message: "Not checked yet.",
      checkedAt: null,
      mastersRecordId: null,
      cyclesRecordId: null,
      activeCycleCount: 0,
    });
  const [opsRunnerStatus, setOpsRunnerStatus] = useState<OpsRunnerStatus>({
    state: "idle",
    message: "Not checked yet.",
    checkedAt: null,
    runnerVersion: null,
  });
  const [opsCommandState, setOpsCommandState] =
    useState<OpsCommandState>("idle");
  const [opsCommandLabel, setOpsCommandLabel] = useState("");
  const [opsCommandOutput, setOpsCommandOutput] = useState("");
  const [opsRunnerToken, setOpsRunnerToken] = useState("");
  const [opsRunnerUrl, setOpsRunnerUrl] = useState(() => {
    return readStorageString(
      STORAGE_KEYS.opsRunnerUrl,
      "http://127.0.0.1:4310",
    );
  });
  const [backendUrlDraft, setBackendUrlDraft] = useState(() =>
    readStorageString(STORAGE_KEYS.backendUrlOverride, BACKEND_URL),
  );
  const [heroPreviewFailedSrc, setHeroPreviewFailedSrc] = useState<
    string | null
  >(null);
  const backendOverrideValue = readStorageString(
    STORAGE_KEYS.backendUrlOverride,
  ).trim();
  const hasBackendOverride = backendOverrideValue.length > 0;
  const hasUnsavedLandingChanges = useMemo(
    () => stableStringify(landingConfigForm) !== stableStringify(landingConfig),
    [landingConfigForm, landingConfig],
  );

  useEffect(() => {
    try {
      setStorageItem(
        STORAGE_KEYS.opsRunnerUrl,
        opsRunnerUrl.trim() || "http://127.0.0.1:4310",
      );
    } catch {
      // Ignore persistence failures for the local runner URL.
    }
  }, [opsRunnerUrl]);

  const teamSampleImages = [
    "/PSA.webp",
    "/PSA.webp",
    "/PSA.webp",
    "/PSA.webp",
  ];
  const teamVisualStyles: Array<"psa" | "amber" | "mint" | "ocean" | "rose"> = [
    "psa",
    "amber",
    "mint",
    "ocean",
    "rose",
  ];
  const getGenderBasedStyle = (
    gender: "male" | "female" | "neutral",
    index: number,
  ) => {
    if (gender === "male")
      return (index % 2 === 0 ? "ocean" : "mint") as "ocean" | "mint";
    if (gender === "female")
      return (index % 2 === 0 ? "amber" : "rose") as "amber" | "rose";
    return teamVisualStyles[index % teamVisualStyles.length] as
      | "psa"
      | "amber"
      | "mint"
      | "ocean"
      | "rose";
  };
  const [portalDrag, setPortalDrag] = useState<{
    section:
      | "metrics"
      | "relatedLinks"
      | "aboutLinks"
      | "contactInfo"
      | "teamMembers";
    index: number;
  } | null>(null);
  const [editingTeamMemberId, setEditingTeamMemberId] = useState<string | null>(
    null,
  );
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [editingFooterItem, setEditingFooterItem] = useState<{
    section: FooterEditSection;
    index: number;
  } | null>(null);
  const editingTeamMemberIndex = useMemo(
    () =>
      landingConfigForm.team.members.findIndex(
        (member) => member.id === editingTeamMemberId,
      ),
    [landingConfigForm.team.members, editingTeamMemberId],
  );
  const editingTeamMember =
    editingTeamMemberIndex >= 0
      ? landingConfigForm.team.members[editingTeamMemberIndex]
      : null;
  const heroUpload = useFileUpload("landing-hero", {
    label: "hero-background",
  });
  const teamImageUpload = useFileUpload("landing-team-member", {
    slotId: editingTeamMember?.id || "team-member",
    label: editingTeamMember?.name || "team-member",
  });
  const heroUploadPrepare = heroUpload.prepare;
  const teamImageUploadPrepare = teamImageUpload.prepare;

  const reorderItems = <T,>(items: T[], from: number, to: number): T[] => {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= items.length ||
      to >= items.length
    )
      return items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const movePortalItem = (
    section:
      | "metrics"
      | "relatedLinks"
      | "aboutLinks"
      | "contactInfo"
      | "teamMembers",
    from: number,
    to: number,
  ) => {
    if (from === to) return;

    if (section === "metrics") {
      const metrics = reorderItems(
        landingConfigForm.highlights.metrics,
        from,
        to,
      );
      setLandingConfigForm({
        ...landingConfigForm,
        highlights: { ...landingConfigForm.highlights, metrics },
      });
      return;
    }

    if (section === "relatedLinks") {
      const relatedLinks = reorderItems(
        landingConfigForm.footer.relatedLinks,
        from,
        to,
      );
      setLandingConfigForm({
        ...landingConfigForm,
        footer: { ...landingConfigForm.footer, relatedLinks },
      });
      return;
    }

    if (section === "aboutLinks") {
      const aboutLinks = reorderItems(
        landingConfigForm.footer.aboutLinks,
        from,
        to,
      );
      setLandingConfigForm({
        ...landingConfigForm,
        footer: { ...landingConfigForm.footer, aboutLinks },
      });
      return;
    }

    if (section === "teamMembers") {
      const members = reorderItems(landingConfigForm.team.members, from, to);
      setLandingConfigForm({
        ...landingConfigForm,
        team: { ...landingConfigForm.team, members },
      });
      return;
    }

    const contactInfo = reorderItems(
      landingConfigForm.footer.contactInfo,
      from,
      to,
    );
    setLandingConfigForm({
      ...landingConfigForm,
      footer: { ...landingConfigForm.footer, contactInfo },
    });
  };

  const updateFooterRelatedLink = (
    linkIndex: number,
    updates: Partial<FooterRelatedLink>,
  ) => {
    setLandingConfigForm((prev) => {
      const relatedLinks = [...prev.footer.relatedLinks];
      relatedLinks[linkIndex] = { ...relatedLinks[linkIndex], ...updates };
      return { ...prev, footer: { ...prev.footer, relatedLinks } };
    });
  };

  const updateFooterAboutLink = (
    linkIndex: number,
    updates: Partial<FooterAboutLink>,
  ) => {
    setLandingConfigForm((prev) => {
      const aboutLinks = [...prev.footer.aboutLinks];
      aboutLinks[linkIndex] = { ...aboutLinks[linkIndex], ...updates };
      return { ...prev, footer: { ...prev.footer, aboutLinks } };
    });
  };

  const updateFooterContact = (
    contactIndex: number,
    updates: Partial<FooterContactInfo>,
  ) => {
    setLandingConfigForm((prev) => {
      const contactInfo = [...prev.footer.contactInfo];
      contactInfo[contactIndex] = { ...contactInfo[contactIndex], ...updates };
      return { ...prev, footer: { ...prev.footer, contactInfo } };
    });
  };

  const removeFooterItem = (section: FooterEditSection, itemIndex: number) => {
    if (section === "relatedLinks") {
      if (landingConfigForm.footer.relatedLinks.length <= 1) return;
      const relatedLinks = landingConfigForm.footer.relatedLinks.filter(
        (_, idx) => idx !== itemIndex,
      );
      setLandingConfigForm({
        ...landingConfigForm,
        footer: { ...landingConfigForm.footer, relatedLinks },
      });
    } else if (section === "aboutLinks") {
      if (landingConfigForm.footer.aboutLinks.length <= 1) return;
      const aboutLinks = landingConfigForm.footer.aboutLinks.filter(
        (_, idx) => idx !== itemIndex,
      );
      setLandingConfigForm({
        ...landingConfigForm,
        footer: { ...landingConfigForm.footer, aboutLinks },
      });
    } else {
      if (landingConfigForm.footer.contactInfo.length <= 1) return;
      const contactInfo = landingConfigForm.footer.contactInfo.filter(
        (_, idx) => idx !== itemIndex,
      );
      setLandingConfigForm({
        ...landingConfigForm,
        footer: { ...landingConfigForm.footer, contactInfo },
      });
    }

    if (
      editingFooterItem &&
      editingFooterItem.section === section &&
      editingFooterItem.index === itemIndex
    ) {
      setEditingFooterItem(null);
    }
  };

  const updateTeamMemberProjectsFromText = (
    memberIndex: number,
    rawValue: string,
  ) => {
    const projects = rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    setLandingConfigForm((prev) => {
      const members = [...prev.team.members];
      members[memberIndex] = { ...members[memberIndex], projects };
      return { ...prev, team: { ...prev.team, members } };
    });
  };

  const updateTeamMember = (
    memberIndex: number,
    updates: Partial<TeamMember>,
  ) => {
    setLandingConfigForm((prev) => {
      const members = [...prev.team.members];
      members[memberIndex] = { ...members[memberIndex], ...updates };
      return { ...prev, team: { ...prev.team, members } };
    });
  };

  const addTeamMember = () => {
    const nextIndex = landingConfigForm.team.members.length;
    const gender: "male" | "female" | "neutral" =
      nextIndex % 2 === 0 ? "female" : "male";
    const members = [
      ...landingConfigForm.team.members,
      {
        id: `member-${Date.now()}`,
        name: "New Team Member",
        designation: "Designation",
        gender,
        backgroundMode:
          nextIndex === 0 &&
          landingConfigForm.team.firstCardBackgroundMode === "psa"
            ? "logo"
            : "color",
        image: teamSampleImages[nextIndex % teamSampleImages.length],
        projects: ["New Project"],
        visualStyle: getGenderBasedStyle(gender, nextIndex),
        imageScale: 1.03,
        imageOffsetY: 0,
      },
    ];

    setLandingConfigForm({
      ...landingConfigForm,
      team: { ...landingConfigForm.team, members },
    });
    setEditingTeamMemberId(members[members.length - 1].id);
  };

  const removeTeamMember = (index: number) => {
    if (landingConfigForm.team.members.length <= 1) return;
    const removedMember = landingConfigForm.team.members[index];
    const members = landingConfigForm.team.members.filter(
      (_, memberIndex) => memberIndex !== index,
    );
    setLandingConfigForm({
      ...landingConfigForm,
      team: { ...landingConfigForm.team, members },
    });
    if (removedMember?.id && removedMember.id === editingTeamMemberId) {
      setEditingTeamMemberId(null);
    }
  };

  const validateImageFile = (
    file: File | undefined,
    maxImageSizeBytes: number,
  ): file is File => {
    if (!file) return false;
    if (!file.type.startsWith("image/")) {
      toast("error", "Please upload a valid image file.");
      return false;
    }

    if (file.size > maxImageSizeBytes) {
      toast(
        "error",
        `Image is too large. Please use an image below ${Math.round(maxImageSizeBytes / (1024 * 1024))}MB.`,
      );
      return false;
    }

    return true;
  };

  const toBackendCompatibleUploadFile = useCallback(
    async (sourceFile: File): Promise<File> => {
      const allowedMimeTypes = new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/svg+xml",
      ]);
      if (allowedMimeTypes.has(sourceFile.type)) {
        return sourceFile;
      }

      const convertedDataUrl = await optimizeImageFileToDataUrl(sourceFile, {
        maxDimension: 1600,
        maxDataUrlLength: 2_000_000,
      });
      const convertedFile = dataImageUrlToFile(
        convertedDataUrl,
        `landing-${Date.now()}`,
      );
      if (!convertedFile) {
        throw new Error("Unable to convert image to backend-supported format.");
      }

      return convertedFile;
    },
    [],
  );

  const formatLandingAssetUploadError = useCallback((error: any): string => {
    const status = Number(error?.status || error?.response?.status || 0);
    const responseMessage =
      typeof error?.response?.message === "string"
        ? error.response.message
        : "";
    const baseMessage = typeof error?.message === "string" ? error.message : "";

    if (status === 401)
      return "Session expired. Sign in again and retry upload.";
    if (status === 403)
      return "Your account is authenticated but not allowed to upload into PocketBase landing_assets.";
    if (status === 404)
      return "Landing asset storage is not ready. Open Connectivity & Ops and run the PocketBase bootstrap.";
    if (status === 413) return "Image is larger than backend file size limit.";

    return responseMessage || baseMessage || "backend upload failed";
  }, []);

  const updateTeamMemberImage = (
    index: number,
    file?: File,
    fileInput?: HTMLInputElement | null,
  ) => {
    const resetInput = () => {
      if (fileInput) {
        fileInput.value = "";
      }
    };

    if (!file) {
      toast("info", "No image selected.");
      resetInput();
      return;
    }

    if (index < 0 || index >= landingConfigForm.team.members.length) {
      toast(
        "error",
        "Unable to update team image right now. Reopen the member editor and try again.",
      );
      resetInput();
      return;
    }

    if (!validateImageFile(file, 10 * 1024 * 1024)) {
      resetInput();
      return;
    }

    const canUploadToBackend = backend.authStore.isValid;

    const uploadTeamImage = async () => {
      let uploadErrorMessage = "";

      try {
        const uploadFile = await toBackendCompatibleUploadFile(file);
        const uploaded = await teamImageUpload.start(uploadFile);

        setLandingConfigForm((prev) => {
          const members = [...prev.team.members];
          members[index] = { ...members[index], image: uploaded.url };
          return { ...prev, team: { ...prev.team, members } };
        });

        toast("success", "Team photo uploaded. Save settings to publish.");
        return;
      } catch (uploadError: any) {
        uploadErrorMessage = formatLandingAssetUploadError(uploadError);
      }

      try {
        const dataUrl = await optimizeImageFileToDataUrl(file);
        setLandingConfigForm((prev) => {
          const members = [...prev.team.members];
          members[index] = { ...members[index], image: dataUrl };
          return { ...prev, team: { ...prev.team, members } };
        });
        if (canUploadToBackend) {
          toast(
            "info",
            `Upload failed (${uploadErrorMessage}). Image is kept as local preview and will sync after a successful backend upload.`,
          );
        } else {
          toast(
            "info",
            "Saved as local image preview. Sign in and save to migrate it to backend files.",
          );
        }
      } catch {
        toast(
          "error",
          "Unable to process selected image. Please try another file.",
        );
      }
    };

    void uploadTeamImage().finally(() => {
      resetInput();
    });
  };

  const updateHeroBackgroundImage = (
    file?: File,
    fileInput?: HTMLInputElement | null,
  ) => {
    const resetInput = () => {
      if (fileInput) {
        fileInput.value = "";
      }
    };

    if (!file) {
      toast("info", "No image selected.");
      resetInput();
      return;
    }

    if (!validateImageFile(file, 12 * 1024 * 1024)) {
      resetInput();
      return;
    }

    setHeroPreviewFailedSrc(null);

    toBackendCompatibleUploadFile(file)
      .then((uploadFile) => heroUpload.start(uploadFile))
      .then((uploaded) => {
        setLandingConfigForm((prev) => ({
          ...prev,
          hero: {
            ...prev.hero,
            backgroundImage: uploaded.url,
          },
        }));
        toast("success", "Hero background uploaded. Save settings to publish.");
      })
      .catch((error: any) => {
        const errorMessage = formatLandingAssetUploadError(error);
        toast("error", `Unable to upload hero background (${errorMessage}).`);
      })
      .finally(() => {
        resetInput();
      });
  };

  const applyTeamSampleImage = (index: number) => {
    const members = [...landingConfigForm.team.members];
    members[index] = {
      ...members[index],
      image: teamSampleImages[index % teamSampleImages.length],
    };
    setLandingConfigForm({
      ...landingConfigForm,
      team: { ...landingConfigForm.team, members },
    });
    toast("success", "Sample photo applied. Save settings to publish.");
  };

  const resetTeamVisualStyle = () => {
    const members = landingConfigForm.team.members.map((member, idx) => ({
      ...member,
      backgroundMode:
        member.backgroundMode ||
        (idx === 0 && landingConfigForm.team.firstCardBackgroundMode === "psa"
          ? "logo"
          : "color"),
      visualStyle:
        idx === 0
          ? landingConfigForm.team.firstCardBackgroundMode === "psa"
            ? "psa"
            : getGenderBasedStyle(member.gender || "neutral", idx)
          : getGenderBasedStyle(member.gender || "neutral", idx),
      image: member.image || teamSampleImages[idx % teamSampleImages.length],
      imageScale: 1.03,
      imageOffsetY: 0,
    }));

    setLandingConfigForm({
      ...landingConfigForm,
      team: { ...landingConfigForm.team, members },
    });
    toast("success", "Team visual style reset to premium defaults.");
  };

  useEffect(() => {
    if (!editingTeamMemberId) return;
    if (
      !landingConfigForm.team.members.some(
        (member) => member.id === editingTeamMemberId,
      )
    ) {
      setEditingTeamMemberId(null);
    }
  }, [landingConfigForm.team.members, editingTeamMemberId]);

  useEffect(() => {
    if (activeTab !== "portal") return;
    void heroUploadPrepare();
  }, [activeTab, heroUploadPrepare]);

  useEffect(() => {
    if (activeTab !== "portal" || !editingTeamMember?.id) return;
    void teamImageUploadPrepare();
  }, [activeTab, editingTeamMember?.id, teamImageUploadPrepare]);

  useEffect(() => {
    if (heroUpload.status !== "done" && heroUpload.status !== "error")
      return;
    const timeoutId = window.setTimeout(() => {
      heroUpload.clearStatus();
    }, 4200);
    return () => window.clearTimeout(timeoutId);
  }, [heroUpload]);

  useEffect(() => {
    if (teamImageUpload.status !== "done" && teamImageUpload.status !== "error")
      return;
    const timeoutId = window.setTimeout(() => {
      teamImageUpload.clearStatus();
    }, 4200);
    return () => window.clearTimeout(timeoutId);
  }, [teamImageUpload]);

  useEffect(() => {
    if (!editingMetricId) return;
    if (
      !landingConfigForm.highlights.metrics.some(
        (metric) => metric.id === editingMetricId,
      )
    ) {
      setEditingMetricId(null);
    }
  }, [landingConfigForm.highlights.metrics, editingMetricId]);

  useEffect(() => {
    if (!editingFooterItem) return;

    const sectionLength =
      editingFooterItem.section === "relatedLinks"
        ? landingConfigForm.footer.relatedLinks.length
        : editingFooterItem.section === "aboutLinks"
          ? landingConfigForm.footer.aboutLinks.length
          : landingConfigForm.footer.contactInfo.length;

    if (
      editingFooterItem.index < 0 ||
      editingFooterItem.index >= sectionLength
    ) {
      setEditingFooterItem(null);
    }
  }, [
    landingConfigForm.footer.relatedLinks,
    landingConfigForm.footer.aboutLinks,
    landingConfigForm.footer.contactInfo,
    editingFooterItem,
  ]);

  const checkBackendConnection = useCallback(
    async (options?: { showToast?: boolean }) => {
      const checkedAt = Date.now();
      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const timeoutId = window.setTimeout(() => undefined, 7000);

      setBackendConnection((prev) => ({
        ...prev,
        state: "checking",
        message: "Checking backend connection...",
      }));

      try {
        const response = await Promise.race([
          fetch(`${BACKEND_URL}/api/health`, {
            method: "GET",
            headers: { Accept: "application/json" },
          }).then(async (healthResponse) => {
            if (!healthResponse.ok) {
              return {
                error: {
                  message: `PocketBase health endpoint returned HTTP ${healthResponse.status}.`,
                  status: healthResponse.status,
                },
              };
            }

            return { error: null };
          }),
          new Promise<{ error: { message: string; status: number } }>(
            (resolve) => {
              window.setTimeout(
                () =>
                  resolve({
                    error: { message: "Request timed out.", status: 408 },
                  }),
                7000,
              );
            },
          ),
        ]);

        const latencyMs = Math.max(
          1,
          Math.round(
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) - startedAt,
          ),
        );

        if (response.error) {
          const errorStatus = Number(
            (response.error as { status?: number }).status || 0,
          );
          const errorMessage =
            (response.error as { message?: string }).message || "an error";
          const nextStatus: BackendConnectionStatus = {
            state: errorStatus === 408 ? "disconnected" : "degraded",
            message:
              errorStatus === 408
                ? "Backend connection timed out."
                : `Backend responded with ${errorMessage}.`,
            checkedAt,
            latencyMs,
            httpStatus: errorStatus || null,
          };
          setBackendConnection(nextStatus);
          if (options?.showToast) {
            toast("error", nextStatus.message);
          }
          return;
        }

        const nextStatus: BackendConnectionStatus = {
          state: "connected",
          message: "Frontend is connected to backend.",
          checkedAt,
          latencyMs,
          httpStatus: 200,
        };
        setBackendConnection(nextStatus);
        if (options?.showToast) {
          toast("success", `Backend connection is healthy (${latencyMs}ms).`);
        }
      } catch (error: any) {
        const timedOut = String(error?.message || "")
          .toLowerCase()
          .includes("timed out");
        const nextStatus: BackendConnectionStatus = {
          state: "disconnected",
          message: timedOut
            ? "Backend connection timed out."
            : `Backend is unreachable (${error?.message || "network error"}).`,
          checkedAt,
          latencyMs: null,
          httpStatus: null,
        };
        setBackendConnection(nextStatus);
        if (options?.showToast) {
          toast(
            "error",
            timedOut
              ? "Backend connection timed out."
              : "Frontend cannot reach backend.",
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [toast],
  );

  useEffect(() => {
    void checkBackendConnection();
    const timer = window.setInterval(() => {
      void checkBackendConnection();
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, [checkBackendConnection]);

  const getOpsRunnerHeaders = useCallback(
    (options?: { includeContentType?: boolean }) => {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (options?.includeContentType !== false) {
        headers["Content-Type"] = "application/json";
      }

      const token = opsRunnerToken.trim();
      if (token) {
        headers["x-aurora-runner-token"] = token;
      }

      return headers;
    },
    [opsRunnerToken],
  );

  const getOpsRunnerBaseUrl = useCallback(() => {
    const fallback = "http://127.0.0.1:4310";
    const rawValue = opsRunnerUrl.trim();

    if (!rawValue) {
      return fallback;
    }

    const withScheme = /^https?:\/\//i.test(rawValue)
      ? rawValue
      : `http://${rawValue}`;

    try {
      const parsed = new URL(withScheme);
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
    } catch {
      return fallback;
    }
  }, [opsRunnerUrl]);

  const checkOpsRunner = useCallback(
    async (options?: { showToast?: boolean }) => {
      const checkedAt = Date.now();
      setOpsRunnerStatus((prev) => ({
        ...prev,
        state: "checking",
        message: "Checking local command runner...",
      }));

      const abortController = new AbortController();
      const timeoutId = window.setTimeout(() => abortController.abort(), 5000);

      try {
        const response = await fetch(`${getOpsRunnerBaseUrl()}/health`, {
          method: "GET",
          cache: "no-store",
          headers: getOpsRunnerHeaders({ includeContentType: false }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const authHint =
            response.status === 401
              ? " Provide the Runner Token if token auth is enabled."
              : "";
          const nextStatus: OpsRunnerStatus = {
            state: "offline",
            message: `Runner responded with HTTP ${response.status}.${authHint}`,
            checkedAt,
            runnerVersion: null,
          };
          setOpsRunnerStatus(nextStatus);
          if (options?.showToast) {
            toast(
              "error",
              `Local runner returned HTTP ${response.status}.${authHint}`,
            );
          }
          return;
        }

        const payload = (await response.json()) as {
          version?: string;
          message?: string;
        };
        const nextStatus: OpsRunnerStatus = {
          state: "online",
          message: payload.message || "Local command runner is online.",
          checkedAt,
          runnerVersion: payload.version || null,
        };
        setOpsRunnerStatus(nextStatus);
        if (options?.showToast) {
          toast("success", "Local command runner is online.");
        }
      } catch (error: any) {
        const timedOut = error?.name === "AbortError";
        const nextStatus: OpsRunnerStatus = {
          state: "offline",
          message: timedOut
            ? "Runner check timed out. Start quick-run\\start-ops-runner.cmd on host PC."
            : `Runner unreachable (${error?.message || "network error"}).`,
          checkedAt,
          runnerVersion: null,
        };
        setOpsRunnerStatus(nextStatus);
        if (options?.showToast) {
          toast(
            "error",
            timedOut
              ? "Runner check timed out."
              : "Local command runner is unreachable.",
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [getOpsRunnerBaseUrl, getOpsRunnerHeaders, toast],
  );

  const runOpsCommand = useCallback(
    async (
      commandId: "health-public" | "start-prod",
      label: string,
      payload?: Record<string, string>,
    ) => {
      setOpsCommandState("running");
      setOpsCommandLabel(label);
      setOpsCommandOutput("Running command...");

      try {
        const response = await fetch(`${getOpsRunnerBaseUrl()}/run`, {
          method: "POST",
          headers: getOpsRunnerHeaders({ includeContentType: true }),
          body: JSON.stringify({ commandId, payload }),
        });

        const responseText = await response.text();
        let result = {} as {
          ok?: boolean;
          command?: string;
          exitCode?: number;
          stdout?: string;
          stderr?: string;
          message?: string;
        };

        try {
          result = responseText ? JSON.parse(responseText) : {};
        } catch {
          result = {
            ok: false,
            message: responseText || `Runner returned HTTP ${response.status}.`,
          };
        }

        const outputSections = [
          `HTTP: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
          result.message ? `Message:\n${result.message}` : "",
          result.command ? `Command:\n${result.command}` : "",
          typeof result.exitCode === "number"
            ? `Exit Code: ${result.exitCode}`
            : "",
          result.stdout ? `\nSTDOUT:\n${result.stdout}` : "",
          result.stderr ? `\nSTDERR:\n${result.stderr}` : "",
        ].filter(Boolean);

        setOpsCommandOutput(
          outputSections.length > 0
            ? outputSections.join("\n")
            : "No command output returned.",
        );

        if (
          !response.ok ||
          !result.ok ||
          (typeof result.exitCode === "number" && result.exitCode !== 0)
        ) {
          setOpsCommandState("error");
          toast("error", `${label} failed. Check command output.`);
        } else {
          setOpsCommandState("success");
          toast("success", `${label} completed successfully.`);
        }
      } catch (error: any) {
        setOpsCommandState("error");
        setOpsCommandOutput(
          `Command error: ${error?.message || "network error"}`,
        );
        toast("error", `${label} failed. Local command runner may be offline.`);
      }

      void checkOpsRunner();
    },
    [checkOpsRunner, getOpsRunnerBaseUrl, getOpsRunnerHeaders, toast],
  );

  const checkPublicLandingSync = useCallback(
    async (options?: {
      showToast?: boolean;
      compareConfig?: LandingConfig;
      allowAutoPublish?: boolean;
    }) => {
      const compareConfig = options?.compareConfig ?? landingConfigForm;
      const checkedAt = Date.now();

      setPublicLandingSync((prev) => ({
        ...prev,
        state: "checking",
        message: "Checking public landing record from backend...",
      }));

      try {
        let publicResponse = await fetchPublicAppStateRecord(
          STORAGE_KEYS.landingConfig,
        );
        let remoteRecord = publicResponse.record;

        if (!publicResponse.ok) {
          throw new Error(`HTTP ${publicResponse.status}`);
        }

        if (!remoteRecord) {
          const ownerId =
            backend.authStore.isValid && backend.authStore.record
              ? String(backend.authStore.record.id)
              : null;

          if (ownerId) {
            try {
              const authRecord = await backend
                .collection("app_state")
                .getFirstListItem(
                  `key = ${quotedFilterValue(STORAGE_KEYS.landingConfig)}`,
                );
              if (authRecord) {
                const nextStatus: PublicLandingSyncStatus = {
                  state: "private_only",
                  message:
                    "Landing record exists but is not publicly readable. Reapply the PocketBase app_state public list/view rules so logged-out visitors can read it.",
                  checkedAt,
                  backendRecordId: authRecord.id || null,
                };
                setPublicLandingSync(nextStatus);
                if (options?.showToast) {
                  toast(
                    "error",
                    "Landing record exists but is private-only. Reapply the PocketBase public app_state rules.",
                  );
                }
                return;
              }
            } catch (authError: any) {
              const authStatus = Number(authError?.status || 0);
              if (authStatus !== 404) {
                const nextStatus: PublicLandingSyncStatus = {
                  state: "error",
                  message: `Unable to verify authenticated landing record (${authError?.message || "backend error"}).`,
                  checkedAt,
                  backendRecordId: null,
                };
                setPublicLandingSync(nextStatus);
                if (options?.showToast) {
                  toast(
                    "error",
                    "Unable to verify landing record using authenticated session.",
                  );
                }
                return;
              }
            }

            if (!options?.allowAutoPublish) {
              const nextStatus: PublicLandingSyncStatus = {
                state: "missing",
                message:
                  "No public landing record found. Click Save Changes to publish landing content to backend.",
                checkedAt,
                backendRecordId: null,
              };
              setPublicLandingSync(nextStatus);
              if (options?.showToast) {
                toast(
                  "info",
                  "No public landing record yet. Click Save Changes to publish.",
                );
              }
              return;
            }

            try {
              await upsertAppStateFromStorageValue(
                STORAGE_KEYS.landingConfig,
                JSON.stringify(compareConfig),
                ownerId,
              );
              publicResponse = await fetchPublicAppStateRecord(
                STORAGE_KEYS.landingConfig,
              );
              remoteRecord = publicResponse.record;
            } catch (publishError: any) {
              const nextStatus: PublicLandingSyncStatus = {
                state: "error",
                message: `Unable to publish landing record (${publishError?.message || "backend error"}).`,
                checkedAt,
                backendRecordId: null,
              };
              setPublicLandingSync(nextStatus);
              if (options?.showToast) {
                toast(
                  "error",
                  "Unable to publish public landing record. Check backend permissions.",
                );
              }
              return;
            }

            if (!remoteRecord) {
              const nextStatus: PublicLandingSyncStatus = {
                state: "private_only",
                message:
                  "Landing record was saved but is still not publicly readable. Apply updated app_state public rules via bootstrap.",
                checkedAt,
                backendRecordId: null,
              };
              setPublicLandingSync(nextStatus);
              if (options?.showToast) {
                toast(
                  "error",
                  "Landing record saved, but public access rule is still blocking it.",
                );
              }
              return;
            }
          }
        }

        if (!remoteRecord) {
          const nextStatus: PublicLandingSyncStatus = {
            state: "missing",
            message:
              "No public landing record found in backend. Save while logged in to publish the landing content.",
            checkedAt,
            backendRecordId: null,
          };
          setPublicLandingSync(nextStatus);
          if (options?.showToast) {
            toast(
              "error",
              "Public landing record is missing. Save changes while logged in to publish it.",
            );
          }
          return;
        }

        const savedLocalConfig =
          safeParseJson(getStorageItem(STORAGE_KEYS.landingConfig)) ??
          landingConfig;

        const remoteHash = stableStringify(remoteRecord.value ?? null);
        const targetHash = stableStringify(compareConfig);
        const savedLocalHash = stableStringify(savedLocalConfig);

        if (remoteHash === targetHash) {
          const nextStatus: PublicLandingSyncStatus = {
            state: "published",
            message:
              "Public landing content is up to date and visible for logged-out users.",
            checkedAt,
            backendRecordId: remoteRecord.id || null,
          };
          setPublicLandingSync(nextStatus);
          if (options?.showToast) {
            toast("success", "Public landing is synced and published.");
          }
          return;
        }

        if (remoteHash === savedLocalHash) {
          const nextStatus: PublicLandingSyncStatus = {
            state: "published",
            message:
              "Public landing matches your last saved settings. You have unsaved local edits.",
            checkedAt,
            backendRecordId: remoteRecord.id || null,
          };
          setPublicLandingSync(nextStatus);
          if (options?.showToast) {
            toast(
              "info",
              "Public landing is published, but you have unsaved edits in this page.",
            );
          }
          return;
        }

        const nextStatus: PublicLandingSyncStatus = {
          state: "outdated",
          message:
            "Backend public landing differs from this device state. Save changes to republish.",
          checkedAt,
          backendRecordId: remoteRecord.id || null,
        };
        setPublicLandingSync(nextStatus);
        if (options?.showToast) {
          toast(
            "error",
            "Public landing is outdated. Save changes to republish.",
          );
        }
      } catch (error: any) {
        const nextStatus: PublicLandingSyncStatus = {
          state: "error",
          message: `Unable to verify public landing sync (${error?.message || "network error"}).`,
          checkedAt,
          backendRecordId: null,
        };
        setPublicLandingSync(nextStatus);
        if (options?.showToast) {
          toast(
            "error",
            "Unable to verify public landing sync. Check backend and frontend connectivity.",
          );
        }
      }
    },
    [landingConfig, landingConfigForm, toast],
  );

  const checkPublicCensusSync = useCallback(
    async (options?: { showToast?: boolean }) => {
      const checkedAt = Date.now();

      setPublicCensusSync((prev) => ({
        ...prev,
        state: "checking",
        message: "Checking public Census & Surveys records from backend...",
      }));

      try {
        const [mastersResponse, cyclesResponse, publicFeed] = await Promise.all(
          [
            fetchPublicAppStateRecord(STORAGE_KEYS.censusSurveyMasters),
            fetchPublicAppStateRecord(STORAGE_KEYS.censusSurveyCycles),
            inspectPublicCensusFeed({ force: true }),
          ],
        );

        const nextStatusBase = {
          checkedAt,
          mastersRecordId: mastersResponse.ok
            ? mastersResponse.record?.id || null
            : null,
          cyclesRecordId: cyclesResponse.ok
            ? cyclesResponse.record?.id || null
            : null,
        };

        if (publicFeed.state === "private_only") {
          const nextStatus: PublicCensusSyncStatus = {
            state: "private_only",
            message:
              "Census & Surveys records exist in backend but are not publicly readable. Incognito and new devices can miss live cycles until the public app_state rules are restored.",
            activeCycleCount: 0,
            ...nextStatusBase,
          };
          setPublicCensusSync(nextStatus);
          if (options?.showToast) {
            toast(
              "error",
              "Census & Surveys records are private-only. Reapply the PocketBase public app_state rules.",
            );
          }
          return;
        }

        if (publicFeed.state === "missing") {
          const nextStatus: PublicCensusSyncStatus = {
            state: "missing",
            message: `Public Census & Surveys records are missing${publicFeed.missingKeys.length > 0 ? ` (${publicFeed.missingKeys.join(", ")})` : ""}. Logged-out visitors will not receive live cycles until these records are published.`,
            activeCycleCount: 0,
            ...nextStatusBase,
          };
          setPublicCensusSync(nextStatus);
          if (options?.showToast) {
            toast("warning", "Public Census & Surveys records are missing.");
          }
          return;
        }

        if (publicFeed.state === "invalid") {
          const hiddenActiveCycles = Math.max(
            publicFeed.rawActiveCycleCount - publicFeed.activeCycleCount,
            0,
          );
          const nextStatus: PublicCensusSyncStatus = {
            state: "invalid",
            message:
              hiddenActiveCycles > 0
                ? `Public Census & Surveys records are reachable, but ${hiddenActiveCycles} active cycle${hiddenActiveCycles === 1 ? "" : "s"} cannot be rendered on the landing page. Check master/cycle links and republish.`
                : "Public Census & Surveys records are reachable, but some entries are malformed or orphaned, so the landing page cannot trust them fully.",
            activeCycleCount: publicFeed.activeCycleCount,
            ...nextStatusBase,
          };
          setPublicCensusSync(nextStatus);
          if (options?.showToast) {
            toast(
              "warning",
              "Public Census feed has invalid records. Check master/cycle links.",
            );
          }
          return;
        }

        if (publicFeed.state === "stale") {
          const nextStatus: PublicCensusSyncStatus = {
            state: "stale",
            message:
              "Public Census & Surveys check failed, so this browser is showing the last successful public snapshot. Landing page data may be outdated until the next successful refresh.",
            activeCycleCount: publicFeed.activeCycleCount,
            ...nextStatusBase,
          };
          setPublicCensusSync(nextStatus);
          if (options?.showToast) {
            toast(
              "warning",
              "Public Census feed is currently using stale cached data.",
            );
          }
          return;
        }

        if (publicFeed.state === "error") {
          const nextStatus: PublicCensusSyncStatus = {
            state: "error",
            message: `Unable to verify public Census & Surveys sync${!mastersResponse.ok || !cyclesResponse.ok ? ` (HTTP ${!mastersResponse.ok ? mastersResponse.status : cyclesResponse.status})` : ""}.`,
            activeCycleCount: 0,
            ...nextStatusBase,
          };
          setPublicCensusSync(nextStatus);
          if (options?.showToast) {
            toast("error", "Unable to verify public Census & Surveys sync.");
          }
          return;
        }

        const nextStatus: PublicCensusSyncStatus = {
          state: "published",
          message:
            publicFeed.activeCycleCount > 0
              ? `Public Census & Surveys feed is live with ${publicFeed.activeCycleCount} landing-visible active cycle${publicFeed.activeCycleCount === 1 ? "" : "s"}.`
              : "Public Census & Surveys feed is reachable, but no landing-visible active cycles are currently published.",
          activeCycleCount: publicFeed.activeCycleCount,
          ...nextStatusBase,
        };
        setPublicCensusSync(nextStatus);
        if (options?.showToast) {
          toast(
            "success",
            publicFeed.activeCycleCount > 0
              ? `Public Census feed is live with ${publicFeed.activeCycleCount} landing-visible active cycle${publicFeed.activeCycleCount === 1 ? "" : "s"}.`
              : "Public Census feed is reachable, but no landing-visible active cycles are currently published.",
          );
        }
      } catch (error: any) {
        const nextStatus: PublicCensusSyncStatus = {
          state: "error",
          message: `Unable to verify public Census & Surveys sync (${error?.message || "network error"}).`,
          checkedAt,
          mastersRecordId: null,
          cyclesRecordId: null,
          activeCycleCount: 0,
        };
        setPublicCensusSync(nextStatus);
        if (options?.showToast) {
          toast("error", "Unable to verify public Census & Surveys sync.");
        }
      }
    },
    [toast],
  );

  useEffect(() => {
    if (activeTab !== "connectivity") return;
    void checkBackendConnection();
    void checkOpsRunner();
    void checkPublicLandingSync();
    void checkPublicCensusSync();
  }, [
    activeTab,
    checkBackendConnection,
    checkOpsRunner,
    checkPublicLandingSync,
    checkPublicCensusSync,
  ]);

  const prepareLandingConfigForSync = useCallback(
    async (
      sourceConfig: LandingConfig,
    ): Promise<{
      config: LandingConfig;
      migratedCount: number;
      failedAssets: string[];
    }> => {
      let migratedCount = 0;
      let nextConfig: LandingConfig = sourceConfig;
      const failedAssets: string[] = [];

      const heroImage = sourceConfig.hero.backgroundImage || "";
      if (isDataImageUrl(heroImage)) {
        const heroFile = dataImageUrlToFile(heroImage, `hero-${Date.now()}`);
        if (!heroFile) {
          failedAssets.push("hero background: invalid local image data");
        } else {
          try {
            const uploadFile = await toBackendCompatibleUploadFile(heroFile);
            const uploadedHeroPath = await uploadLandingAssetFile(uploadFile, {
              kind: "hero",
              label: "hero-background",
            });
            nextConfig = {
              ...nextConfig,
              hero: {
                ...nextConfig.hero,
                backgroundImage: uploadedHeroPath,
              },
            };
            migratedCount += 1;
          } catch (error: any) {
            failedAssets.push(
              `hero background: ${formatLandingAssetUploadError(error)}`,
            );
          }
        }
      }

      const nextMembers: TeamMember[] = [];
      for (const member of nextConfig.team.members) {
        const memberImage = member.image || "";
        if (!isDataImageUrl(memberImage)) {
          nextMembers.push(member);
          continue;
        }

        const memberLabel = member.name || member.id || "team-member";
        const memberFile = dataImageUrlToFile(
          memberImage,
          `team-${member.id || Date.now()}`,
        );
        if (!memberFile) {
          failedAssets.push(`${memberLabel}: invalid local image data`);
          nextMembers.push(member);
          continue;
        }

        try {
          const uploadFile = await toBackendCompatibleUploadFile(memberFile);
          const uploadedMemberPath = await uploadLandingAssetFile(uploadFile, {
            kind: "team",
            label: memberLabel,
          });

          migratedCount += 1;
          nextMembers.push({
            ...member,
            image: uploadedMemberPath,
          });
        } catch (error: any) {
          failedAssets.push(
            `${memberLabel}: ${formatLandingAssetUploadError(error)}`,
          );
          nextMembers.push(member);
        }
      }

      if (
        nextMembers.some(
          (member, idx) => member.image !== nextConfig.team.members[idx].image,
        )
      ) {
        nextConfig = {
          ...nextConfig,
          team: {
            ...nextConfig.team,
            members: nextMembers,
          },
        };
      }

      return { config: nextConfig, migratedCount, failedAssets };
    },
    [formatLandingAssetUploadError, toBackendCompatibleUploadFile],
  );

  const hasLegacyLandingAssetImages = (config: LandingConfig): boolean => {
    if (isDataImageUrl(config.hero.backgroundImage || "")) return true;
    return config.team.members.some((member) =>
      isDataImageUrl(member.image || ""),
    );
  };

  const enqueueSettingsBackendSync = useCallback(
    (
      syncEntries: Array<[string, string]>,
      ownerId: string | null,
      compareConfig: LandingConfig,
      savedConfigHash: string,
      previousConfigForAssetCleanup: LandingConfig,
    ) => {
      if (syncEntries.length === 0) return;

      setPendingSettingsSyncCount((prev) => prev + 1);

      settingsSyncQueueRef.current = settingsSyncQueueRef.current
        .catch(() => {
          // Keep sync queue operational even if a prior run failed.
        })
        .then(async () => {
          let syncConfig = compareConfig;
          let hasUnmigratedLegacyImages = false;
          let migrationFailureDetails: string[] = [];
          const syncEntriesWithMigration = [...syncEntries];
          const landingConfigIndex = syncEntriesWithMigration.findIndex(
            ([key]) => key === STORAGE_KEYS.landingConfig,
          );

          if (
            landingConfigIndex >= 0 &&
            hasLegacyLandingAssetImages(syncConfig)
          ) {
            const prepared = await prepareLandingConfigForSync(syncConfig);
            migrationFailureDetails = prepared.failedAssets;

            if (prepared.migratedCount > 0) {
              syncConfig = prepared.config;
              const migratedLandingConfigRaw = JSON.stringify(syncConfig);
              syncEntriesWithMigration[landingConfigIndex] = [
                STORAGE_KEYS.landingConfig,
                migratedLandingConfigRaw,
              ];

              try {
                setStorageItem(
                  STORAGE_KEYS.landingConfig,
                  migratedLandingConfigRaw,
                );
              } catch {
                // Ignore local backup persistence failures after a successful sync.
              }

              updateLandingConfig(syncConfig);
              setLandingConfigForm((prev) =>
                stableStringify(prev) === savedConfigHash ? syncConfig : prev,
              );

              toast(
                "info",
                `${prepared.migratedCount} legacy image${prepared.migratedCount === 1 ? "" : "s"} migrated to backend files in background sync.`,
              );
            }

            hasUnmigratedLegacyImages = hasLegacyLandingAssetImages(syncConfig);
            if (hasUnmigratedLegacyImages) {
              syncEntriesWithMigration.splice(landingConfigIndex, 1);
              const failurePreview =
                migrationFailureDetails.length > 0
                  ? ` (${migrationFailureDetails.slice(0, 2).join("; ")}${migrationFailureDetails.length > 2 ? "; ..." : ""})`
                  : "";
              toast(
                "info",
                `Some landing images are still local previews. Backend landing sync was skipped until upload succeeds${failurePreview}.`,
              );
            }
          }

          if (syncEntriesWithMigration.length === 0) {
            void checkBackendConnection();
            void checkPublicLandingSync({
              compareConfig: syncConfig,
              allowAutoPublish: !hasUnmigratedLegacyImages,
            });
            return;
          }

          const failedKeys: string[] = [];
          const backendSyncResults = await Promise.allSettled(
            syncEntriesWithMigration.map(([key, value]) =>
              upsertAppStateFromStorageValue(key, value, ownerId),
            ),
          );

          backendSyncResults.forEach((result, index) => {
            if (result.status === "rejected") {
              failedKeys.push(syncEntriesWithMigration[index][0]);
            }
          });

          const hasLandingConfigEntry = syncEntriesWithMigration.some(
            ([key]) => key === STORAGE_KEYS.landingConfig,
          );
          const landingConfigSyncSucceeded =
            hasLandingConfigEntry &&
            !failedKeys.includes(STORAGE_KEYS.landingConfig);
          let cleanedLandingAssetCount = 0;
          const failedLandingAssetCleanupIds: string[] = [];

          if (landingConfigSyncSucceeded) {
            const removedAssetRecordIds = getRemovedLandingAssetRecordIds(
              previousConfigForAssetCleanup,
              syncConfig,
            );

            if (removedAssetRecordIds.length > 0) {
              const cleanupResults = await Promise.allSettled(
                removedAssetRecordIds.map(async (recordId) => {
                  try {
                    await deleteLandingAssetBySource(recordId);
                    return "deleted" as const;
                  } catch (error: any) {
                    const status = Number(
                      error?.status || error?.response?.status || 0,
                    );
                    if (status === 404) {
                      return "missing" as const;
                    }
                    throw error;
                  }
                }),
              );

              cleanupResults.forEach((result, index) => {
                if (result.status === "fulfilled") {
                  if (result.value === "deleted") {
                    cleanedLandingAssetCount += 1;
                  }
                  return;
                }

                failedLandingAssetCleanupIds.push(removedAssetRecordIds[index]);
              });
            }
          }

          if (failedKeys.length > 0) {
            const failedPreview = `${failedKeys.slice(0, 3).join(", ")}${failedKeys.length > 3 ? ", ..." : ""}`;
            toast(
              "error",
              `Saved locally, but backend sync failed for ${failedKeys.length} setting${failedKeys.length === 1 ? "" : "s"} (${failedPreview}).`,
            );
          } else if (hasUnmigratedLegacyImages) {
            toast(
              "info",
              "Other settings synced, but landing images are still local until upload succeeds.",
            );
          } else {
            toast("success", "Settings synced to backend.");
          }

          if (cleanedLandingAssetCount > 0) {
            toast(
              "info",
              `Removed ${cleanedLandingAssetCount} unreferenced landing asset${cleanedLandingAssetCount === 1 ? "" : "s"} from backend.`,
            );
          }

          if (failedLandingAssetCleanupIds.length > 0) {
            const failedCleanupPreview = `${failedLandingAssetCleanupIds.slice(0, 3).join(", ")}${failedLandingAssetCleanupIds.length > 3 ? ", ..." : ""}`;
            toast(
              "error",
              `Landing asset cleanup failed for ${failedLandingAssetCleanupIds.length} record${failedLandingAssetCleanupIds.length === 1 ? "" : "s"} (${failedCleanupPreview}).`,
            );
          }

          void checkBackendConnection();
          void checkPublicLandingSync({
            compareConfig: syncConfig,
            allowAutoPublish: !hasUnmigratedLegacyImages,
          });
        })
        .catch((error: any) => {
          toast(
            "error",
            error?.message || "Saved locally, but backend sync failed.",
          );
          void checkBackendConnection();
        })
        .finally(() => {
          setPendingSettingsSyncCount((prev) => Math.max(0, prev - 1));
        });
    },
    [
      checkBackendConnection,
      checkPublicLandingSync,
      prepareLandingConfigForSync,
      toast,
      updateLandingConfig,
    ],
  );

  const handleSave = async (): Promise<boolean> => {
    if (isSavingSettings) return false;
    setIsSavingSettings(true);

    try {
      const nextLandingConfig = landingConfigForm;
      const previousLandingConfig = landingConfig;
      const savedConfigHash = stableStringify(nextLandingConfig);

      const settingsPayloadByKey: Record<string, string> = {
        [STORAGE_KEYS.landingConfig]: JSON.stringify(nextLandingConfig),
        [STORAGE_KEYS.recordDocTypes]: JSON.stringify(docTypes),
        [STORAGE_KEYS.recordDocFields]: JSON.stringify(docFields),
        [STORAGE_KEYS.employmentConfig]: JSON.stringify(employmentConfig),
        [STORAGE_KEYS.employmentSurveyProjects]: JSON.stringify(surveyProjects),
        [STORAGE_KEYS.employmentFocalPersons]: JSON.stringify(focalPersons),
        [STORAGE_KEYS.employmentDesignations]: JSON.stringify(designations),
        [STORAGE_KEYS.supplyRisConfig]: JSON.stringify(risConfig),
        [STORAGE_KEYS.supplyUnitMaster]: JSON.stringify(unitMaster),
        [STORAGE_KEYS.dataCollections]: JSON.stringify(dataCollections),
        [STORAGE_KEYS.propertyConfig]: JSON.stringify(propertyConfig),
        [STORAGE_KEYS.propertyCategories]: JSON.stringify(propertyCategories),
      };

      let changedSettingsEntries: Array<[string, string]> = [];
      try {
        changedSettingsEntries = Object.entries(settingsPayloadByKey).filter(
          ([key, value]) => getStorageItem(key) !== value,
        );
      } catch {
        changedSettingsEntries = Object.entries(settingsPayloadByKey);
      }

      const syncSettingsEntries = [...changedSettingsEntries];
      if (
        hasLegacyLandingAssetImages(nextLandingConfig) &&
        !syncSettingsEntries.some(([key]) => key === STORAGE_KEYS.landingConfig)
      ) {
        syncSettingsEntries.push([
          STORAGE_KEYS.landingConfig,
          JSON.stringify(nextLandingConfig),
        ]);
      }

      try {
        for (const [key, value] of changedSettingsEntries) {
          setStorageItem(key, value);
        }
      } catch {
        toast(
          "error",
          "Unable to save settings locally. Reduce image sizes and try again.",
        );
        return false;
      }

      updateLandingConfig(nextLandingConfig);

      const ownerId = backend.authStore.record
        ? String(backend.authStore.record.id)
        : currentUser?.id || null;
      const canSyncToBackend = backend.authStore.isValid;

      setIsSaved(true);

      if (!canSyncToBackend) {
        toast(
          "info",
          "Settings saved locally. Sign in to sync across devices.",
        );
        void checkBackendConnection();
        void checkPublicLandingSync({
          compareConfig: nextLandingConfig,
          allowAutoPublish: true,
        });
      } else if (syncSettingsEntries.length === 0) {
        toast(
          "success",
          "No changes detected. Settings are already up to date.",
        );
        void checkBackendConnection();
        void checkPublicLandingSync({
          compareConfig: nextLandingConfig,
          allowAutoPublish: true,
        });
      } else {
        enqueueSettingsBackendSync(
          syncSettingsEntries,
          ownerId,
          nextLandingConfig,
          savedConfigHash,
          previousLandingConfig,
        );
        if (changedSettingsEntries.length === 0) {
          toast(
            "info",
            "No local changes detected. Legacy landing images are migrating in the background.",
          );
        } else {
          toast(
            "success",
            "Settings saved instantly. Backend sync is running in the background.",
          );
        }
      }

      setTimeout(() => setIsSaved(false), 3000);
      return true;
    } catch (error: any) {
      toast(
        "error",
        error?.message ||
          "Unable to save settings right now. Please try again.",
      );
      return false;
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleWipeAllData = async () => {
    if (!isSuperAdmin) {
      toast("error", "Only Super Admin can perform global wipe.");
      return;
    }

    const confirmed = await confirm(
      "DANGER: This will wipe ALL saved web app data (local + PocketBase app_state + user preference bundles). This cannot be undone.",
    );
    if (!confirmed) return;

    const confirmText = await prompt("Type WIPE ALL to proceed:");
    if (confirmText !== "WIPE ALL") {
      toast("info", "Wipe cancelled. Confirmation text did not match.");
      return;
    }

    setIsWipingAllData(true);

    try {
      const preservedRoles = getStorageItem(STORAGE_KEYS.roles);

      await clearAllManagedAppState();

      const emptyStateByKey: Record<string, string> = {
        [STORAGE_KEYS.registryRecords]: JSON.stringify([]),
        [STORAGE_KEYS.dataCollections]: JSON.stringify({}),

        [STORAGE_KEYS.supplyInventory]: JSON.stringify([]),
        [STORAGE_KEYS.supplyRequests]: JSON.stringify([]),
        [STORAGE_KEYS.supplyCart]: JSON.stringify([]),
        [STORAGE_KEYS.supplyRequestPurpose]: "",

        [STORAGE_KEYS.employmentRecords]: JSON.stringify([]),
        [STORAGE_KEYS.employmentSurveyProjects]: JSON.stringify([]),
        [STORAGE_KEYS.employmentFocalPersons]: JSON.stringify([]),
        [STORAGE_KEYS.employmentDesignations]: JSON.stringify([]),

        [STORAGE_KEYS.reportProjects]: JSON.stringify([]),
        [STORAGE_KEYS.reportSubmissions]: JSON.stringify([]),
        [STORAGE_KEYS.reportReminderLog]: JSON.stringify([]),

        [STORAGE_KEYS.censusSurveyMasters]: JSON.stringify([]),
        [STORAGE_KEYS.censusSurveyCycles]: JSON.stringify([]),

        [STORAGE_KEYS.propertyCategories]: JSON.stringify([]),
        [STORAGE_KEYS.propertyAssets]: JSON.stringify([]),
        [STORAGE_KEYS.propertyCustody]: JSON.stringify([]),
        [STORAGE_KEYS.propertyTransactions]: JSON.stringify([]),
        [STORAGE_KEYS.propertyEvents]: JSON.stringify([]),
        [STORAGE_KEYS.propertyCountLines]: JSON.stringify([]),
        [STORAGE_KEYS.propertyAuditLog]: JSON.stringify([]),

        [STORAGE_KEYS.gmailWhitelist]: JSON.stringify([]),
        [STORAGE_KEYS.gmailOpenedIds]: JSON.stringify([]),
      };

      const ownerId = currentUser?.id || null;

      for (const [key, rawValue] of Object.entries(emptyStateByKey)) {
        setStorageItem(key, rawValue);
        await upsertAppStateFromStorageValue(key, rawValue, ownerId);
      }

      if (preservedRoles) {
        setStorageItem(STORAGE_KEYS.roles, preservedRoles);
        await upsertAppStateFromStorageValue(
          STORAGE_KEYS.roles,
          preservedRoles,
          ownerId,
        );
      }

      const pocketbaseAuthKeys = Object.keys(window.localStorage).filter(
        (key) =>
          key.startsWith("pocketbase_auth"),
      );

      const seededKeys = new Set(Object.keys(emptyStateByKey));
      const keysToRemove = [
        ...Object.values(STORAGE_KEYS).filter((key) => {
          if (seededKeys.has(key)) return false;
          if (key === STORAGE_KEYS.roles) return false;
          if (key === STORAGE_KEYS.session) return false;
          return true;
        }),
        ...pocketbaseAuthKeys,
      ];

      keysToRemove.forEach((key) => removeStorageItem(key));

      toast("success", "All saved data wiped successfully.");
      await alert("Clean environment restored. The page will now reload.");

      window.location.reload();
    } catch (error: any) {
      toast("error", error?.message || "Failed to wipe all data.");
    } finally {
      setIsWipingAllData(false);
    }
  };

  const handlePurgeInventory = async () => {
    if (
      await confirm(
        "DANGER: This will wipe ALL inventory items and requisition history. This action cannot be undone. Type 'PURGE' to confirm.",
      )
    ) {
      const confirmText = await prompt("Type PURGE to proceed:");
      if (confirmText === "PURGE") {
        writeStorageJson(STORAGE_KEYS.supplyInventory, []);
        writeStorageJson(STORAGE_KEYS.supplyRequests, []);
        writeStorageJson(STORAGE_KEYS.supplyCart, []);
        setStorageItem(STORAGE_KEYS.supplyRequestPurpose, "");
        toast("success", "Inventory and history purged.");
        await alert("Provincial Inventory has been wiped clean.");
      }
    }
  };

  const handlePurgeRecords = async () => {
    if (
      await confirm(
        "CRITICAL: This will delete PERMANENTLY all registry records from the database. This action is irreversible. Type 'PURGE' to confirm.",
      )
    ) {
      const confirmText = await prompt("Type PURGE to proceed:");
      if (confirmText === "PURGE") {
        writeStorageJson(STORAGE_KEYS.registryRecords, []);
        toast("success", "Registry records purged.");
        await alert("All registry records have been permanently deleted.");
      }
    }
  };

  const handlePurgeEmployment = async () => {
    if (
      await confirm(
        "CRITICAL: This will delete PERMANENTLY all Employment Records. Type 'PURGE' to confirm.",
      )
    ) {
      const confirmText = await prompt("Type PURGE to proceed:");
      if (confirmText === "PURGE") {
        removeStorageItem(STORAGE_KEYS.employmentRecords);
        toast("success", "Employment records purged.");
        await alert("All employment records have been permanently deleted.");
      }
    }
  };

  const handlePurgeReports = async () => {
    if (
      await confirm(
        "CRITICAL: This will delete PERMANENTLY all Report Monitoring projects, report schedules, and reminder logs. Type 'PURGE' to confirm.",
        { title: "Purge Report Monitoring Data", confirmLabel: "Purge" },
      )
    ) {
      writeStorageJson(STORAGE_KEYS.reportProjects, []);
      writeStorageJson(STORAGE_KEYS.reportSubmissions, []);
      writeStorageJson(STORAGE_KEYS.reportReminderLog, []);
      toast("warning", "Report Monitoring data purged.");
    }
  };

  const addSurveyProject = async () => {
    const proj = await prompt("Enter new Survey/Project name:");
    if (proj && !surveyProjects.includes(proj)) {
      setSurveyProjects([...surveyProjects, proj]);
    }
  };

  const removeSurveyProject = (proj: string) => {
    setSurveyProjects(surveyProjects.filter((p) => p !== proj));
  };

  const addFocalPerson = async () => {
    const person = await prompt("Enter new Focal Person name:");
    if (person && !focalPersons.includes(person)) {
      setFocalPersons([...focalPersons, person]);
    }
  };

  const removeFocalPerson = (person: string) => {
    setFocalPersons(focalPersons.filter((p) => p !== person));
  };

  const addDesignation = async () => {
    const title = await prompt("Enter new Designation title:");
    if (title && !designations.includes(title)) {
      setDesignations([...designations, title]);
    }
  };

  const removeDesignation = (title: string) => {
    setDesignations(designations.filter((t) => t !== title));
  };

  const toggleDocType = (index: number) => {
    const updated = [...docTypes];
    updated[index].enabled = !updated[index].enabled;
    setDocTypes(updated);
  };

  const openRenameModal = (doc: DocType) => {
    setDocToRename(doc);
    setRenamedValue(doc.name);
    setIsRenameModalOpen(true);
  };

  const handleRename = () => {
    if (docToRename && renamedValue.trim()) {
      setDocTypes(
        docTypes.map((d) =>
          d.id === docToRename.id ? { ...d, name: renamedValue.trim() } : d,
        ),
      );
      setIsRenameModalOpen(false);
      toast("success", `Document type renamed to "${renamedValue.trim()}"`);
    } else {
      toast("error", "Invalid document name");
    }
  };

  const openRefModal = (doc: DocType) => {
    setDocForRef({ ...doc });
    setIsRefModalOpen(true);
  };

  const handleUpdateRefConfig = () => {
    if (docForRef) {
      setDocTypes(docTypes.map((d) => (d.id === docForRef.id ? docForRef : d)));
      setIsRefModalOpen(false);
      toast("success", `ID format updated for ${docForRef.name}`);
    }
  };

  const deleteDocType = async (id: string) => {
    if (
      await confirm(
        `Are you sure you want to delete the "${docTypes.find((d) => d.id === id)?.name}" document type?`,
      )
    ) {
      setDocTypes(docTypes.filter((d) => d.id !== id));
      toast("success", "Document type removed");
      const newFields = { ...docFields };
      delete newFields[id];
      setDocFields(newFields);
    }
  };

  const addNewDocType = async () => {
    const name = await prompt("Enter the name of the new document type:");
    if (name && name.trim()) {
      const id =
        name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "") +
        "-" +
        Date.now().toString().slice(-4);
      const newDoc: DocType = {
        id,
        name: name.trim(),
        enabled: true,
        refPrefix: "REG",
        refSeparator: "-",
        refPadding: 6,
        refIncrement: 1,
        refStart: 1,
      };
      setDocTypes([...docTypes, newDoc]);
      setDocFields({ ...docFields, [id]: [] });
    }
  };

  // -- Data Collection Methods --
  const addCollection = async () => {
    const name = await prompt(
      "Enter new Data Collection name (e.g. Employee Ranks):",
    );
    if (name && name.trim()) {
      if (dataCollections[name.trim()]) {
        await alert("Collection already exists.");
        return;
      }
      setDataCollections({ ...dataCollections, [name.trim()]: [] });
    }
  };

  const deleteCollection = async (key: string) => {
    if (await confirm(`Delete the "${key}" collection and all its data?`)) {
      const updated = { ...dataCollections };
      delete updated[key];
      setDataCollections(updated);
      if (selectedCollection === key) setSelectedCollection(null);
    }
  };

  const addCollectionItem = async (key: string) => {
    const item = await prompt(`Add new item to "${key}":`);
    if (item && item.trim()) {
      setDataCollections({
        ...dataCollections,
        [key]: [...dataCollections[key], item.trim()],
      });
    }
  };

  const removeCollectionItem = (key: string, index: number) => {
    const updated = [...dataCollections[key]];
    updated.splice(index, 1);
    setDataCollections({ ...dataCollections, [key]: updated });
  };

  const addUnitMaster = async () => {
    const unit = await prompt("Enter new Unit name (e.g. Dozen, Kilos):");
    if (unit && !unitMaster.includes(unit)) {
      setUnitMaster([...unitMaster, unit]);
    }
  };

  const removeUnitMaster = (unit: string) => {
    setUnitMaster(unitMaster.filter((u) => u !== unit));
  };

  const openBuilder = (docId: string) => {
    setSelectedDocId(docId);
    setIsBuilderOpen(true);
  };

  const addField = () => {
    if (!newFieldName || !selectedDocId || !docFields[selectedDocId]) return;
    const isOptionBasedField =
      newFieldType === "select" || newFieldType === "prefix";
    const options =
      isOptionBasedField && !newFieldCollection
        ? newFieldOptions
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;
    const collectionSource =
      isOptionBasedField && newFieldCollection ? newFieldCollection : undefined;

    const newField: FormField = {
      id: Math.random().toString(36).substr(2, 9),
      label: newFieldName,
      type: newFieldType,
      required: false,
      options,
      collectionSource,
    };
    setDocFields({
      ...docFields,
      [selectedDocId]: [...docFields[selectedDocId], newField],
    });
    setNewFieldName("");
    setNewFieldOptions("");
    setNewFieldCollection("");
  };

  const removeField = (fieldId: string) => {
    setDocFields({
      ...docFields,
      [selectedDocId]: docFields[selectedDocId].filter((f) => f.id !== fieldId),
    });
  };

  const toggleFieldRequired = (fieldId: string) => {
    setDocFields({
      ...docFields,
      [selectedDocId]: docFields[selectedDocId].map((f) =>
        f.id === fieldId ? { ...f, required: !f.required } : f,
      ),
    });
  };

  const addPropertyCategory = async () => {
    const name = await prompt("Enter category name (e.g., IT Equipment):");
    if (!name || !name.trim()) return;
    const assetClass = await prompt(
      "Asset class? Type PPE or Semi-Expendable:",
    );
    if (!assetClass || !["PPE", "Semi-Expendable"].includes(assetClass)) {
      toast("error", "Must be PPE or Semi-Expendable");
      return;
    }
    const lifeStr = await prompt("Useful life in years (optional):");
    const usefulLife = lifeStr ? parseInt(lifeStr) || undefined : undefined;
    const id = `cat-${Date.now()}`;
    setPropertyCategories([
      ...propertyCategories,
      {
        id,
        name: name.trim(),
        assetClass: assetClass as "PPE" | "Semi-Expendable",
        usefulLife,
      },
    ]);
  };

  const removePropertyCategory = async (id: string) => {
    const cat = propertyCategories.find((c) => c.id === id);
    if (cat && (await confirm(`Remove category "${cat.name}"?`))) {
      setPropertyCategories(propertyCategories.filter((c) => c.id !== id));
    }
  };

  const addPropertyLocation = async () => {
    const loc = await prompt(
      "Enter new location (e.g., RSSO V — Finance Unit):",
    );
    if (loc && !propertyConfig.locations.includes(loc)) {
      setPropertyConfig({
        ...propertyConfig,
        locations: [...propertyConfig.locations, loc],
      });
    }
  };

  const removePropertyLocation = (loc: string) => {
    setPropertyConfig({
      ...propertyConfig,
      locations: propertyConfig.locations.filter((l) => l !== loc),
    });
  };

  const handlePurgeProperty = async () => {
    if (
      await confirm(
        "CRITICAL: This will delete PERMANENTLY all Property & Asset records. Type 'PURGE' to confirm.",
      )
    ) {
      const confirmText = await prompt("Type PURGE to proceed:");
      if (confirmText === "PURGE") {
        writeStorageJson(STORAGE_KEYS.propertyAssets, []);
        writeStorageJson(STORAGE_KEYS.propertyCustody, []);
        writeStorageJson(STORAGE_KEYS.propertyTransactions, []);
        writeStorageJson(STORAGE_KEYS.propertyEvents, []);
        writeStorageJson(STORAGE_KEYS.propertyCountLines, []);
        writeStorageJson(STORAGE_KEYS.propertyAuditLog, []);
        toast("success", "Property records purged.");
        await alert(
          "All property and asset records have been permanently deleted. Refresh the page to apply.",
        );
      }
    }
  };

  const openAddUserModal = () => {
    setEditingUserId(null);
    setUserFormData({
      name: "",
      email: "",
      roles: [],
      gender: "Male",
      position: "",
      password: "",
    });
    setIsAddUserModalOpen(true);
  };

  const openEditUserModal = (user: User) => {
    setEditingUserId(user.id);
    setUserFormData({
      name: user.name,
      email: user.email,
      roles: user.roles || [],
      gender: user.gender,
      position: user.position,
      password: user.password || "",
    });
    setIsAddUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (userFormData.name && userFormData.email) {
      if (
        !editingUserId &&
        (!userFormData.password || userFormData.password.trim().length < 8)
      ) {
        toast(
          "error",
          "Password is required for new users (minimum 8 characters)",
        );
        return;
      }

      try {
        if (editingUserId) {
          await updateUser(editingUserId, userFormData);
          toast("success", `User "${userFormData.name}" updated`);
        } else {
          await addUser(userFormData);
          toast("success", `User "${userFormData.name}" created`);
        }
        setIsAddUserModalOpen(false);
      } catch (error: any) {
        toast("error", error?.message || "Unable to save user account");
      }
    } else {
      toast("error", "Please fill in all required fields");
    }
  };

  const removeUser = async (user: User) => {
    if (await confirm(`Are you sure you want to remove ${user.name}?`)) {
      try {
        await deleteUser(user.id);
        toast("success", `User "${user.name}" removed`);
      } catch (error: any) {
        toast("error", error?.message || `Unable to remove "${user.name}"`);
      }
    }
  };

  const openAddRoleModal = () => {
    setEditingRoleId(null);
    setRoleFormData({
      name: "",
      description: "",
      permissions: [],
      badgeColor: getDefaultRoleBadgeColor("", roles.length),
    });
    setIsRoleModalOpen(true);
  };

  const openEditRoleModal = (role: Role) => {
    setEditingRoleId(role.id);
    setRoleFormData({
      name: role.name,
      description: role.description || "",
      permissions: role.permissions,
      badgeColor: role.badgeColor,
    });
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = () => {
    if (roleFormData.name) {
      if (editingRoleId) {
        updateRole(editingRoleId, roleFormData);
        toast("success", `Role "${roleFormData.name}" updated`);
      } else {
        addRole(roleFormData);
        toast("success", `Role "${roleFormData.name}" created`);
      }
      setIsRoleModalOpen(false);
    } else {
      toast("error", "Role name is required");
    }
  };

  const tabs = [
    { id: "record", label: "Record Settings", icon: Database },
    { id: "supply", label: "Supply Settings", icon: Package },
    { id: "employment", label: "Employment Settings", icon: Briefcase },
    { id: "property", label: "Property Settings", icon: Building2 },
    { id: "reports", label: "Report Monitoring", icon: ClipboardCheck },
    { id: "gmail", label: "Gmail Hub Settings", icon: Mail },
    { id: "users", label: "User Management", icon: Users },
    { id: "portal", label: "Portal Config", icon: Monitor },
    { id: "connectivity", label: "Connectivity & Ops", icon: ShieldCheck },
  ];

  const backendConnectionBadgeVariant:
    | "default"
    | "success"
    | "warning"
    | "info" =
    backendConnection.state === "connected"
      ? "success"
      : backendConnection.state === "checking"
        ? "info"
        : backendConnection.state === "degraded" ||
            backendConnection.state === "disconnected"
          ? "warning"
          : "default";

  const backendConnectionLabel =
    backendConnection.state === "connected"
      ? "Connected"
      : backendConnection.state === "checking"
        ? "Checking"
        : backendConnection.state === "degraded"
          ? "Degraded"
          : backendConnection.state === "disconnected"
            ? "Offline"
            : "Unknown";

  const backendConnectionCheckedAtLabel = backendConnection.checkedAt
    ? new Date(backendConnection.checkedAt).toLocaleString()
    : "Not checked yet";

  const publicSyncBadgeVariant: "default" | "success" | "warning" | "info" =
    publicLandingSync.state === "published"
      ? "success"
      : publicLandingSync.state === "checking"
        ? "info"
        : publicLandingSync.state === "outdated" ||
            publicLandingSync.state === "missing" ||
            publicLandingSync.state === "private_only" ||
            publicLandingSync.state === "error"
          ? "warning"
          : "default";

  const publicSyncLabel =
    publicLandingSync.state === "published"
      ? "Published"
      : publicLandingSync.state === "checking"
        ? "Checking"
        : publicLandingSync.state === "outdated"
          ? "Outdated"
          : publicLandingSync.state === "missing"
            ? "Missing"
            : publicLandingSync.state === "private_only"
              ? "Private Only"
              : publicLandingSync.state === "error"
                ? "Unreachable"
                : "Unknown";

  const publicSyncCheckedAtLabel = publicLandingSync.checkedAt
    ? new Date(publicLandingSync.checkedAt).toLocaleString()
    : "Not checked yet";

  const publicCensusSyncBadgeVariant:
    | "default"
    | "success"
    | "warning"
    | "info" =
    publicCensusSync.state === "published"
      ? "success"
      : publicCensusSync.state === "checking"
        ? "info"
        : publicCensusSync.state === "stale"
          ? "info"
          : publicCensusSync.state === "missing" ||
              publicCensusSync.state === "private_only" ||
              publicCensusSync.state === "invalid" ||
              publicCensusSync.state === "error"
            ? "warning"
            : "default";

  const publicCensusSyncLabel =
    publicCensusSync.state === "published"
      ? "Published"
      : publicCensusSync.state === "checking"
        ? "Checking"
        : publicCensusSync.state === "stale"
          ? "Stale Cache"
          : publicCensusSync.state === "missing"
            ? "Missing"
            : publicCensusSync.state === "private_only"
              ? "Private Only"
              : publicCensusSync.state === "invalid"
                ? "Invalid Feed"
                : publicCensusSync.state === "error"
                  ? "Unreachable"
                  : "Unknown";

  const publicCensusSyncCheckedAtLabel = publicCensusSync.checkedAt
    ? new Date(publicCensusSync.checkedAt).toLocaleString()
    : "Not checked yet";

  const opsRunnerBadgeVariant: "default" | "success" | "warning" | "info" =
    opsRunnerStatus.state === "online"
      ? "success"
      : opsRunnerStatus.state === "checking"
        ? "info"
        : opsRunnerStatus.state === "offline"
          ? "warning"
          : "default";

  const opsRunnerLabel =
    opsRunnerStatus.state === "online"
      ? "Online"
      : opsRunnerStatus.state === "checking"
        ? "Checking"
        : opsRunnerStatus.state === "offline"
          ? "Offline"
          : "Unknown";

  const opsRunnerCheckedAtLabel = opsRunnerStatus.checkedAt
    ? new Date(opsRunnerStatus.checkedAt).toLocaleString()
    : "Not checked yet";

  const opsCommandBadgeVariant: "default" | "success" | "warning" | "info" =
    opsCommandState === "success"
      ? "success"
      : opsCommandState === "running"
        ? "info"
        : opsCommandState === "error"
          ? "warning"
          : "default";

  const opsCommandStateLabel =
    opsCommandState === "running"
      ? "Running"
      : opsCommandState === "success"
        ? "Success"
        : opsCommandState === "error"
          ? "Failed"
          : "Idle";

  const startOpsRunnerCommand = "quick-run\\start-ops-runner.cmd";

  const copyOpsRunnerCommand = async () => {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(startOpsRunnerCommand);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = startOpsRunnerCommand;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      toast("success", "Runner command copied. Run it on the host PC.");
    } catch {
      toast(
        "error",
        `Unable to copy command automatically. Run: ${startOpsRunnerCommand}`,
      );
    }
  };

  const applyBackendOverride = () => {
    const raw = backendUrlDraft.trim();
    if (!raw) {
      removeStorageItem(STORAGE_KEYS.backendUrlOverride);
      toast(
        "success",
        "Backend override removed. Reload to use environment backend URL.",
      );
      return;
    }

    try {
      const normalizedUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const parsed = new URL(normalizedUrl);
      setStorageItem(
        STORAGE_KEYS.backendUrlOverride,
        `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, ""),
      );
      toast(
        "success",
        "Backend override saved. Reload this page to apply new backend URL.",
      );
    } catch {
      toast("error", "Invalid backend URL. Enter a valid http(s) URL.");
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Save Success Toast */}
      {isSaved && (
        <div className="fixed top-24 right-8 z-[2000] animate-in slide-in-from-right duration-300">
          <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <CheckCircle2 size={20} />
            <span className="text-sm font-bold">
              Settings updated successfully!
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Vertical Sidebar */}
        <aside className="w-full lg:w-64 shrink-0 space-y-2">
          <div className="mb-6 px-4">
            <h1 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              System Configuration
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-[10px] font-bold mt-1 uppercase tracking-[0.2em]">
              Provincial Office
            </p>
          </div>
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  onMouseEnter={() => prefetchSettingsTab(tab.id)}
                  onFocus={() => prefetchSettingsTab(tab.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group
                    ${
                      activeTab === tab.id
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                        : "text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900/50"
                    }
                  `}
                >
                  <Icon
                    size={18}
                    className={`${activeTab === tab.id ? "text-white" : "text-zinc-900 dark:text-zinc-100"}`}
                  />
                  <span className="text-sm font-bold tracking-tight">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="pt-6 mt-6 border-t border-zinc-100 dark:border-zinc-800 px-4">
            <Button
              variant="blue"
              className="w-full justify-center shadow-lg shadow-blue-500/20"
              onClick={() => {
                void handleSave();
              }}
              disabled={isSavingSettings}
            >
              {isSavingSettings || isSyncingSettings ? (
                <RefreshCw size={16} className="mr-2 animate-spin" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              {isSavingSettings
                ? "Saving..."
                : isSyncingSettings
                  ? "Save Changes (Syncing...)"
                  : "Save Changes"}
            </Button>

            <div className="mt-3 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1.5">
                <ShieldCheck size={12} /> Connectivity & Ops
              </p>
              <p className="text-[10px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Backend checks, public landing sync, bootstrap actions, and
                one-click host commands are grouped in one tab.
              </p>
              <Button
                variant="outline"
                className="w-full !h-8 !text-[10px] font-bold"
                onMouseEnter={() => prefetchSettingsTab("connectivity")}
                onFocus={() => prefetchSettingsTab("connectivity")}
                onClick={() => setActiveTab("connectivity")}
              >
                Open Connectivity Tab{" "}
                <ChevronRight size={12} className="ml-1" />
              </Button>
            </div>

            {isSuperAdmin && (
              <div className="mt-3 space-y-2">
                <Button
                  variant="ghost"
                  onClick={handleWipeAllData}
                  disabled={isWipingAllData}
                  className="w-full justify-center bg-red-600 text-white hover:bg-red-700 !h-11 rounded-xl text-[10px] font-black uppercase tracking-[0.2em]"
                >
                  {isWipingAllData ? (
                    <RefreshCw size={13} className="mr-2 animate-spin" />
                  ) : (
                    <AlertTriangle size={13} className="mr-2" />
                  )}
                  {isWipingAllData ? "Wiping Data..." : "Wipe All Data"}
                </Button>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-red-500/80 text-center">
                  Super Admin only
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 w-full lg:max-w-[calc(100%-18rem)]">
          {activeTab === "record" && (
            <Suspense fallback={<SettingsTabFallback label="Registry and records" />}>
              <RecordSettingsTab
                recordSubTab={recordSubTab}
                setRecordSubTab={setRecordSubTab}
                docTypes={docTypes}
                docFields={docFields}
                dataCollections={dataCollections}
                selectedCollection={selectedCollection}
                setSelectedCollection={setSelectedCollection}
                addNewDocType={addNewDocType}
                toggleDocType={toggleDocType}
                openBuilder={openBuilder}
                openRefModal={openRefModal}
                openRenameModal={openRenameModal}
                deleteDocType={deleteDocType}
                handlePurgeRecords={handlePurgeRecords}
                addCollection={addCollection}
                deleteCollection={deleteCollection}
                addCollectionItem={addCollectionItem}
                removeCollectionItem={removeCollectionItem}
              />
            </Suspense>
          )}

          {activeTab === "supply" && (
            <Suspense fallback={<SettingsTabFallback label="Supply and RIS settings" />}>
              <SupplySettingsTab
                supplySubTab={supplySubTab}
                setSupplySubTab={setSupplySubTab}
                risConfig={risConfig}
                setRisConfig={setRisConfig}
                unitMaster={unitMaster}
                removeUnitMaster={removeUnitMaster}
                addUnitMaster={addUnitMaster}
                handlePurgeInventory={handlePurgeInventory}
              />
            </Suspense>
          )}

          {activeTab === "employment" && (
            <Suspense fallback={<SettingsTabFallback label="Employment settings" />}>
              <EmploymentSettingsTab
                employmentSubTab={employmentSubTab}
                setEmploymentSubTab={setEmploymentSubTab}
                employmentConfig={employmentConfig}
                setEmploymentConfig={setEmploymentConfig}
                surveyProjects={surveyProjects}
                removeSurveyProject={removeSurveyProject}
                addSurveyProject={addSurveyProject}
                focalPersons={focalPersons}
                removeFocalPerson={removeFocalPerson}
                addFocalPerson={addFocalPerson}
                designations={designations}
                removeDesignation={removeDesignation}
                addDesignation={addDesignation}
                handlePurgeEmployment={handlePurgeEmployment}
              />
            </Suspense>
          )}

          {activeTab === "property" && (
            <Suspense fallback={<SettingsTabFallback label="Property settings" />}>
              <PropertySettingsTab
                propertySubTab={propertySubTab}
                setPropertySubTab={setPropertySubTab}
                propertyConfig={propertyConfig}
                setPropertyConfig={setPropertyConfig}
                propertyCategories={propertyCategories}
                setPropertyCategories={setPropertyCategories}
                addPropertyCategory={addPropertyCategory}
                removePropertyCategory={removePropertyCategory}
                addPropertyLocation={addPropertyLocation}
                removePropertyLocation={removePropertyLocation}
                handlePurgeProperty={handlePurgeProperty}
              />
            </Suspense>
          )}

          {activeTab === "reports" && (
            <Suspense
              fallback={<SettingsTabFallback label="Report monitoring reminders" />}
            >
              <ReportMonitoringSettingsTab
                settings={reportSettings}
                setSettings={setReportSettings}
                handlePurgeReports={handlePurgeReports}
              />
            </Suspense>
          )}


          {activeTab === "users" && (
            <Suspense
              fallback={
                <SettingsTabFallback label="User management and role controls" />
              }
            >
              <SecurityAccessTab
                usersSubTab={usersSubTab as "accounts" | "roles"}
                onUsersSubTabChange={setUsersSubTab as (tab: "accounts" | "roles") => void}
                users={users}
                roles={roles}
                onAddUser={openAddUserModal}
                onEditUser={openEditUserModal}
                onRemoveUser={removeUser}
                onAddRole={openAddRoleModal}
                onEditRole={openEditRoleModal}
                onDeleteRole={deleteRole}
                getRoleBadgeStyle={getRoleBadgeStyle}
              />
            </Suspense>
          )}

          {activeTab === "gmail" && (
            <SettingsTabErrorBoundary label="Gmail settings">
              <Suspense
                fallback={<SettingsTabFallback label="Gmail integration controls" />}
              >
                <GmailHubTab
                  whitelist={whitelist}
                  onAddSender={handleAddWhitelistEntry}
                  onRemoveSender={handleRemoveWhitelistEntry}
                />
              </Suspense>
            </SettingsTabErrorBoundary>
          )}

          {activeTab === "portal" && (
            <Suspense
              fallback={<SettingsTabFallback label="Public portal configuration" />}
            >
              <PortalConfigurationTab
                landingConfigForm={landingConfigForm}
                setLandingConfigForm={setLandingConfigForm}
                landingConfig={landingConfig}
                hasUnsavedLandingChanges={hasUnsavedLandingChanges}
                setActiveTab={setActiveTab}
                heroPreviewFailedSrc={heroPreviewFailedSrc}
                setHeroPreviewFailedSrc={setHeroPreviewFailedSrc}
                portalDrag={portalDrag}
                setPortalDrag={setPortalDrag}
                editingTeamMemberId={editingTeamMemberId}
                setEditingTeamMemberId={setEditingTeamMemberId}
                editingFooterItem={editingFooterItem}
                setEditingFooterItem={setEditingFooterItem}
                heroUpload={heroUpload}
                teamImageUpload={teamImageUpload}
                isSavingSettings={isSavingSettings}
                resetTeamVisualStyle={resetTeamVisualStyle}
                movePortalItem={movePortalItem}
                updateTeamMemberProjectsFromText={updateTeamMemberProjectsFromText}
                updateTeamMember={updateTeamMember}
                addTeamMember={addTeamMember}
                removeTeamMember={removeTeamMember}
                updateTeamMemberImage={updateTeamMemberImage}
                applyTeamSampleImage={applyTeamSampleImage}
                updateHeroBackgroundImage={updateHeroBackgroundImage}
                updateFooterRelatedLink={updateFooterRelatedLink}
                updateFooterAboutLink={updateFooterAboutLink}
                updateFooterContact={updateFooterContact}
                removeFooterItem={removeFooterItem}
                handleSave={handleSave}
                getGenderBasedStyle={getGenderBasedStyle}
              />
            </Suspense>
          )}
          {activeTab === "connectivity" && (
            <Suspense
              fallback={<SettingsTabFallback label="Connectivity and sync diagnostics" />}
            >
              <ConnectivityTab
                backendUrl={BACKEND_URL}
                backendConnectionMessage={backendConnection.message}
                backendConnectionLabel={backendConnectionLabel}
                backendConnectionBadgeVariant={backendConnectionBadgeVariant}
                backendConnectionCheckedAtLabel={backendConnectionCheckedAtLabel}
                backendConnectionLatencyMs={backendConnection.latencyMs}
                hasBackendOverride={hasBackendOverride}
                backendOverrideValue={backendOverrideValue}
                backendUrlDraft={backendUrlDraft}
                onBackendUrlDraftChange={setBackendUrlDraft}
                onApplyBackendOverride={applyBackendOverride}
                onClearBackendOverride={() => {
                  removeStorageItem(STORAGE_KEYS.backendUrlOverride);
                  setBackendUrlDraft(BACKEND_URL);
                  toast(
                    "success",
                    "Backend override removed. Reload to use default backend.",
                  );
                }}
                onRecheckBackend={() => {
                  void checkBackendConnection({ showToast: true });
                }}
                isBackendChecking={backendConnection.state === "checking"}
                publicLandingSyncMessage={publicLandingSync.message}
                publicSyncLabel={publicSyncLabel}
                publicSyncBadgeVariant={publicSyncBadgeVariant}
                publicSyncCheckedAtLabel={publicSyncCheckedAtLabel}
                publicLandingSyncRecordId={publicLandingSync.backendRecordId}
                hasUnsavedLandingChanges={hasUnsavedLandingChanges}
                onRecheckPublicSync={() => {
                  void checkPublicLandingSync({ showToast: true });
                }}
                isPublicSyncChecking={publicLandingSync.state === "checking"}
                publicCensusSyncMessage={publicCensusSync.message}
                publicCensusSyncLabel={publicCensusSyncLabel}
                publicCensusSyncBadgeVariant={publicCensusSyncBadgeVariant}
                publicCensusSyncCheckedAtLabel={publicCensusSyncCheckedAtLabel}
                publicCensusActiveCycleCount={publicCensusSync.activeCycleCount}
                publicCensusMastersRecordId={publicCensusSync.mastersRecordId}
                publicCensusCyclesRecordId={publicCensusSync.cyclesRecordId}
                onRecheckPublicCensusSync={() => {
                  void checkPublicCensusSync({ showToast: true });
                }}
                isPublicCensusSyncChecking={publicCensusSync.state === "checking"}
                opsRunnerUrl={opsRunnerUrl}
                onOpsRunnerUrlChange={setOpsRunnerUrl}
                opsRunnerToken={opsRunnerToken}
                onOpsRunnerTokenChange={setOpsRunnerToken}
                onRecheckRunner={() => {
                  void checkOpsRunner({ showToast: true });
                }}
                isOpsRunnerChecking={opsRunnerStatus.state === "checking"}
                onCopyOpsRunnerCommand={copyOpsRunnerCommand}
                startOpsRunnerCommand={startOpsRunnerCommand}
                opsRunnerBaseUrl={getOpsRunnerBaseUrl()}
                opsRunnerLabel={opsRunnerLabel}
                opsRunnerBadgeVariant={opsRunnerBadgeVariant}
                opsRunnerMessage={opsRunnerStatus.message}
                opsRunnerCheckedAtLabel={opsRunnerCheckedAtLabel}
                opsRunnerVersion={opsRunnerStatus.runnerVersion || null}
                opsCommandState={opsCommandState}
                opsCommandBadgeVariant={opsCommandBadgeVariant}
                opsCommandStateLabel={opsCommandStateLabel}
                opsCommandLabel={opsCommandLabel}
                opsCommandOutput={opsCommandOutput}
                onRunOpsCommand={(commandName, displayName) => {
                  void runOpsCommand(commandName, displayName);
                }}
              />
            </Suspense>
          )}
        </main>
      </div>

      {/* Add/Edit User Modal */}
      <Modal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        title={editingUserId ? "Edit User Account" : "Register New Account"}
        maxWidth="max-w-2xl"
        className="rounded-[24px] border border-zinc-200/80 dark:border-zinc-800/80 bg-gradient-to-b from-white via-zinc-50/70 to-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.65)]"
        overlayClassName="bg-zinc-950/70 backdrop-blur-[3px]"
        headerClassName="px-4 sm:px-5 py-3.5 sm:py-4 bg-white/75 dark:bg-zinc-950/75 backdrop-blur-sm border-zinc-200/70 dark:border-zinc-800/80"
        titleClassName="text-[16px] sm:text-[17px] tracking-tight text-zinc-900 dark:text-zinc-50"
        bodyClassName="px-4 sm:px-5 py-4"
        footerClassName="px-4 sm:px-5 py-3 border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/45"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              variant="ghost"
              className="!h-9 !px-4 !text-[11px]"
              onClick={() => setIsAddUserModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="blue"
              className="!h-9 !px-4 !text-[11px] shadow-lg shadow-blue-500/20"
              onClick={handleSaveUser}
            >
              {editingUserId ? "Update User" : "Create User"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/80 dark:bg-zinc-900/45 p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Full Name"
                value={userFormData.name}
                onChange={(e) =>
                  setUserFormData({ ...userFormData, name: e.target.value })
                }
                placeholder="e.g. Maria Clara"
                className="bg-white dark:bg-zinc-950/70"
              />
              <Input
                label="Email Address"
                type="email"
                value={userFormData.email}
                onChange={(e) =>
                  setUserFormData({ ...userFormData, email: e.target.value })
                }
                placeholder="user@psa.gov.ph"
                className="bg-white dark:bg-zinc-950/70"
              />
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">
                  Gender
                </label>
                <select
                  value={userFormData.gender}
                  onChange={(e) =>
                    setUserFormData({ ...userFormData, gender: e.target.value })
                  }
                  className="w-full bg-white dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all"
                >
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
              <Input
                label="Position"
                value={userFormData.position}
                onChange={(e) =>
                  setUserFormData({ ...userFormData, position: e.target.value })
                }
                placeholder="e.g. Statistician"
                className="bg-white dark:bg-zinc-950/70"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/80 dark:bg-zinc-900/45 p-3 sm:p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">
                Assigned Roles
              </label>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
                {userFormData.roles.length} selected
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 max-h-36 overflow-y-auto pr-1">
              {roles.map((r, index) => {
                const isRightSide = index % 2 === 1;
                const isSelected = userFormData.roles.includes(r.name);
                return (
                  <div key={r.id} className="relative group/role-item">
                    <label
                      className={`
                      flex items-center gap-3 px-3 py-2 rounded-lg border transition-all cursor-pointer h-full
                      ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 shadow-sm"
                          : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }
                    `}
                    >
                      <input
                        type="checkbox"
                        checked={userFormData.roles.includes(r.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUserFormData({
                              ...userFormData,
                              roles: [...userFormData.roles, r.name],
                            });
                          } else {
                            setUserFormData({
                              ...userFormData,
                              roles: userFormData.roles.filter(
                                (role) => role !== r.name,
                              ),
                            });
                          }
                        }}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span
                        className={`text-[11px] font-bold uppercase tracking-[0.05em] ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-zinc-700 dark:text-zinc-300"}`}
                      >
                        {r.name}
                      </span>
                    </label>

                    <div
                      className={`
                      absolute top-0 w-52 p-2.5 rounded-xl bg-zinc-900/95 dark:bg-zinc-800/95 text-white shadow-2xl
                      opacity-0 invisible group-hover/role-item:opacity-100 group-hover/role-item:visible
                      transition-all duration-200 z-[100] pointer-events-none scale-95 group-hover/role-item:scale-100
                      border border-white/10 backdrop-blur
                      ${isRightSide ? "right-full mr-2 origin-right" : "left-full ml-2 origin-left"}
                    `}
                    >
                      <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest mb-2 pb-1.5 border-b border-white/10 flex items-center gap-1.5">
                        <ShieldCheck size={10} /> {r.name} Access
                      </p>
                      <div className="grid grid-cols-1 gap-1">
                        {r.permissions.includes("all") ? (
                          <div className="flex items-center gap-1.5 bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20">
                            <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <span className="text-[9px] uppercase font-black text-emerald-400">
                              Full Access
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {r.permissions.slice(0, 6).map((p) => (
                              <div
                                key={p}
                                className="flex items-center gap-1.5"
                              >
                                <div className="w-1 h-1 rounded-full bg-blue-500/50"></div>
                                <span className="text-[8px] uppercase font-bold text-zinc-300 leading-none">
                                  {p
                                    .split(".")
                                    .map(
                                      (part) =>
                                        part.charAt(0).toUpperCase() +
                                        part.slice(1),
                                    )
                                    .join(" • ")}
                                </span>
                              </div>
                            ))}
                            {r.permissions.length > 6 && (
                              <p className="text-[8px] text-zinc-500 font-bold mt-1 text-center italic">
                                + {r.permissions.length - 6} more
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div
                        className={`
                        absolute top-3 w-3 h-3 bg-zinc-900/95 dark:bg-zinc-800/95 rotate-45 -z-10 border-white/10
                        ${isRightSide ? "left-full -ml-1.5 border-t border-r" : "right-full -mr-1.5 border-l border-b"}
                      `}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/80 dark:bg-zinc-900/45 p-3 sm:p-4">
            <Input
              label="Password"
              type="password"
              value={userFormData.password}
              onChange={(e) =>
                setUserFormData({ ...userFormData, password: e.target.value })
              }
              placeholder={
                editingUserId ? "Leave empty to keep" : "System Password"
              }
              className="bg-white dark:bg-zinc-950/70"
            />
          </div>
        </div>
      </Modal>

      {/* Role Editor Modal */}
      <Modal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        title={
          editingRoleId ? "Edit Role Permissions" : "Create New System Role"
        }
        maxWidth="max-w-3xl"
        className="rounded-[24px] border border-zinc-200/80 dark:border-zinc-800/80 bg-gradient-to-b from-white via-zinc-50/70 to-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.65)]"
        overlayClassName="bg-zinc-950/70 backdrop-blur-[3px]"
        headerClassName="px-4 sm:px-5 py-3.5 sm:py-4 bg-white/75 dark:bg-zinc-950/75 backdrop-blur-sm border-zinc-200/70 dark:border-zinc-800/80"
        titleClassName="text-[16px] sm:text-[17px] tracking-tight text-zinc-900 dark:text-zinc-50"
        bodyClassName="px-4 sm:px-5 py-4"
        footerClassName="px-4 sm:px-5 py-3 border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/45"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              variant="ghost"
              className="!h-9 !px-4 !text-[11px]"
              onClick={() => setIsRoleModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="blue"
              className="!h-9 !px-4 !text-[11px] shadow-lg shadow-blue-500/20"
              onClick={handleSaveRole}
            >
              {editingRoleId ? "Update Role" : "Create Role"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/80 dark:bg-zinc-900/45 p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Role Name"
                value={roleFormData.name}
                onChange={(e) =>
                  setRoleFormData({ ...roleFormData, name: e.target.value })
                }
                placeholder="e.g. Region Lead"
                className="bg-white dark:bg-zinc-950/70"
              />
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">
                  Badge Color
                </label>
                <select
                  value={roleFormData.badgeColor}
                  onChange={(e) =>
                    setRoleFormData({
                      ...roleFormData,
                      badgeColor: e.target.value,
                    })
                  }
                  className="w-full bg-white dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all"
                >
                  {ROLE_BADGE_COLOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <optgroup label="Bright & Neon">
                    {ROLE_BADGE_NEON_COLOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">
                Role Description
              </label>
              <textarea
                value={roleFormData.description}
                onChange={(e) =>
                  setRoleFormData({
                    ...roleFormData,
                    description: e.target.value,
                  })
                }
                rows={2}
                className="w-full bg-white dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all resize-none"
                placeholder="Briefly describe the responsibilities of this role..."
              />
            </div>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/45 border border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-2.5">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">
              Badge Preview
            </p>
            <div
              style={getRoleBadgeStyle(roleFormData.badgeColor)}
              className="px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg transition-all duration-300 border"
            >
              {roleFormData.name || "New Role Badge"}
            </div>
            <p className="text-[10px] text-zinc-500 font-medium italic text-center">
              This is how the role will appear across the system (Header, Lists,
              Profile).
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/80 dark:bg-zinc-900/45 p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                Access Permissions
              </h4>
              <label className="flex items-center gap-2 cursor-pointer group rounded-full px-2.5 py-1 bg-blue-50/80 dark:bg-blue-500/10 border border-blue-200/70 dark:border-blue-500/25">
                <input
                  type="checkbox"
                  checked={roleFormData.permissions.includes("all")}
                  onChange={(e) => {
                    setRoleFormData({
                      ...roleFormData,
                      permissions: e.target.checked ? ["all"] : [],
                    });
                  }}
                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest group-hover:underline">
                  Super Admin Bypass
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2.5 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
              {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
                <div key={group} className="space-y-1.5">
                  <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-1">
                    <span className="text-[9px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                      {group}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {perms.map((perm) => (
                      <label
                        key={perm}
                        className={`
                        flex items-start gap-3 p-2 rounded-xl border transition-all cursor-pointer
                        ${
                          roleFormData.permissions.includes("all") ||
                          roleFormData.permissions.includes(perm as Permission)
                            ? "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 shadow-sm"
                            : "bg-zinc-50/80 dark:bg-zinc-950/60 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                        }
                      `}
                      >
                        <input
                          type="checkbox"
                          disabled={roleFormData.permissions.includes("all")}
                          checked={
                            roleFormData.permissions.includes("all") ||
                            roleFormData.permissions.includes(
                              perm as Permission,
                            )
                          }
                          onChange={(e) => {
                            const checked = e.target.checked;
                            if (checked) {
                              setRoleFormData({
                                ...roleFormData,
                                permissions: [
                                  ...roleFormData.permissions,
                                  perm as Permission,
                                ],
                              });
                            } else {
                              setRoleFormData({
                                ...roleFormData,
                                permissions: roleFormData.permissions.filter(
                                  (p) => p !== perm && p !== "all",
                                ),
                              });
                            }
                          }}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 mt-0.5"
                        />
                        <div className="flex flex-col gap-0.5 pointer-events-none">
                          <span className="text-[11px] font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.04em]">
                            {perm.split(".").pop()?.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                            {PERMISSION_DESCRIPTIONS[perm as Permission]}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* ID Generator Settings Modal */}
      <Modal
        isOpen={isRefModalOpen}
        onClose={() => setIsRefModalOpen(false)}
        title={`Reference ID Generator: ${docForRef?.name}`}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setIsRefModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="blue" onClick={handleUpdateRefConfig}>
              Save Configuration
            </Button>
          </div>
        }
      >
        {docForRef && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Prefix Code
                </label>
                <input
                  type="text"
                  value={docForRef.refPrefix}
                  onChange={(e) =>
                    setDocForRef({
                      ...docForRef,
                      refPrefix: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none"
                  placeholder="e.g. BC"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Separator
                </label>
                <input
                  type="text"
                  value={docForRef.refSeparator}
                  onChange={(e) =>
                    setDocForRef({ ...docForRef, refSeparator: e.target.value })
                  }
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none text-center"
                  placeholder="e.g. -"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Padding
                </label>
                <input
                  type="number"
                  value={docForRef.refPadding}
                  onChange={(e) =>
                    setDocForRef({
                      ...docForRef,
                      refPadding: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Increment Value
                </label>
                <input
                  type="number"
                  value={docForRef.refIncrement}
                  onChange={(e) =>
                    setDocForRef({
                      ...docForRef,
                      refIncrement: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Starting Number
                </label>
                <input
                  type="number"
                  value={docForRef.refStart}
                  onChange={(e) =>
                    setDocForRef({
                      ...docForRef,
                      refStart: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        title="Rename Document Type"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setIsRenameModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="blue" onClick={handleRename}>
              Update Name
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Display Name
            </label>
            <input
              type="text"
              value={renamedValue}
              onChange={(e) => setRenamedValue(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="e.g. Birth Certificate"
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* Dynamic Form Builder Modal */}
      <Modal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        title={`Schema Designer: ${docTypes.find((d) => d.id === selectedDocId)?.name}`}
        footer={
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="px-6 rounded-xl"
              onClick={() => setIsBuilderOpen(false)}
            >
              Done
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              Active Schema Elements
            </h4>
            <div className="space-y-2">
              {selectedDocId &&
                docFields[selectedDocId] &&
                docFields[selectedDocId].map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 group hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                  >
                    <div className="text-zinc-300 dark:text-zinc-600">
                      <GripVertical size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                          {field.label}
                        </p>
                        {field.collectionSource && (
                          <Badge variant="info" className="!text-[8px] h-4">
                            Connected
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                        {field.type}{" "}
                        {field.collectionSource
                          ? `(Source: ${field.collectionSource})`
                          : field.options &&
                            `• ${field.options.length} options`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex items-center gap-2">
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                          Req.
                        </span>
                        <button
                          onClick={() => toggleFieldRequired(field.id)}
                          className={`w-7 h-4 rounded-full flex items-center px-0.5 transition-colors ${field.required ? "bg-blue-600 justify-end" : "bg-zinc-200 dark:bg-zinc-800 justify-start"}`}
                        >
                          <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                        </button>
                      </div>
                      <button
                        onClick={() => removeField(field.id)}
                        className="p-1.5 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              Add Form Element
            </h4>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Field Label"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 outline-none text-sm focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as any)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 outline-none text-sm min-w-[140px]"
              >
                <option value="text">Short Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="select">Dropdown List</option>
                <option value="prefix">Prefix Dropdown</option>
                <option value="checkbox">Checkbox</option>
                <option value="email">Email</option>
                <option value="tel">Phone</option>
                <option value="textarea">Long Text (Textarea)</option>
                <option value="multiselect">Multi-select</option>
                <option value="url">URL Link</option>
                <option value="datetime">Date & Time</option>
                <option value="time">Time Picker</option>
                <option value="section">Section Header</option>
                <option value="rating">Rating/Stars</option>
                <option value="color">Color Picker</option>
              </select>
            </div>

            {(newFieldType === "select" || newFieldType === "prefix") && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-3">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex-1">
                    <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">
                      Option Source
                    </label>
                    <select
                      value={newFieldCollection}
                      onChange={(e) => setNewFieldCollection(e.target.value)}
                      className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs outline-none"
                    >
                      <option value="">Manual Entry (Comma Separated)</option>
                      {Object.keys(dataCollections).map((key) => (
                        <option key={key} value={key}>
                          Data Collection: {key}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {!newFieldCollection && (
                  <input
                    type="text"
                    placeholder="Item 1, Item 2, Item 3..."
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 outline-none text-sm"
                  />
                )}
              </div>
            )}

            <Button
              variant="blue"
              className="w-full rounded-xl h-12 text-[10px] font-black uppercase tracking-[0.2em]"
              onClick={addField}
            >
              <Plus size={16} className="mr-2" /> Add Field
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
