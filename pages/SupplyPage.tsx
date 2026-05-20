import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ShoppingCart,
  CheckCircle,
  Package,
  AlertTriangle,
  Search,
  Plus,
  Minus,
  Trash2,
  ClipboardList,
  FileCheck,
  History as HistoryIcon,
  XCircle,
  CheckCircle2,
  Check,
  Database,
  Info,
  UserCheck,
  PackageCheck,
  Eye,
  Settings2,
  Edit2,
  FileSpreadsheet,
  Upload,
  RefreshCcw,
  LayoutGrid,
  List,
  AlertCircle,
  Fingerprint,
  ArrowDownToLine,
  ChevronRight,
  FileText,
  PenTool,
  Download,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  Tabs,
  ProgressBar,
  Modal,
  CreatableSelect,
} from "../components/ui";
import { PermissionGate } from "../components/PermissionGate";
import { useRbac } from "../RbacContext";
import { useUsers } from "../UserContext";
import { useDialog } from "../DialogContext";
import { useToast } from "../ToastContext";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import {
  readStorageJson,
  readStorageJsonSafe,
  readStorageString,
  setStorageItem,
  writeStorageJson,
} from "../services/storage";

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  physicalQty: number;
  pendingQty: number;
  reorderPoint: number;
}

type RequestStatus =
  | "For Verification"
  | "Awaiting Approval"
  | "For Issuance"
  | "To Receive"
  | "Rejected"
  | "History";

interface SupplyRequest {
  id: string;
  items: {
    id: string;
    name: string;
    qty: number;
    requestedQty: number;
    unit: string;
  }[];
  purpose: string;
  status: RequestStatus;
  date: string;
  requester: string;
  requesterId: string;
  approverId?: string;
  issuedById?: string;
  receivedById?: string;
}

type ImportColumnKey = "itemName" | "unit" | "quantity" | "reorderPoint";

interface ParsedImportRow {
  name: string;
  unit: string;
  quantity: number;
  reorderPoint: number;
}

interface ParsedImportSkippedRow {
  rowNumber: number;
  itemName: string;
  quantity: string;
  reason: string;
}

interface ParsedImportResult {
  rows: ParsedImportRow[];
  skippedRows: ParsedImportSkippedRow[];
  detectedColumns: Record<ImportColumnKey, boolean>;
  missingColumns: ImportColumnKey[];
}

const IMPORT_COLUMN_LABELS: Record<ImportColumnKey, string> = {
  itemName: "Item Name",
  unit: "Unit",
  quantity: "Quantity",
  reorderPoint: "Re-order Point",
};

const IMPORT_COLUMN_ALIASES: Record<ImportColumnKey, string[]> = {
  itemName: [
    "item name",
    "item",
    "name",
    "stock item",
    "item description",
    "description",
  ],
  unit: ["unit", "uom", "unit of measure", "measure"],
  quantity: [
    "quantity",
    "qty",
    "physical qty",
    "physical quantity",
    "current stock",
    "on hand",
  ],
  reorderPoint: [
    "reorder point",
    "re-order point",
    "re order point",
    "minimum stock",
    "min stock",
    "rop",
  ],
};

const IMPORT_COLUMN_ALIASES_NORMALIZED: Record<ImportColumnKey, string[]> = {
  itemName: IMPORT_COLUMN_ALIASES.itemName.map((alias) =>
    normalizeImportToken(alias),
  ),
  unit: IMPORT_COLUMN_ALIASES.unit.map((alias) => normalizeImportToken(alias)),
  quantity: IMPORT_COLUMN_ALIASES.quantity.map((alias) =>
    normalizeImportToken(alias),
  ),
  reorderPoint: IMPORT_COLUMN_ALIASES.reorderPoint.map((alias) =>
    normalizeImportToken(alias),
  ),
};

const EMPTY_IMPORT_COLUMN_DETECTION: Record<ImportColumnKey, boolean> = {
  itemName: false,
  unit: false,
  quantity: false,
  reorderPoint: false,
};

function normalizeImportToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const parseImportNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return Number.NaN;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
};

const normalizeInventoryName = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const INVENTORY_ITEM_ICON_RULES: {
  keywords: string[];
  icon: React.ElementType;
}[] = [
  {
    keywords: ["paper", "form", "document", "folder", "sheet", "bond"],
    icon: FileText,
  },
  {
    keywords: ["pen", "pencil", "marker", "staple", "tape", "clip", "binder"],
    icon: PenTool,
  },
  { keywords: ["ink", "toner", "cartridge", "bottle"], icon: PackageCheck },
  {
    keywords: ["printer", "scanner", "cable", "adapter", "device", "equipment"],
    icon: Settings2,
  },
  { keywords: ["box", "pack", "ream", "carton", "kit"], icon: ClipboardList },
];

const getInventoryItemIcon = (itemName: string): React.ElementType => {
  const normalizedName = itemName.toLowerCase();
  const matchedRule = INVENTORY_ITEM_ICON_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalizedName.includes(keyword)),
  );
  return matchedRule?.icon || Package;
};

const parseImportSpreadsheet = async (
  file: File,
): Promise<ParsedImportResult> => {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("The selected file has no worksheet.");
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  }) as unknown[];

  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error("The selected file is empty.");
  }

  const rows = matrix.filter((entry): entry is unknown[] =>
    Array.isArray(entry),
  );
  const headerCandidates = rows
    .map((row, index) => {
      const normalized = row
        .map((cell) => normalizeImportToken(cell))
        .filter(Boolean);
      const score = (
        Object.keys(IMPORT_COLUMN_ALIASES_NORMALIZED) as ImportColumnKey[]
      ).reduce((count, key) => {
        if (
          normalized.some((header) =>
            IMPORT_COLUMN_ALIASES_NORMALIZED[key].includes(header),
          )
        ) {
          return count + 1;
        }
        return count;
      }, 0);

      return { index, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const headerIndex =
    headerCandidates.length > 0 ? headerCandidates[0].index : -1;

  if (headerIndex === -1) {
    throw new Error(
      "Unable to find a valid header row. Include Item Name, Unit, Quantity, and Re-order Point columns.",
    );
  }

  const headerRow = rows[headerIndex] || [];
  const normalizedHeaders = headerRow.map((cell) => normalizeImportToken(cell));
  const detectedColumns = { ...EMPTY_IMPORT_COLUMN_DETECTION };

  const columnIndexByKey = {} as Record<ImportColumnKey, number>;

  (Object.keys(IMPORT_COLUMN_ALIASES_NORMALIZED) as ImportColumnKey[]).forEach(
    (key) => {
      const aliases = IMPORT_COLUMN_ALIASES_NORMALIZED[key];
      const index = normalizedHeaders.findIndex((header) =>
        aliases.includes(header),
      );
      columnIndexByKey[key] = index;
      detectedColumns[key] = index !== -1;
    },
  );

  const missingColumns = (
    Object.keys(detectedColumns) as ImportColumnKey[]
  ).filter((key) => !detectedColumns[key]);
  if (missingColumns.length > 0) {
    return {
      rows: [],
      skippedRows: [],
      detectedColumns,
      missingColumns,
    };
  }

  const parsedRows: ParsedImportRow[] = [];
  const skippedRows: ParsedImportSkippedRow[] = [];

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const hasAnyValue = row.some((cell) => normalizeImportToken(cell) !== "");
    if (!hasAnyValue) continue;

    const rawName = String(row[columnIndexByKey.itemName] ?? "").trim();
    const rawUnit = String(row[columnIndexByKey.unit] ?? "").trim();
    const quantity = parseImportNumber(row[columnIndexByKey.quantity]);
    const reorderPoint = parseImportNumber(row[columnIndexByKey.reorderPoint]);

    if (!rawName || !Number.isFinite(quantity) || quantity < 0) {
      const reason = !rawName
        ? "Missing item name"
        : !Number.isFinite(quantity)
          ? "Quantity is not a valid number"
          : "Quantity cannot be negative";

      skippedRows.push({
        rowNumber: rowIndex + 1,
        itemName: rawName || "(empty)",
        quantity: String(row[columnIndexByKey.quantity] ?? "").trim() || "-",
        reason,
      });
      continue;
    }

    parsedRows.push({
      name: rawName,
      unit: rawUnit || "Units",
      quantity: Math.round(quantity),
      reorderPoint:
        Number.isFinite(reorderPoint) && reorderPoint > 0
          ? Math.round(reorderPoint)
          : 0,
    });
  }

  return {
    rows: parsedRows,
    skippedRows,
    detectedColumns,
    missingColumns: [],
  };
};

const DEFAULT_INVENTORY: InventoryItem[] = [
  {
    id: "1",
    name: "A4 Printing Paper",
    unit: "Reams",
    physicalQty: 240,
    pendingQty: 15,
    reorderPoint: 50,
  },
  {
    id: "2",
    name: "SECPA Forms",
    unit: "Forms",
    physicalQty: 1500,
    pendingQty: 200,
    reorderPoint: 500,
  },
  {
    id: "3",
    name: "Epson 003 Ink (Black)",
    unit: "Bottles",
    physicalQty: 35,
    pendingQty: 5,
    reorderPoint: 10,
  },
  {
    id: "4",
    name: "Epson 003 Ink (Cyan)",
    unit: "Bottles",
    physicalQty: 40,
    pendingQty: 0,
    reorderPoint: 10,
  },
  {
    id: "5",
    name: "Epson 003 Ink (Magenta)",
    unit: "Bottles",
    physicalQty: 42,
    pendingQty: 0,
    reorderPoint: 10,
  },
  {
    id: "6",
    name: "Epson 003 Ink (Yellow)",
    unit: "Bottles",
    physicalQty: 38,
    pendingQty: 0,
    reorderPoint: 10,
  },
  {
    id: "7",
    name: "Ballpoint Pen (Black)",
    unit: "Boxes",
    physicalQty: 120,
    pendingQty: 10,
    reorderPoint: 20,
  },
  {
    id: "8",
    name: "Correction Tape",
    unit: "Pcs",
    physicalQty: 85,
    pendingQty: 0,
    reorderPoint: 15,
  },
  {
    id: "9",
    name: "Staple Wire #35",
    unit: "Boxes",
    physicalQty: 200,
    pendingQty: 0,
    reorderPoint: 30,
  },
  {
    id: "10",
    name: "Folder (Long, White)",
    unit: "Packs",
    physicalQty: 150,
    pendingQty: 20,
    reorderPoint: 40,
  },
];

const DEFAULT_REQUESTS: SupplyRequest[] = [
  {
    id: "REQ-001",
    items: [
      {
        id: "2",
        name: "SECPA Forms",
        qty: 100,
        requestedQty: 100,
        unit: "Forms",
      },
    ],
    purpose: "Monthly Civil Registry allocation for Baler Municipality",
    status: "For Verification",
    date: "2h ago",
    requester: "Registry Div",
    requesterId: "2",
  },
  {
    id: "REQ-002",
    items: [
      {
        id: "1",
        name: "A4 Printing Paper",
        qty: 10,
        requestedQty: 10,
        unit: "Reams",
      },
    ],
    purpose: "Standard office replenishment",
    status: "Awaiting Approval",
    date: "5h ago",
    requester: "Admin Dept",
    requesterId: "1",
  },
];

const RequestStatusTimeline = ({
  status,
  isWide = false,
}: {
  status: RequestStatus;
  isWide?: boolean;
}) => {
  const steps: { label: RequestStatus; icon: any; color: string }[] = [
    { label: "For Verification", icon: FileCheck, color: "blue" },
    { label: "Awaiting Approval", icon: Fingerprint, color: "amber" }, // Fingerprint icon is still used here
    { label: "For Issuance", icon: Package, color: "indigo" },
    { label: "To Receive", icon: ArrowDownToLine, color: "emerald" }, // ArrowDownToLine icon is still used here
  ];

  const getCurrentStepIndex = () => {
    if (status === "Rejected") return -1;
    if (status === "History") return steps.length;
    return steps.findIndex((s) => s.label === status);
  };

  const currentStepIndex = getCurrentStepIndex();

  if (status === "Rejected") {
    return (
      <div className="flex items-center gap-2 p-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg border border-red-100 dark:border-red-800">
        <XCircle size={14} />
        <span className="text-[9px] font-black uppercase tracking-widest">
          Request Rejected
        </span>
      </div>
    );
  }

  const getColorClass = (
    color: string,
    type: "bg" | "text" | "border" | "shadow",
  ) => {
    const classes: any = {
      blue: {
        bg: "bg-blue-500",
        text: "text-blue-500",
        border: "border-blue-500",
        shadow: "shadow-blue-500/20",
      },
      amber: {
        bg: "bg-amber-500",
        text: "text-amber-500",
        border: "border-amber-500",
        shadow: "shadow-amber-500/20",
      },
      indigo: {
        bg: "bg-indigo-500",
        text: "text-indigo-500",
        border: "border-indigo-500",
        shadow: "shadow-indigo-500/20",
      },
      emerald: {
        bg: "bg-emerald-500",
        text: "text-emerald-500",
        border: "border-emerald-500",
        shadow: "shadow-emerald-500/20",
      },
      zinc: {
        bg: "bg-zinc-500",
        text: "text-zinc-500",
        border: "border-zinc-500",
        shadow: "shadow-zinc-500/20",
      },
    };
    return classes[color]?.[type] || "";
  };

  return (
    <div className={`flex items-center ${isWide ? "w-full" : ""}`}>
      <div
        className={`flex items-center ${isWide ? "justify-between w-full" : "justify-start gap-2.5"} relative`}
      >
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isActive = index === currentStepIndex;
          const isPending = index > currentStepIndex;
          const isLast = index === steps.length - 1;
          const StepIcon = step.icon;

          return (
            <React.Fragment key={step.label}>
              <div
                className={`flex flex-col items-center relative group ${isWide ? "flex-1" : ""}`}
              >
                <div
                  className={`
                    w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-500 z-10 relative
                    ${isCompleted ? `${getColorClass(step.color, "bg")} border-transparent text-white scale-90 shadow-sm` : ""}
                    ${isActive ? `bg-white dark:bg-zinc-950 ${getColorClass(step.color, "border")} ${getColorClass(step.color, "text")} scale-110 shadow-lg ${getColorClass(step.color, "shadow")}` : ""}
                    ${isPending ? "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 scale-75" : ""}
                  `}
                >
                  {isCompleted ? (
                    <Check size={12} strokeWidth={4} />
                  ) : (
                    <div className="relative flex items-center justify-center">
                      <StepIcon
                        size={12}
                        strokeWidth={isActive ? 3 : 2}
                        className={
                          isActive ? "animate-in zoom-in duration-300" : ""
                        }
                      />
                      {isActive && (
                        <div
                          className={`absolute -inset-1 animate-ping rounded-full ${getColorClass(step.color, "bg")} opacity-20`}
                        />
                      )}
                    </div>
                  )}

                  {isActive && (
                    <Plus
                      size={8}
                      strokeWidth={5}
                      className="absolute -top-1 -right-1 bg-white dark:bg-zinc-900 rounded-full text-blue-600 shadow-sm animate-pulse"
                    />
                  )}
                </div>

                {isActive && !isWide && (
                  <span
                    className={`text-[10px] font-black uppercase tracking-tighter ${getColorClass(step.color, "text")} animate-in fade-in slide-in-from-left-2 duration-500 ml-1`}
                  >
                    {step.label
                      .replace("For ", "")
                      .replace("Awaiting ", "")
                      .replace("To ", "")}
                  </span>
                )}

                <div
                  className={`
                  ${isWide ? "mt-2 static" : "hidden"}
                  ${isActive || isWide ? "block" : "hidden"}
                  text-[8px] font-black uppercase tracking-[0.05em] whitespace-nowrap transition-all duration-500
                  ${isActive ? `${getColorClass(step.color, "text")} opacity-100 scale-110 drop-shadow-sm` : "text-black dark:text-zinc-400 opacity-60"}
                `}
                >
                  {step.label
                    .replace("For ", "")
                    .replace("Awaiting ", "")
                    .replace("To ", "")}
                </div>
              </div>

              {!isLast && (
                <div
                  className={`flex items-center ${isWide ? "flex-auto justify-center" : ""} ${index < currentStepIndex ? "text-blue-500" : index === currentStepIndex ? "text-blue-400" : "text-zinc-400 dark:text-zinc-600"}`}
                >
                  <ChevronRight // ChevronRight icon is still used here
                    size={isWide ? 14 : 10}
                    strokeWidth={4}
                    className={`${index === currentStepIndex ? "animate-pulse" : ""} ${index < currentStepIndex ? "opacity-100" : "opacity-60"}`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// Compact Badge for Table View
const RequestBadge = ({ status }: { status: RequestStatus }) => {
  const getStatusConfig = (s: RequestStatus) => {
    switch (s) {
      case "For Verification":
        return {
          color:
            "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
          icon: FileCheck,
        };
      case "Awaiting Approval":
        return {
          color:
            "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
          icon: Fingerprint,
        }; // Fingerprint icon is still used here
      case "For Issuance":
        return {
          color:
            "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800",
          icon: Package,
        };
      case "To Receive":
        return {
          color:
            "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
          icon: ArrowDownToLine,
        }; // ArrowDownToLine icon is still used here
      case "History":
        return {
          color:
            "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
          icon: CheckCircle2,
        };
      case "Rejected":
        return {
          color:
            "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
          icon: XCircle,
        };
      default:
        return {
          color: "bg-zinc-100 text-zinc-700 border-zinc-200",
          icon: Info,
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <span
      className={`flex items-center gap-1.5 text-[8px] uppercase font-black tracking-widest px-2 py-0.5 rounded-lg border ${config.color} shadow-sm transition-all hover:scale-105`}
    >
      <Icon
        size={10}
        strokeWidth={isActiveStatus(status) ? 3 : 2}
        className={isActiveStatus(status) ? "animate-pulse" : ""}
      />
      {status}
    </span>
  );
};

const isActiveStatus = (s: RequestStatus) =>
  s !== "History" && s !== "Rejected";

export const SupplyPage: React.FC = () => {
  const { currentUser, users } = useUsers();
  const { alert } = useDialog();
  const { toast } = useToast();
  const { can } = useRbac();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsSnapshot = searchParams.toString();
  const tabParam = searchParams.get("tab") || "";
  const actionParam = searchParams.get("action") || "";
  // -- State for Tabs --
  const [activeTab, setActiveTab] = useState("items");
  const [activeInventoryTab, setActiveInventoryTab] = useState("all");
  const [activeApprovalTab, setActiveApprovalTab] =
    useState<RequestStatus>("For Verification");

  // -- State for Inventory --
  const [inventory, setInventory] = useLocalStorageState<InventoryItem[]>(
    STORAGE_KEYS.supplyInventory,
    DEFAULT_INVENTORY,
  );
  const [itemSearch, setItemSearch] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [itemsViewMode, setItemsViewMode] = useState<"list" | "grid">(() => {
    return (
      (readStorageString(STORAGE_KEYS.supplyItemsView) as "list" | "grid") ||
      "grid"
    );
  });
  const [inventoryViewMode, setInventoryViewMode] = useState<"list" | "grid">(
    () => {
      return (
        (readStorageString(STORAGE_KEYS.supplyInventoryView) as
          | "list"
          | "grid") || "list"
      );
    },
  );
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>(
    {},
  );

  // -- State for Cart/Requests --
  const [requestCart, setRequestCart] = useLocalStorageState<
    { itemId: string; qty: number }[]
  >(STORAGE_KEYS.supplyCart, []);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestPurpose, setRequestPurpose] = useState(() => {
    return readStorageString(STORAGE_KEYS.supplyRequestPurpose);
  });

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.supplyItemsView, itemsViewMode);
  }, [itemsViewMode]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.supplyInventoryView, inventoryViewMode);
  }, [inventoryViewMode]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.supplyRequestPurpose, requestPurpose);
  }, [requestPurpose]);

  // -- State for Modals/Editing --
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [importSkippedRows, setImportSkippedRows] = useState<
    ParsedImportSkippedRow[]
  >([]);
  const [importDetectedColumns, setImportDetectedColumns] = useState<
    Record<ImportColumnKey, boolean>
  >(EMPTY_IMPORT_COLUMN_DETECTION);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportingStock, setIsImportingStock] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemFormData, setItemFormData] = useState({
    name: "",
    unit: "Reams",
    physicalQty: 0,
    reorderPoint: 0,
  });
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SupplyRequest | null>(
    null,
  );

  // --- Helper Functions ---
  const updateItemModifier = (itemId: string, delta: number) => {
    setItemQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(1, (prev[itemId] || 1) + delta),
    }));
  };

  const handleAddItemToCart = (itemId: string) => {
    const qtyToAdd = itemQuantities[itemId] || 1;
    const existing = requestCart.find((c) => c.itemId === itemId);
    if (existing) {
      setRequestCart(
        requestCart.map((c) =>
          c.itemId === itemId ? { ...c, qty: c.qty + qtyToAdd } : c,
        ),
      );
    } else {
      setRequestCart([...requestCart, { itemId, qty: qtyToAdd }]);
    }
    // Reset modifier
    setItemQuantities((prev) => ({ ...prev, [itemId]: 1 }));
    toast("success", "Item added to request cart");
  };

  const handleRemoveFromCart = (itemId: string) => {
    setRequestCart(requestCart.filter((c) => c.itemId !== itemId));
    toast("info", "Item removed from cart");
  };

  const openDetailModal = (req: SupplyRequest) => {
    setSelectedRequest(JSON.parse(JSON.stringify(req)));
    setIsDetailModalOpen(true);
  };

  const updateSelectedRequestQty = (itemId: string, delta: number) => {
    if (!selectedRequest) return;
    const updatedItems = selectedRequest.items.map((item) => {
      if (item.id === itemId) {
        return { ...item, qty: Math.max(0, item.qty + delta) };
      }
      return item;
    });
    setSelectedRequest({ ...selectedRequest, items: updatedItems });
  };

  const saveRequestModification = () => {
    if (!selectedRequest) return;
    setRequests(
      requests.map((r) => (r.id === selectedRequest.id ? selectedRequest : r)),
    );
    setIsDetailModalOpen(false);
    setSelectedRequest(null);
  };

  // -- State for Requests --
  const [requests, setRequests] = useLocalStorageState<SupplyRequest[]>(
    STORAGE_KEYS.supplyRequests,
    DEFAULT_REQUESTS,
  );

  const generateRequestId = () => {
    const fallbackConfig = {
      prefix: "RIS",
      separator: "-",
      padding: 4,
      increment: 1,
      startNumber: 1,
    };

    let config = fallbackConfig;
    try {
      const parsed = readStorageJsonSafe<unknown>(
        STORAGE_KEYS.supplyRisConfig,
        null,
      );
      if (parsed && typeof parsed === "object") {
        config = {
          prefix: String((parsed as any).prefix || fallbackConfig.prefix),
          separator: String(
            (parsed as any).separator ?? fallbackConfig.separator,
          ),
          padding: Math.max(
            1,
            Number((parsed as any).padding) || fallbackConfig.padding,
          ),
          increment: Math.max(
            1,
            Number((parsed as any).increment) || fallbackConfig.increment,
          ),
          startNumber: Math.max(
            1,
            Number((parsed as any).startNumber) || fallbackConfig.startNumber,
          ),
        };
      }
    } catch {
      config = fallbackConfig;
    }

    const marker = `${config.prefix}${config.separator}`;
    const highest = requests.reduce((max, request) => {
      if (!request.id.startsWith(marker)) return max;
      const numericPart = Number(request.id.slice(marker.length));
      if (Number.isFinite(numericPart)) {
        return Math.max(max, numericPart);
      }
      return max;
    }, config.startNumber - config.increment);

    const nextNumber = highest + config.increment;
    return `${config.prefix}${config.separator}${String(nextNumber).padStart(config.padding, "0")}`;
  };

  // ... (cart handlers remain the same)

  const handleSubmitRequest = async () => {
    if (requestCart.length === 0 || !requestPurpose.trim()) {
      await alert("Please select items and provide a purpose.");
      return;
    }

    const newReqItems = requestCart.map((cartItem) => {
      const invItem = inventory.find((i) => i.id === cartItem.itemId)!;
      return {
        id: invItem.id,
        name: invItem.name,
        qty: cartItem.qty,
        requestedQty: cartItem.qty,
        unit: invItem.unit,
      };
    });

    const newReq: SupplyRequest = {
      id: generateRequestId(),
      items: newReqItems,
      purpose: requestPurpose,
      status: "For Verification",
      date: "Just now",
      requester: currentUser?.name || "Unknown",
      requesterId: currentUser?.id || "unknown",
    };

    setInventory(
      inventory.map((invItem) => {
        const cartItem = requestCart.find((c) => c.itemId === invItem.id);
        if (cartItem) {
          return { ...invItem, pendingQty: invItem.pendingQty + cartItem.qty };
        }
        return invItem;
      }),
    );

    setRequests([newReq, ...requests]);
    setRequestCart([]);
    setRequestPurpose("");
    setIsRequestModalOpen(false);
    toast("success", "Requisition request submitted successfully");
  };

  // --- Workflow Handlers ---

  const handleVerify = (reqId: string) => {
    // Use selectedRequest which has the supply officer's modified quantities
    const request = selectedRequest || requests.find((r) => r.id === reqId);
    if (!request) return;

    setInventory((prev) =>
      prev.map((invItem) => {
        const reqItem = request.items.find((ri) => ri.id === invItem.id);
        if (reqItem) {
          return {
            ...invItem,
            physicalQty: invItem.physicalQty - reqItem.qty,
            pendingQty: invItem.pendingQty - reqItem.requestedQty,
          };
        }
        return invItem;
      }),
    );

    // Save the modified request (preserving qty changes) AND update status
    setRequests((prev) =>
      prev.map((r) =>
        r.id === reqId
          ? { ...request, status: "Awaiting Approval" as RequestStatus }
          : r,
      ),
    );
    setIsDetailModalOpen(false);
    setSelectedRequest(null);
    toast("success", `Request ${reqId} verified`);
  };

  const handleApprove = (reqId: string) => {
    // Capture the approver's ID (current user)
    setRequests((prev) =>
      prev.map((r) =>
        r.id === reqId
          ? {
              ...r,
              status: "For Issuance",
              approverId: currentUser?.id,
            }
          : r,
      ),
    );
    toast("success", `Request ${reqId} approved`);
  };

  const handleIssue = (reqId: string) => {
    // Capture the issuer's ID (current user)
    setRequests((prev) =>
      prev.map((r) =>
        r.id === reqId
          ? {
              ...r,
              status: "To Receive",
              issuedById: currentUser?.id,
            }
          : r,
      ),
    );
    toast("success", `Items issued for ${reqId}`);
  };

  const handleReceive = (reqId: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === reqId
          ? {
              ...r,
              status: "History",
              receivedById: currentUser?.id,
            }
          : r,
      ),
    );
    toast("success", `Request ${reqId} marked as received`);
  };

  const handleReject = (reqId: string) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === reqId ? { ...r, status: "Rejected" } : r)),
    );
    toast("warning", `Request ${reqId} rejected`);
  };

  const handleSaveItem = () => {
    if (!itemFormData.name || !itemFormData.unit) return;

    if (editingItem) {
      setInventory(
        inventory.map((i) =>
          i.id === editingItem.id ? { ...i, ...itemFormData } : i,
        ),
      );
    } else {
      const item: InventoryItem = {
        id: Date.now().toString(),
        ...itemFormData,
        pendingQty: 0,
      };
      setInventory([...inventory, item]);
    }

    setItemFormData({
      name: "",
      unit: "Reams",
      physicalQty: 0,
      reorderPoint: 0,
    });
    setEditingItem(null);
    setIsNewItemModalOpen(false);
    toast("success", `Inventory item ${editingItem ? "updated" : "added"}`);
  };

  const openEditItemModal = (item: InventoryItem) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name,
      unit: item.unit,
      physicalQty: item.physicalQty,
      reorderPoint: item.reorderPoint,
    });
    setIsNewItemModalOpen(true);
  };

  const resetImportState = () => {
    setImportFileName("");
    setImportRows([]);
    setImportSkippedRows([]);
    setImportDetectedColumns({ ...EMPTY_IMPORT_COLUMN_DETECTION });
    setImportError(null);
  };

  const closeImportModal = () => {
    setIsImportModalOpen(false);
    resetImportState();
  };

  const handleImportFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportError(null);
    setImportRows([]);
    setImportSkippedRows([]);

    try {
      const parsed = await parseImportSpreadsheet(file);
      setImportDetectedColumns(parsed.detectedColumns);
      setImportRows(parsed.rows);
      setImportSkippedRows(parsed.skippedRows);

      if (parsed.missingColumns.length > 0) {
        const missingLabels = parsed.missingColumns
          .map((key) => IMPORT_COLUMN_LABELS[key])
          .join(", ");
        const message = `Missing required columns: ${missingLabels}.`;
        setImportError(message);
        toast("error", message);
        return;
      }

      if (parsed.rows.length === 0) {
        const message =
          parsed.skippedRows.length > 0
            ? `All parsed rows were skipped. Review ${parsed.skippedRows.length} row${parsed.skippedRows.length === 1 ? "" : "s"} below.`
            : "No valid rows were found. Ensure quantity values are non-negative numbers.";
        setImportError(message);
        toast("warning", message);
        return;
      }

      if (parsed.skippedRows.length > 0) {
        toast(
          "warning",
          `${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"} ready, ${parsed.skippedRows.length} skipped.`,
        );
      } else {
        toast(
          "success",
          `${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"} ready for import.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to read the selected file.";
      setImportDetectedColumns({ ...EMPTY_IMPORT_COLUMN_DETECTION });
      setImportError(message);
      toast("error", message);
    } finally {
      event.target.value = "";
    }
  };

  const handleImportStock = () => {
    if (!importFileName) {
      toast("warning", "Please upload an Excel or CSV file first.");
      return;
    }

    if (importRows.length === 0) {
      toast("warning", "No valid stock rows are available to import.");
      return;
    }

    setIsImportingStock(true);

    let addedCount = 0;
    let updatedCount = 0;

    setInventory((prev) => {
      const next = prev.map((item) => ({ ...item }));
      const indexByName = new Map<string, number>();

      next.forEach((item, index) => {
        indexByName.set(normalizeInventoryName(item.name), index);
      });

      importRows.forEach((row) => {
        const key = normalizeInventoryName(row.name);
        const existingIndex = indexByName.get(key);

        if (existingIndex !== undefined) {
          const existing = next[existingIndex];
          next[existingIndex] = {
            ...existing,
            physicalQty: existing.physicalQty + row.quantity,
            reorderPoint:
              row.reorderPoint > 0
                ? Math.max(existing.reorderPoint, row.reorderPoint)
                : existing.reorderPoint,
            unit: existing.unit || row.unit,
          };
          updatedCount += 1;
          return;
        }

        const newItemId =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        next.push({
          id: newItemId,
          name: row.name,
          unit: row.unit,
          physicalQty: row.quantity,
          pendingQty: 0,
          reorderPoint: row.reorderPoint,
        });

        indexByName.set(key, next.length - 1);
        addedCount += 1;
      });

      return next;
    });

    const skippedSuffix =
      importSkippedRows.length > 0
        ? `, ${importSkippedRows.length} skipped`
        : "";
    toast(
      "success",
      `Stock import completed: ${addedCount} added, ${updatedCount} updated${skippedSuffix}.`,
    );

    setIsImportingStock(false);
    closeImportModal();
  };

  const handleGenerateRIS = useCallback(
    async (request: SupplyRequest, mode: "print" | "download" = "print") => {
      try {
        const { generateRIS } = await import("../services/risGenerator");
        await generateRIS(request, users, mode);
      } catch (error) {
        console.error("Failed to generate RIS", error);
        toast("error", "Unable to generate RIS.");
      }
    },
    [toast, users],
  );

  // --- Filtering ---
  const filteredItems = inventory.filter((i) =>
    i.name.toLowerCase().includes(itemSearch.toLowerCase()),
  );
  const filteredInventory = inventory.filter((i) => {
    const matchSearch = i.name
      .toLowerCase()
      .includes(inventorySearch.toLowerCase());
    const matchTab =
      activeInventoryTab === "all" || i.physicalQty <= i.reorderPoint;
    return matchSearch && matchTab;
  });

  const tabs = useMemo(() => {
    const allTabs = [
      {
        id: "items",
        label: "Items",
        icon: Database,
        permission: "supply.view" as const,
      },
      {
        id: "my-requests",
        label: "My Request",
        icon: UserCheck,
        permission: "supply.view" as const,
      },
      {
        id: "approval",
        label: "Approval",
        icon: CheckCircle,
        permission: "supply.approve" as const,
      },
      {
        id: "inventory",
        label: "Inventory",
        icon: Package,
        permission: "supply.inventory" as const,
      },
    ];
    return allTabs.filter((tab) => can(tab.permission));
  }, [can]);

  // Ensure active tab is valid if permissions change
  useEffect(() => {
    if (!tabs.find((t) => t.id === activeTab) && tabs.length > 0) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    if (!tabParam) return;
    if (tabParam === activeTab) return;
    if (!tabs.find((tab) => tab.id === tabParam)) return;
    setActiveTab(tabParam);
  }, [tabParam, tabs, activeTab]);

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

  useEffect(() => {
    if (!actionParam) return;

    if (actionParam === "new-request" && can("supply.request")) {
      const next = new URLSearchParams(searchParamsSnapshot);
      next.delete("action");
      setSearchParams(next, { replace: true });
      setIsRequestModalOpen(true);
      return;
    }

    if (actionParam === "new-item" && can("supply.inventory")) {
      const next = new URLSearchParams(searchParamsSnapshot);
      next.delete("action");
      setSearchParams(next, { replace: true });
      setEditingItem(null);
      setItemFormData({
        name: "",
        unit: "Reams",
        physicalQty: 0,
        reorderPoint: 0,
      });
      setIsNewItemModalOpen(true);
    }
  }, [actionParam, searchParamsSnapshot, setSearchParams, can]);

  const approvalTabs: { id: RequestStatus; icon: any }[] = [
    { id: "For Verification", icon: FileCheck },
    { id: "Awaiting Approval", icon: Fingerprint },
    { id: "For Issuance", icon: Package },
    { id: "To Receive", icon: ArrowDownToLine },
    { id: "Rejected", icon: XCircle },
    { id: "History", icon: CheckCircle2 },
  ];

  const lowStockItems = inventory.filter(
    (item) => item.physicalQty <= item.reorderPoint,
  );
  const exportableLowStockItems =
    activeInventoryTab === "low"
      ? filteredInventory.filter(
          (item) => item.physicalQty <= item.reorderPoint,
        )
      : lowStockItems;

  const handleExportLowStock = async () => {
    if (exportableLowStockItems.length === 0) {
      toast("warning", "No low stock items to export.");
      return;
    }

    const XLSX = await import("xlsx");

    const rows = exportableLowStockItems.map((item) => ({
      "Item Name": item.name,
      Unit: item.unit,
      "Physical Qty": item.physicalQty,
      "Pending Qty": item.pendingQty,
      "Available Qty": item.physicalQty - item.pendingQty,
      "Re-order Point": item.reorderPoint,
      "Replenishment Gap": Math.max(item.reorderPoint - item.physicalQty, 0),
      Status: item.physicalQty <= 0 ? "Out of Stock" : "Low Stock",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 36 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 16 },
      { wch: 14 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Low Stock");

    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `low-stock-${dateStamp}.xlsx`);

    toast(
      "success",
      `${rows.length} low stock item${rows.length === 1 ? "" : "s"} exported.`,
    );
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight uppercase">
            Supply & Logistics
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium mt-1 uppercase tracking-widest">
            Provincial Resource Control
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            className="border-b-0 mb-0"
          />
          <div className="hidden sm:block h-8 w-px bg-zinc-200 dark:bg-zinc-800 mx-2" />
        </div>
      </div>

      {/* ITEMS TAB */}
      {activeTab === "items" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative group w-full md:flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-500 transition-colors"
                size={14}
              />
              <input
                type="text"
                placeholder="Search available stock..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-xs shadow-sm"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
              <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setItemsViewMode("list")}
                  className={`p-1.5 rounded-lg transition-all ${itemsViewMode === "list" ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" : "text-zinc-400"}`}
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setItemsViewMode("grid")}
                  className={`p-1.5 rounded-lg transition-all ${itemsViewMode === "grid" ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" : "text-zinc-400"}`}
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
              <PermissionGate requires="supply.request">
                <Button
                  variant="blue"
                  className="px-4 h-[38px] rounded-xl shadow-lg shadow-blue-500/20 text-[10px] font-black uppercase flex-1 md:flex-initial"
                  onClick={() => setIsRequestModalOpen(true)}
                >
                  <ShoppingCart size={14} className="mr-2" /> Cart (
                  {requestCart.length})
                </Button>
              </PermissionGate>
            </div>
          </div>

          {itemsViewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 animate-in fade-in duration-300">
              {filteredItems.map((item) => {
                const available = item.physicalQty - item.pendingQty;
                const isLow = item.physicalQty <= item.reorderPoint;
                const ItemIcon = getInventoryItemIcon(item.name);
                return (
                  <Card
                    key={item.id}
                    className="!p-2.5 border-zinc-100 dark:border-zinc-800/80 hover:border-blue-500/30 group flex flex-col h-full bg-white dark:bg-zinc-900/40 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 shadow-sm border border-blue-100 dark:border-blue-500/20 transition-transform group-hover:scale-110">
                        <ItemIcon size={14} />
                      </div>
                      <Badge
                        variant={
                          available <= 0
                            ? "warning"
                            : isLow
                              ? "warning"
                              : "info"
                        }
                        className="!text-[8px] h-4 px-1.5 font-black tracking-wider uppercase border-transparent"
                      >
                        {available <= 0 ? "Out" : isLow ? "Low" : "In"}
                      </Badge>
                    </div>

                    <div className="flex-1 mb-2.5">
                      <h4 className="text-[13px] font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tight leading-[1.3] line-clamp-2 min-h-[34px] group-hover:text-blue-600 transition-colors">
                        {item.name}
                      </h4>
                      <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest mt-1 opacity-60">
                        {item.unit}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 mb-3">
                      <div className="flex-1 flex flex-col items-center bg-zinc-50 dark:bg-zinc-900 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700/80 shadow-sm">
                        <span className="text-[6px] text-zinc-700 dark:text-zinc-200 font-black uppercase tracking-[0.08em] leading-none">
                          Phys
                        </span>
                        <span className="text-[10px] font-black text-zinc-900 dark:text-white mt-1">
                          {item.physicalQty}
                        </span>
                      </div>
                      <div className="flex-1 flex flex-col items-center bg-amber-50/80 dark:bg-amber-500/15 py-1.5 rounded-lg border border-amber-200 dark:border-amber-500/40 shadow-sm">
                        <span className="text-[6px] text-amber-700 dark:text-amber-300 font-black uppercase tracking-[0.08em] leading-none">
                          Pend
                        </span>
                        <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 mt-1">
                          {item.pendingQty}
                        </span>
                      </div>
                      <div className="flex-1 flex flex-col items-center bg-blue-50 dark:bg-blue-500/15 py-1.5 rounded-lg border border-blue-200 dark:border-blue-500/40 shadow-sm">
                        <span className="text-[6px] text-blue-700 dark:text-blue-300 font-black uppercase tracking-[0.08em] leading-none">
                          Avail
                        </span>
                        <span
                          className={`text-[10px] font-black mt-1 ${available <= 0 ? "text-red-600 dark:text-red-400" : "text-blue-700 dark:text-blue-300"}`}
                        >
                          {available}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-auto pt-2.5 border-t border-zinc-50 dark:border-zinc-800/40">
                      <PermissionGate
                        requires="supply.request"
                        fallback={
                          <div className="flex-1 text-[10px] text-zinc-400 font-bold uppercase py-2 text-center italic">
                            View Only
                          </div>
                        }
                      >
                        <div className="flex items-center bg-zinc-100/80 dark:bg-zinc-800/80 rounded-lg px-2 py-1 gap-2 flex-1 border border-zinc-200 dark:border-zinc-700 shadow-inner">
                          <button
                            onClick={() => updateItemModifier(item.id, -1)}
                            className="text-zinc-400 hover:text-blue-600 transition-colors"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="flex-1 text-center text-[11px] font-black text-zinc-900 dark:text-white min-w-[14px]">
                            {itemQuantities[item.id] || 1}
                          </span>
                          <button
                            onClick={() => updateItemModifier(item.id, 1)}
                            className="text-zinc-400 hover:text-blue-600 transition-colors"
                          >
                            <Plus size={10} />
                          </button>
                        </div>
                        <Button
                          variant="blue"
                          disabled={available <= 0}
                          className="!p-0 w-8 h-8 rounded-lg shadow-blue-500/10 hover:scale-105 active:scale-95 transition-all"
                          onClick={() => handleAddItemToCart(item.id)}
                        >
                          <Plus size={16} />
                        </Button>
                      </PermissionGate>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card
              title="Current Stock Status"
              description="Real-time availability of provincial supplies"
            >
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full text-left min-w-[900px]">
                  <thead>
                    <tr className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800/50">
                      <th className="pb-4 px-3 sm:px-0">Item Name</th>
                      <th className="pb-4">Unit</th>
                      <th className="pb-4">Physical Qty</th>
                      <th className="pb-4">Pending</th>
                      <th className="pb-4">Available</th>
                      <th className="pb-4 text-center">Req. Qty</th>
                      <th className="pb-4 text-right px-3 sm:px-0">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/30">
                    {filteredItems.map((item) => {
                      const available = item.physicalQty - item.pendingQty;
                      const isLow = item.physicalQty <= item.reorderPoint;
                      const modifierValue = itemQuantities[item.id] || 1;
                      const ItemIcon = getInventoryItemIcon(item.name);

                      return (
                        <tr
                          key={item.id}
                          className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                        >
                          <td className="py-4 px-3 sm:px-0">
                            <div className="flex items-start gap-2.5">
                              <div className="mt-0.5 p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-blue-600 shrink-0">
                                <ItemIcon size={12} />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-zinc-900 dark:text-white">
                                  {item.name}
                                </span>
                                {isLow && (
                                  <span className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1 mt-0.5">
                                    <AlertTriangle size={10} /> Low Stock
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 text-sm text-zinc-500 font-medium">
                            {item.unit}
                          </td>
                          <td className="py-4 text-sm font-bold text-zinc-900 dark:text-white">
                            {item.physicalQty.toLocaleString()}
                          </td>
                          <td className="py-4 text-sm font-bold text-amber-500">
                            {item.pendingQty.toLocaleString()}
                          </td>
                          <td className="py-4">
                            <span
                              className={`text-sm font-black ${available <= 0 ? "text-red-500" : "text-blue-600"}`}
                            >
                              {available.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => updateItemModifier(item.id, -1)}
                                className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="text-sm font-black w-8 text-center">
                                {modifierValue}
                              </span>
                              <button
                                onClick={() => updateItemModifier(item.id, 1)}
                                className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </td>
                          <td className="py-4 text-right px-3 sm:px-0">
                            <Button
                              variant="blue"
                              className="!px-3 !py-1.5 !text-[10px] uppercase font-black tracking-widest rounded-xl"
                              onClick={() => handleAddItemToCart(item.id)}
                              disabled={available <= 0}
                            >
                              Add to Cart
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* MY REQUESTS TAB */}
      {activeTab === "my-requests" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
          <Card
            title="My Requisitions"
            description="Track the status of your submitted supply requests"
          >
            <div className="space-y-4">
              {requests.filter((r) => r.requesterId === currentUser?.id)
                .length > 0 ? (
                requests
                  .filter((r) => r.requesterId === currentUser?.id)
                  .map((req) => (
                    <div
                      key={req.id}
                      className="p-4 rounded-3xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex-1 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 flex items-center justify-center text-blue-600 border border-zinc-200/50 dark:border-zinc-800 shrink-0 shadow-sm">
                          <Package size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => openDetailModal(req)}
                              className="text-sm font-black text-blue-600 hover:text-blue-700 hover:underline leading-none uppercase tracking-tight text-left transition-colors"
                            >
                              {req.id}
                            </button>
                            <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />
                            <RequestStatusTimeline status={req.status} />
                            {req.status === "History" && (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 items-center animate-in fade-in zoom-in duration-300">
                                <CheckCircle2 size={10} strokeWidth={3} />
                                <span className="text-[8px] font-black uppercase tracking-widest">
                                  Fulfilled
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                              {req.date} • {req.items.length} items
                            </p>
                            <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-800" />
                            <p className="text-[11px] text-black dark:text-white font-bold italic truncate max-w-[300px]">
                              "{req.purpose}"
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          className="h-9 px-4 text-[9px] uppercase font-black tracking-widest"
                          onClick={() => openDetailModal(req)}
                        >
                          <Eye size={12} className="mr-2" /> View Items
                        </Button>
                        {(req.status === "For Issuance" ||
                          req.status === "To Receive" ||
                          req.status === "History") && (
                          <>
                            <Button
                              variant="ghost"
                              className="h-9 px-4 text-[9px] uppercase font-black tracking-widest text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                              onClick={() =>
                                void handleGenerateRIS(req, "download")
                              }
                            >
                              <Download size={12} className="mr-2" /> Download
                              RIS
                            </Button>
                            <Button
                              variant="ghost"
                              className="h-9 px-4 text-[9px] uppercase font-black tracking-widest text-blue-600"
                              onClick={() => void handleGenerateRIS(req)}
                            >
                              <FileCheck size={12} className="mr-2" /> Print RIS
                            </Button>
                          </>
                        )}
                        {req.status === "To Receive" && (
                          <Button
                            variant="blue"
                            className="rounded-xl px-6 h-9 text-[9px] font-black uppercase tracking-widest"
                            onClick={() => handleReceive(req.id)}
                          >
                            Received
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="py-20 flex flex-col items-center opacity-40">
                  <HistoryIcon size={48} className="mb-4 text-zinc-300" />
                  <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                    No requests found
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* APPROVAL TAB */}
      {activeTab === "approval" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
          <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-x-auto scrollbar-hide">
            {approvalTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveApprovalTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                  ${
                    activeApprovalTab === tab.id
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-black shadow-lg shadow-zinc-950/20"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }
                `}
              >
                <tab.icon size={14} />
                {tab.id}
                <span className="ml-1 opacity-50">
                  ({requests.filter((r) => r.status === tab.id).length})
                </span>
              </button>
            ))}
          </div>

          <Card
            title={`${activeApprovalTab} Queue`}
            description="Manage workflow for supply disbursements"
          >
            <div className="space-y-3">
              {requests.filter((r) => r.status === activeApprovalTab).length >
              0 ? (
                requests
                  .filter((r) => r.status === activeApprovalTab)
                  .map((req) => (
                    <div
                      key={req.id}
                      className="p-4 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                    >
                      <div className="flex-1 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                          <ClipboardList size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => openDetailModal(req)}
                              className="text-sm font-black text-blue-600 hover:text-blue-700 hover:underline uppercase tracking-tight text-left transition-colors"
                            >
                              {req.id}
                            </button>
                            <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />
                            <RequestStatusTimeline status={req.status} />
                            {req.status === "History" && (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 items-center animate-in fade-in zoom-in duration-300">
                                <CheckCircle2 size={10} strokeWidth={3} />
                                <span className="text-[8px] font-black uppercase tracking-widest">
                                  Fulfilled
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                              {req.requester} • {req.date}
                            </p>
                            <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-800" />
                            <p className="text-[11px] text-black dark:text-white font-bold italic truncate max-w-[400px]">
                              "{req.purpose}"
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          className="h-9 px-4 text-[9px] uppercase font-black tracking-widest"
                          onClick={() => openDetailModal(req)}
                        >
                          <Eye size={12} className="mr-2" /> Items Detail
                        </Button>
                        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />
                        {activeApprovalTab === "For Verification" && (
                          <Button
                            variant="blue"
                            className="!text-[9px] !py-2 !px-4 h-9 uppercase font-black"
                            onClick={() => openDetailModal(req)}
                          >
                            Verify
                          </Button>
                        )}
                        {activeApprovalTab === "Awaiting Approval" && (
                          <Button
                            variant="primary"
                            className="!text-[9px] !py-2 !px-4 h-9 uppercase font-black"
                            onClick={() => handleApprove(req.id)}
                          >
                            Approve
                          </Button>
                        )}
                        {activeApprovalTab === "For Issuance" && (
                          <Button
                            variant="blue"
                            className="!text-[9px] !py-2 !px-4 h-9 uppercase font-black"
                            onClick={() => handleIssue(req.id)}
                          >
                            Issue
                          </Button>
                        )}
                        {activeApprovalTab !== "History" &&
                          activeApprovalTab !== "Rejected" &&
                          activeApprovalTab !== "To Receive" && (
                            <Button
                              variant="ghost"
                              className="!text-[9px] !py-2 !px-4 h-9 uppercase font-black text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                              onClick={() => handleReject(req.id)}
                            >
                              Reject
                            </Button>
                          )}
                        {(activeApprovalTab === "For Issuance" ||
                          activeApprovalTab === "To Receive" ||
                          activeApprovalTab === "History") && (
                          <>
                            <Button
                              variant="ghost"
                              className="!text-[9px] !py-2 !px-4 h-9 uppercase font-black text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                              onClick={() =>
                                void handleGenerateRIS(req, "download")
                              }
                            >
                              <Download size={12} className="mr-2" /> Download
                              RIS
                            </Button>
                            <Button
                              variant="ghost"
                              className="!text-[9px] !py-2 !px-4 h-9 uppercase font-black text-blue-600"
                              onClick={() => void handleGenerateRIS(req)}
                            >
                              <FileCheck size={12} className="mr-2" /> Print RIS
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="py-20 flex flex-col items-center text-center opacity-40">
                  <CheckCircle2 size={48} className="mb-4 text-zinc-300" />
                  <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                    Queue is currently clear
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* INVENTORY TAB */}
      {activeTab === "inventory" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto flex-1">
              <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                <button
                  onClick={() => setActiveInventoryTab("all")}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeInventoryTab === "all" ? "bg-zinc-900 text-white dark:bg-white dark:text-black shadow-sm" : "text-zinc-500"}`}
                >
                  All ({inventory.length})
                </button>
                <button
                  onClick={() => setActiveInventoryTab("low")}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${activeInventoryTab === "low" ? "bg-red-600 text-white shadow-lg shadow-red-500/20" : "text-zinc-500"}`}
                >
                  <AlertCircle size={12} /> Low ({lowStockItems.length})
                </button>
              </div>
              <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0">
                <button
                  onClick={() => setInventoryViewMode("list")}
                  className={`p-1.5 rounded-lg transition-all ${inventoryViewMode === "list" ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" : "text-zinc-400"}`}
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setInventoryViewMode("grid")}
                  className={`p-1.5 rounded-lg transition-all ${inventoryViewMode === "grid" ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" : "text-zinc-400"}`}
                >
                  <LayoutGrid size={16} />
                </button>
              </div>

              <div className="relative group flex-1 md:max-w-xs">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-500 transition-colors"
                  size={14}
                />
                <input
                  type="text"
                  placeholder="Search inventory..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-xs font-medium shadow-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto">
              {activeInventoryTab === "low" && (
                <Button
                  variant="ghost"
                  onClick={handleExportLowStock}
                  disabled={exportableLowStockItems.length === 0}
                  className="h-9 px-3 text-[9px] font-black uppercase border border-red-200 text-red-600 hover:text-red-700 dark:border-red-900/40 dark:text-red-400 rounded-xl"
                >
                  <ArrowDownToLine size={14} className="mr-1.5" /> Export Low
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  resetImportState();
                  setIsImportModalOpen(true);
                }}
                className="h-9 px-3 text-[9px] font-black uppercase border border-zinc-200 dark:border-zinc-800 rounded-xl"
              >
                <FileSpreadsheet size={14} className="mr-1.5" /> Import
              </Button>
              <Button
                variant="blue"
                onClick={() => {
                  setEditingItem(null);
                  setItemFormData({
                    name: "",
                    unit: "Reams",
                    physicalQty: 0,
                    reorderPoint: 0,
                  });
                  setIsNewItemModalOpen(true);
                }}
                className="h-9 px-4 rounded-xl text-[9px] font-black uppercase"
              >
                <Plus size={14} className="mr-1.5" /> New Item
              </Button>
            </div>
          </div>

          {inventoryViewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 animate-in fade-in duration-300">
              {filteredInventory.map((item) => {
                const isLow = item.physicalQty <= item.reorderPoint;
                const ItemIcon = getInventoryItemIcon(item.name);
                return (
                  <Card
                    key={item.id}
                    className={`!p-2.5 border-l-[3px] transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-zinc-500/5 bg-white dark:bg-zinc-900/40 group flex flex-col h-full ${isLow ? "border-l-red-500 border-red-500/10" : "border-l-blue-500 border-blue-500/10"}`}
                  >
                    <div className="flex justify-between items-start mb-2.5">
                      <div
                        className={`p-1.5 rounded-xl border ${isLow ? "bg-red-50 dark:bg-red-500/10 text-red-600 border-red-100 dark:border-red-500/20" : "bg-blue-50 dark:bg-blue-500/10 text-blue-600 border-blue-100 dark:border-blue-500/20"}`}
                      >
                        <ItemIcon size={14} />
                      </div>
                      <Badge
                        variant={isLow ? "warning" : "info"}
                        className="!text-[8px] h-4 px-1.5 font-black uppercase tracking-wider border-transparent"
                      >
                        {isLow ? "Restock" : "Healthy"}
                      </Badge>
                    </div>

                    <div className="mb-3">
                      <h4 className="text-[13px] font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tight leading-[1.3] line-clamp-2 min-h-[34px] group-hover:text-blue-600 transition-colors">
                        {item.name}
                      </h4>
                      <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest mt-1 opacity-60">
                        {item.unit}
                      </p>
                    </div>

                    <div className="space-y-2.5 mt-auto">
                      <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-tight">
                        <span className="text-zinc-400 text-[8px]">
                          Current Stock
                        </span>
                        <span
                          className={isLow ? "text-red-500" : "text-blue-600"}
                        >
                          {item.physicalQty}
                        </span>
                      </div>

                      <div className="relative pt-1">
                        <ProgressBar
                          value={item.physicalQty}
                          max={Math.max(
                            item.physicalQty,
                            item.reorderPoint * 3 || 1,
                          )}
                          color={isLow ? "bg-red-500" : "bg-blue-600"}
                          className="h-1.5 bg-zinc-100 dark:bg-zinc-800 shadow-inner"
                        />
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-zinc-50 dark:border-zinc-800/50 mt-1">
                        <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">
                          Min: {item.reorderPoint}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditItemModal(item);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all border border-transparent hover:border-blue-100 dark:hover:border-blue-500/20 shadow-sm hover:shadow-md"
                        >
                          <Edit2 size={10} /> Edit
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card
              title="Inventory Audit List"
              description="Detailed provincial inventory management"
              className="animate-in fade-in duration-300"
            >
              <div className="overflow-x-auto -mx-5 sm:mx-0">
                <table className="w-full text-left min-w-[800px]">
                  <thead>
                    <tr className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800/50">
                      <th className="pb-4 px-5 sm:px-0">Inventory Item</th>
                      <th className="pb-4">Unit</th>
                      <th className="pb-4 text-center">Re-order Point</th>
                      <th className="pb-4 text-center">Earmarked</th>
                      <th className="pb-4 text-right">Qty in Hand</th>
                      <th className="pb-4 text-right px-5 sm:px-0">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/30">
                    {filteredInventory.map((item) => {
                      const ItemIcon = getInventoryItemIcon(item.name);
                      return (
                        <tr
                          key={item.id}
                          className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                        >
                          <td className="py-4 px-5 sm:px-0">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-400">
                                <ItemIcon size={14} />
                              </div>
                              <span className="text-sm font-bold text-zinc-900 dark:text-white">
                                {item.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 text-sm text-zinc-500 font-medium">
                            {item.unit}
                          </td>
                          <td className="py-4 text-sm font-bold text-center text-zinc-400">
                            {item.reorderPoint}
                          </td>
                          <td className="py-4 text-sm font-bold text-center text-amber-500">
                            {item.pendingQty}
                          </td>
                          <td className="py-4 text-right">
                            <span
                              className={`text-sm font-black ${item.physicalQty <= item.reorderPoint ? "text-red-500" : "text-blue-600"}`}
                            >
                              {item.physicalQty}
                            </span>
                          </td>
                          <td className="py-4 text-right px-5 sm:px-0 whitespace-nowrap">
                            <Button
                              variant="ghost"
                              className="!p-2 text-zinc-400 hover:text-blue-500"
                              onClick={() => openEditItemModal(item)}
                            >
                              <Edit2 size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              className="!p-2 text-zinc-400 hover:text-red-500"
                              onClick={() =>
                                setInventory(
                                  inventory.filter((i) => i.id !== item.id),
                                )
                              }
                            >
                              <Trash2 size={14} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* REQUEST ITEMS DETAIL MODAL */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedRequest(null);
        }}
        title={`Requisition Details: ${selectedRequest?.id}`}
        footer={
          <div className="flex gap-2 w-full">
            {selectedRequest?.status === "For Verification" ? (
              <>
                <Button
                  variant="ghost"
                  className="flex-1 uppercase font-black text-[10px] tracking-widest"
                  onClick={saveRequestModification}
                >
                  Update Quantities
                </Button>
                <Button
                  variant="blue"
                  className="flex-[2] uppercase font-black text-[10px] tracking-widest shadow-lg shadow-blue-500/20"
                  onClick={() => handleVerify(selectedRequest.id)}
                >
                  Verify Request
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedRequest(null);
                }}
              >
                Close
              </Button>
            )}
          </div>
        }
      >
        {selectedRequest && (
          <div className="space-y-4">
            {selectedRequest.status === "History" && (
              <div className="mx-4 p-4 bg-emerald-50 dark:bg-emerald-500/5 border-2 border-dashed border-emerald-100 dark:border-emerald-500/20 rounded-3xl flex flex-col items-center gap-3 text-center animate-in fade-in zoom-in duration-500">
                <div className="w-12 h-12 bg-white dark:bg-zinc-950 rounded-2xl flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/10 border border-emerald-100 dark:border-emerald-900/40">
                  <CheckCircle2
                    size={24}
                    strokeWidth={2.5}
                    className="animate-in zoom-in spin-in-12 duration-700"
                  />
                </div>
                <div>
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[8.5px] font-black uppercase tracking-widest mb-1.5 shadow-md shadow-emerald-500/20">
                    Request Fulfilled
                  </div>
                  <p className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400 leading-relaxed">
                    This requisition has been successfully fulfilled and the
                    items have been received.
                  </p>
                </div>
              </div>
            )}

            <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-3xl border border-zinc-100 dark:border-zinc-800/50 mx-4">
              <RequestStatusTimeline
                status={selectedRequest.status}
                isWide={true}
              />
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">
                Request Origin
              </h4>
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold">{selectedRequest.requester}</p>
                <RequestBadge status={selectedRequest.status} />
              </div>
              <p className="text-xs text-zinc-500 mt-2 italic leading-relaxed">
                "{selectedRequest.purpose}"
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                Requested Items List
              </h4>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800/50">
                      <th className="pb-3 pr-4">Item (Unit)</th>
                      <th className="pb-3 text-center">Req.</th>
                      <th className="pb-3 text-center">Issue</th>
                      <th className="pb-3 text-center">Phys.</th>
                      <th className="pb-3 text-center">Avail.</th>
                      <th className="pb-3 text-center">Pend.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/30">
                    {selectedRequest.items.map((reqItem) => {
                      const inv = inventory.find(
                        (i) => i.id === reqItem.id,
                      ) || {
                        name: reqItem.name,
                        category: "-",
                        unit: reqItem.unit,
                        physicalQty: 0,
                        pendingQty: 0,
                        reorderPoint: 0,
                      };
                      return (
                        <tr key={reqItem.id} className="group">
                          <td className="py-3 pr-4">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-zinc-900 dark:text-white">
                                {inv.name}
                              </span>
                              <span className="text-[8px] text-zinc-400 font-bold uppercase">
                                {inv.unit}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-[11px] font-bold text-zinc-400 text-center">
                            {reqItem.requestedQty}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {selectedRequest.status === "For Verification" ? (
                                <>
                                  <button
                                    onClick={() =>
                                      updateSelectedRequestQty(reqItem.id, -1)
                                    }
                                    className="w-5 h-5 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-blue-500 transition-colors"
                                  >
                                    <Minus size={10} />
                                  </button>
                                  <span className="text-[11px] font-black w-4 text-center">
                                    {reqItem.qty}
                                  </span>
                                  <button
                                    onClick={() =>
                                      updateSelectedRequestQty(reqItem.id, 1)
                                    }
                                    className="w-5 h-5 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-blue-500 transition-colors"
                                  >
                                    <Plus size={10} />
                                  </button>
                                </>
                              ) : (
                                <span className="text-[11px] font-black w-4 text-center text-zinc-900 dark:text-white">
                                  {reqItem.qty}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-[11px] font-bold text-zinc-600 text-center">
                            {inv.physicalQty}
                          </td>
                          <td className="py-3 text-[11px] font-black text-blue-600 text-center">
                            {inv.physicalQty - inv.pendingQty}
                          </td>
                          <td className="py-3 text-[11px] font-bold text-amber-500 text-center">
                            {inv.pendingQty}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl flex gap-2 border ${selectedRequest.status === "For Verification" ? "bg-blue-50 dark:bg-blue-500/5 border-blue-100 dark:border-blue-500/20" : "bg-amber-50 dark:bg-amber-500/5 border-amber-100 dark:border-amber-500/20"}`}
            >
              <Settings2
                size={14}
                className={
                  selectedRequest.status === "For Verification"
                    ? "text-blue-600 shrink-0"
                    : "text-amber-600 shrink-0"
                }
              />
              <p
                className={`text-[9px] font-medium leading-relaxed ${selectedRequest.status === "For Verification" ? "text-blue-700 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"}`}
              >
                {selectedRequest.status === "For Verification"
                  ? "Quantities can be modified during the verification phase. Changes will update pending stocks upon saving."
                  : "This request has been verified and quantities are now locked for official processing."}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* NEW/EDIT ITEM MODAL */}
      <Modal
        isOpen={isNewItemModalOpen}
        onClose={() => setIsNewItemModalOpen(false)}
        title={
          editingItem ? "Edit Inventory Item" : "Register New Inventory Item"
        }
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsNewItemModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="blue" onClick={handleSaveItem}>
              {editingItem ? "Update Item" : "Register Item"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
              Item Name
            </label>
            <input
              type="text"
              value={itemFormData.name}
              onChange={(e) =>
                setItemFormData({ ...itemFormData, name: e.target.value })
              }
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none font-bold"
              placeholder="e.g. SECPA Security Paper"
            />
          </div>
          <CreatableSelect
            label="Unit of Measurement"
            value={itemFormData.unit}
            onChange={(val) => setItemFormData({ ...itemFormData, unit: val })}
            storageKey={STORAGE_KEYS.supplyUnitMaster}
            placeholder="Select or type unit..."
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                Initial Physical Qty
              </label>
              <input
                type="number"
                value={itemFormData.physicalQty}
                onChange={(e) =>
                  setItemFormData({
                    ...itemFormData,
                    physicalQty: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                Re-order Point
              </label>
              <input
                type="number"
                value={itemFormData.reorderPoint}
                onChange={(e) =>
                  setItemFormData({
                    ...itemFormData,
                    reorderPoint: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* IMPORT MODAL */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={closeImportModal}
        title="Import Stock from Excel"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeImportModal}>
              Cancel
            </Button>
            <Button
              variant="blue"
              onClick={handleImportStock}
              disabled={
                isImportingStock || importRows.length === 0 || !!importError
              }
            >
              {isImportingStock ? "Importing..." : "Start Import"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <input
            type="file"
            id="inventory-import-file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportFileChange}
          />
          <label
            htmlFor="inventory-import-file"
            className="p-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[32px] flex flex-col items-center justify-center text-center group hover:border-blue-500/40 transition-colors cursor-pointer"
          >
            <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:text-blue-500 transition-colors mb-4">
              <Upload size={32} />
            </div>
            <p className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
              Click to upload spreadsheet
            </p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
              Supports .XLSX, .XLS, .CSV format
            </p>
            {importFileName && (
              <p className="mt-3 text-[11px] font-bold text-blue-600 max-w-full truncate">
                Selected: {importFileName}
              </p>
            )}
          </label>

          {importError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-[11px] font-semibold text-red-700 dark:text-red-400">
              {importError}
            </div>
          )}

          {importRows.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                {importRows.length} row{importRows.length === 1 ? "" : "s"}{" "}
                ready for import
              </p>
              {importSkippedRows.length > 0 && (
                <Badge variant="warning" className="!text-[9px]">
                  {importSkippedRows.length} skipped
                </Badge>
              )}
            </div>
          )}

          {importSkippedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  Skipped Rows (Fix Before Import)
                </h4>
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                  {importSkippedRows.length} issue
                  {importSkippedRows.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="max-h-44 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-zinc-50 dark:bg-zinc-900 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-black uppercase tracking-wider text-zinc-500">
                        Row
                      </th>
                      <th className="px-3 py-2 font-black uppercase tracking-wider text-zinc-500">
                        Item
                      </th>
                      <th className="px-3 py-2 font-black uppercase tracking-wider text-zinc-500">
                        Qty
                      </th>
                      <th className="px-3 py-2 font-black uppercase tracking-wider text-zinc-500">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {importSkippedRows.map((row) => (
                      <tr
                        key={`${row.rowNumber}-${row.itemName}-${row.reason}`}
                      >
                        <td className="px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-300">
                          {row.rowNumber}
                        </td>
                        <td className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                          {row.itemName}
                        </td>
                        <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                          {row.quantity}
                        </td>
                        <td className="px-3 py-2 text-red-600 dark:text-red-400 font-semibold">
                          {row.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              Required Column Mapping
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(IMPORT_COLUMN_LABELS) as ImportColumnKey[]).map(
                (columnKey) => (
                  <div
                    key={columnKey}
                    className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col gap-1"
                  >
                    <span className="text-[9px] font-black text-blue-600 uppercase tracking-tighter whitespace-nowrap">
                      {IMPORT_COLUMN_LABELS[columnKey]}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase flex items-center gap-1 ${importDetectedColumns[columnKey] ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}`}
                    >
                      <RefreshCcw size={8} />{" "}
                      {importDetectedColumns[columnKey]
                        ? "Detected"
                        : "Not Found"}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/20 flex gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
              Importing will add new items to the inventory. If the item name
              already exists, the physical quantity will be summed.
            </p>
          </div>
        </div>
      </Modal>

      {/* CREATE REQUEST MODAL (THE CART) */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Supply Requisition Cart"
        footer={
          <div className="flex gap-2 w-full">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setIsRequestModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="blue"
              className="flex-[2] h-14 uppercase font-black tracking-widest"
              onClick={handleSubmitRequest}
            >
              Submit Requisition
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              Selected Items ({requestCart.length})
            </h4>
            <div className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-hide">
              {requestCart.length > 0 ? (
                requestCart.map((cartItem) => {
                  const item = inventory.find((i) => i.id === cartItem.itemId)!;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800"
                    >
                      <div>
                        <p className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                          {item.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setRequestCart(
                                requestCart.map((c) =>
                                  c.itemId === item.id
                                    ? { ...c, qty: Math.max(1, c.qty - 1) }
                                    : c,
                                ),
                              )
                            }
                            className="w-6 h-6 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-400"
                          >
                            -
                          </button>
                          <span className="text-sm font-black w-8 text-center">
                            {cartItem.qty}
                          </span>
                          <button
                            onClick={() =>
                              setRequestCart(
                                requestCart.map((c) =>
                                  c.itemId === item.id
                                    ? { ...c, qty: c.qty + 1 }
                                    : c,
                                ),
                              )
                            }
                            className="w-6 h-6 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-400"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => handleRemoveFromCart(item.id)}
                          className="text-red-500 p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-10 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl opacity-40">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                    No items selected from stock
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Info size={12} className="text-blue-600" /> Purpose of
              Requisition
            </label>
            <textarea
              value={requestPurpose}
              onChange={(e) => setRequestPurpose(e.target.value)}
              className="w-full h-32 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-sm outline-none resize-none focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="e.g. Allocation for upcoming mobile registration mission in Dingalan..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
