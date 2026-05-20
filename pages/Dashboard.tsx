import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Briefcase,
  Building2,
  Clock,
  Database,
  FileCheck,
  FileText,
  Package,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card } from "../components/ui";
import { useUsers } from "../UserContext";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { readStorageJsonSafe } from "../services/storage";

type BadgeVariant = "default" | "success" | "warning" | "info";

const DashboardTrendChart = lazy(() =>
  import("../components/dashboard/DashboardCharts").then((module) => ({
    default: module.DashboardTrendChart,
  })),
);
const DashboardWorkloadChart = lazy(() =>
  import("../components/dashboard/DashboardCharts").then((module) => ({
    default: module.DashboardWorkloadChart,
  })),
);

interface RegistryRecord {
  name?: string;
  reg?: string;
  type?: string;
  date?: string;
  status?: string;
}

interface SupplyInventoryItem {
  name?: string;
  physicalQty?: number;
  pendingQty?: number;
  reorderPoint?: number;
}

interface SupplyRequest {
  id?: string;
  requester?: string;
  date?: string;
  status?: string;
}

interface PropertyAsset {
  description?: string;
  status?: string;
  cost?: number;
  acquisitionDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PropertyEvent {
  title?: string;
  status?: string;
  asOfDate?: string;
  createdAt?: string;
}

interface EmploymentRecord {
  name?: string;
  serialNumber?: string;
  surveyProject?: string;
  createdAt?: string;
  dateExecution?: string;
}

interface DashboardSnapshot {
  registryRecords: RegistryRecord[];
  supplyInventory: SupplyInventoryItem[];
  supplyRequests: SupplyRequest[];
  propertyAssets: PropertyAsset[];
  propertyEvents: PropertyEvent[];
  employmentRecords: EmploymentRecord[];
}

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  when: string;
  sortTime: number;
  href: string;
  icon: React.ElementType;
}

interface WorkloadItem {
  name: string;
  value: number;
  color: string;
  href: string;
  badge: BadgeVariant;
}

interface PriorityItem {
  title: string;
  count: number;
  href: string;
  icon: React.ElementType;
  badge: BadgeVariant;
}

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  registryRecords: [],
  supplyInventory: [],
  supplyRequests: [],
  propertyAssets: [],
  propertyEvents: [],
  employmentRecords: [],
};

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const parseStorageArray = <T,>(key: string): T[] => {
  const parsed = readStorageJsonSafe<unknown>(key, []);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
};

const toNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isCurrentMonth = (value: unknown): boolean => {
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
};

const formatWhen = (value: unknown): string => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes("ago") || normalized === "just now") return value;
  }
  const date = parseDate(value);
  if (!date) return "Recent";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const StaggerIn: React.FC<{
  children: React.ReactNode;
  index: number;
  className?: string;
}> = ({ children, index, className = "" }) => (
  <div
    className={`opacity-0 animate-reveal ${className}`}
    style={{ animationDelay: `${index * 80}ms` }}
  >
    {children}
  </div>
);

const AnimatedNumber: React.FC<{
  value: number;
  format?: (value: number) => string;
}> = ({ value, format }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    const startValue = previousValue.current;
    previousValue.current = value;

    if (startValue === value) {
      setDisplayValue(value);
      return;
    }

    const duration = 800;
    const start = performance.now();
    let frame = 0;

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + (value - startValue) * eased;
      setDisplayValue(nextValue);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const rounded = Math.round(displayValue);
  return <>{format ? format(rounded) : rounded.toLocaleString()}</>;
};

const LiveClockBadge = React.memo(() => {
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5">
      <Clock size={12} />{" "}
      {clock.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
});

interface TrendPoint {
  key: string;
  label: string;
  registry: number;
  supply: number;
  property: number;
  employment: number;
  total: number;
}

interface DashboardTrendCardProps {
  trendData: TrendPoint[];
  hasTrendData: boolean;
  trendWindow: 6 | 12;
  lastUpdatedAt: Date;
  onTrendWindowChange: (window: 6 | 12) => void;
}

const DashboardTrendCard = React.memo(function DashboardTrendCard({
  trendData,
  hasTrendData,
  trendWindow,
  lastUpdatedAt,
  onTrendWindowChange,
}: DashboardTrendCardProps) {
  return (
    <Card
      title="Operations Trend"
      description="Monthly activity across core modules"
      action={
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-zinc-200 dark:border-zinc-800 p-1 bg-zinc-50 dark:bg-zinc-900">
            {[6, 12].map((range) => (
              <button
                key={range}
                onClick={() => onTrendWindowChange(range as 6 | 12)}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors ${
                  trendWindow === range
                    ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {range}M
              </button>
            ))}
          </div>
          <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap">
            Updated{" "}
            {lastUpdatedAt.toLocaleTimeString("en-PH", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        }
      >
        <DashboardTrendChart
          trendData={trendData}
          hasTrendData={hasTrendData}
        />
      </Suspense>
    </Card>
  );
});

interface DashboardWorkloadCardProps {
  workloadItems: WorkloadItem[];
  navigate: ReturnType<typeof useNavigate>;
}

const DashboardWorkloadCard = React.memo(function DashboardWorkloadCard({
  workloadItems,
  navigate,
}: DashboardWorkloadCardProps) {
  const totalWorkload = useMemo(
    () => workloadItems.reduce((sum, item) => sum + item.value, 0),
    [workloadItems],
  );

  return (
    <Card title="Workload Mix" description="Open items requiring immediate action">
      <Suspense
        fallback={
          <div className="h-56 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        }
      >
        <DashboardWorkloadChart workloadItems={workloadItems} />
      </Suspense>

      <div className="mt-2 space-y-2">
        {workloadItems.length > 0 ? (
          workloadItems.map((item) => (
            <button
              key={item.name}
              onClick={() => navigate(item.href)}
              className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {item.name}
              </span>
              <Badge variant={item.badge}>
                {item.value.toLocaleString()}
              </Badge>
            </button>
          ))
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Everything is clear. No pending queues detected.
          </p>
        )}
      </div>
      {workloadItems.length > 0 && (
        <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
          Total open items: {totalWorkload.toLocaleString()}
        </p>
      )}
    </Card>
  );
});

export const Dashboard: React.FC = () => {
  const { currentUser, users } = useUsers();
  const navigate = useNavigate();

  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [trendWindow, setTrendWindow] = useState<6 | 12>(6);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      const watchedKeys = new Set([
        STORAGE_KEYS.registryRecords,
        STORAGE_KEYS.supplyInventory,
        STORAGE_KEYS.supplyRequests,
        STORAGE_KEYS.propertyAssets,
        STORAGE_KEYS.propertyEvents,
        STORAGE_KEYS.employmentRecords,
      ]);
      if (!watchedKeys.has(event.key)) return;
      setRefreshNonce((prev) => prev + 1);
      setLastUpdatedAt(new Date());
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const snapshot = useMemo<DashboardSnapshot>(() => {
    if (typeof window === "undefined") return EMPTY_SNAPSHOT;
    void refreshNonce;

    return {
      registryRecords: parseStorageArray<RegistryRecord>(
        STORAGE_KEYS.registryRecords,
      ),
      supplyInventory: parseStorageArray<SupplyInventoryItem>(
        STORAGE_KEYS.supplyInventory,
      ),
      supplyRequests: parseStorageArray<SupplyRequest>(
        STORAGE_KEYS.supplyRequests,
      ),
      propertyAssets: parseStorageArray<PropertyAsset>(
        STORAGE_KEYS.propertyAssets,
      ),
      propertyEvents: parseStorageArray<PropertyEvent>(
        STORAGE_KEYS.propertyEvents,
      ),
      employmentRecords: parseStorageArray<EmploymentRecord>(
        STORAGE_KEYS.employmentRecords,
      ),
    };
  }, [refreshNonce]);

  const stats = useMemo(() => {
    const registryPending = snapshot.registryRecords.filter((record) => {
      const status = String(record.status || "").toLowerCase();
      return (
        status === "pending" ||
        status === "processing" ||
        status === "for verification"
      );
    }).length;

    const registryCompleted = snapshot.registryRecords.filter((record) => {
      const status = String(record.status || "").toLowerCase();
      return status === "completed" || status === "archived";
    }).length;

    const supplyQueue = snapshot.supplyRequests.filter((request) => {
      const status = String(request.status || "").toLowerCase();
      return status !== "" && status !== "history" && status !== "rejected";
    }).length;

    const supplyAwaitingApproval = snapshot.supplyRequests.filter(
      (request) =>
        String(request.status || "").toLowerCase() === "awaiting approval",
    ).length;

    const supplyForIssuance = snapshot.supplyRequests.filter(
      (request) =>
        String(request.status || "").toLowerCase() === "for issuance",
    ).length;

    const lowStockItems = snapshot.supplyInventory.filter(
      (item) => toNumber(item.physicalQty) <= toNumber(item.reorderPoint),
    ).length;

    const availableUnits = snapshot.supplyInventory.reduce((sum, item) => {
      const available = toNumber(item.physicalQty) - toNumber(item.pendingQty);
      return sum + Math.max(available, 0);
    }, 0);

    const issuedAssets = snapshot.propertyAssets.filter(
      (asset) => String(asset.status || "").toLowerCase() === "issued",
    ).length;

    const missingAssets = snapshot.propertyAssets.filter(
      (asset) => String(asset.status || "").toLowerCase() === "missing",
    ).length;

    const activeInventoryEvents = snapshot.propertyEvents.filter(
      (event) => String(event.status || "").toLowerCase() === "in-progress",
    ).length;

    const totalAssetValue = snapshot.propertyAssets.reduce(
      (sum, asset) => sum + toNumber(asset.cost),
      0,
    );

    const contractsThisMonth = snapshot.employmentRecords.filter((record) =>
      isCurrentMonth(record.createdAt || record.dateExecution),
    ).length;

    const completedSupplyRequests = snapshot.supplyRequests.filter(
      (request) => String(request.status || "").toLowerCase() === "history",
    ).length;

    const totalTracked =
      snapshot.registryRecords.length + snapshot.supplyRequests.length;
    const doneTracked = registryCompleted + completedSupplyRequests;
    const completionRate = totalTracked
      ? Math.round((doneTracked / totalTracked) * 100)
      : 0;

    return {
      registryPending,
      registryCompleted,
      supplyQueue,
      supplyAwaitingApproval,
      supplyForIssuance,
      lowStockItems,
      availableUnits,
      issuedAssets,
      missingAssets,
      activeInventoryEvents,
      totalAssetValue,
      contractsThisMonth,
      completionRate,
    };
  }, [snapshot]);

  const metricCards = useMemo(
    () => [
      {
        label: "Registry Records",
        value: snapshot.registryRecords.length,
        hint: `${stats.registryPending.toLocaleString()} pending`,
        icon: FileText,
        href: "/records",
      },
      {
        label: "Supply Queue",
        value: stats.supplyQueue,
        hint: `${stats.lowStockItems.toLocaleString()} low stock`,
        icon: Package,
        href: "/supplies",
      },
      {
        label: "Available Units",
        value: stats.availableUnits,
        hint: `${snapshot.supplyInventory.length.toLocaleString()} inventory items`,
        icon: Database,
        href: "/supplies",
      },
      {
        label: "Property Assets",
        value: snapshot.propertyAssets.length,
        hint: `${stats.issuedAssets.toLocaleString()} issued`,
        icon: Building2,
        href: "/property",
      },
      {
        label: "Employment Records",
        value: snapshot.employmentRecords.length,
        hint: `${stats.contractsThisMonth.toLocaleString()} this month`,
        icon: Briefcase,
        href: "/employment",
      },
      {
        label: "Asset Value",
        value: stats.totalAssetValue,
        hint: "Current registered value",
        icon: Activity,
        href: "/property",
        formatter: (value: number) => pesoFormatter.format(value),
      },
    ],
    [snapshot, stats],
  );

  const trendData = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: trendWindow }, (_, index) => {
      const date = new Date(
        now.getFullYear(),
        now.getMonth() - (trendWindow - 1 - index),
        1,
      );
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString("en-PH", { month: "short" }),
        registry: 0,
        supply: 0,
        property: 0,
        employment: 0,
        total: 0,
      };
    });

    const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    const bump = (
      rawDate: unknown,
      field: "registry" | "supply" | "property" | "employment",
    ) => {
      const parsed = parseDate(rawDate);
      if (!parsed) return;
      const key = `${parsed.getFullYear()}-${parsed.getMonth()}`;
      const bucket = bucketMap.get(key);
      if (!bucket) return;
      bucket[field] += 1;
      bucket.total += 1;
    };

    snapshot.registryRecords.forEach((record) => bump(record.date, "registry"));
    snapshot.propertyAssets.forEach((asset) =>
      bump(
        asset.acquisitionDate || asset.createdAt || asset.updatedAt,
        "property",
      ),
    );
    snapshot.employmentRecords.forEach((record) =>
      bump(record.createdAt || record.dateExecution, "employment"),
    );

    snapshot.supplyRequests.forEach((request) => {
      const parsed = parseDate(request.date);
      if (parsed) {
        bump(parsed, "supply");
        return;
      }
      const currentBucket = buckets[buckets.length - 1];
      if (!currentBucket) return;
      currentBucket.supply += 1;
      currentBucket.total += 1;
    });

    return buckets;
  }, [snapshot, trendWindow]);

  const hasTrendData = trendData.some((point) => point.total > 0);

  const workloadItems = useMemo<WorkloadItem[]>(
    () =>
      [
        {
          name: "Registry Pending",
          value: stats.registryPending,
          color: "#f59e0b",
          href: "/records",
          badge: "warning",
        },
        {
          name: "Supply Queue",
          value: stats.supplyQueue,
          color: "#2563eb",
          href: "/supplies",
          badge: "info",
        },
        {
          name: "Low Stock",
          value: stats.lowStockItems,
          color: "#ef4444",
          href: "/supplies",
          badge: "warning",
        },
        {
          name: "Missing Assets",
          value: stats.missingAssets,
          color: "#14b8a6",
          href: "/property",
          badge: "default",
        },
      ].filter((item) => item.value > 0),
    [stats],
  );

  const priorityQueue = useMemo<PriorityItem[]>(
    () =>
      [
        {
          title: "Records waiting for validation",
          count: stats.registryPending,
          href: "/records",
          icon: FileCheck,
          badge: "warning",
        },
        {
          title: "Requests awaiting approval",
          count: stats.supplyAwaitingApproval,
          href: "/supplies",
          icon: Package,
          badge: "info",
        },
        {
          title: "Requests queued for issuance",
          count: stats.supplyForIssuance,
          href: "/supplies",
          icon: Package,
          badge: "default",
        },
        {
          title: "Inventory items below reorder point",
          count: stats.lowStockItems,
          href: "/supplies",
          icon: AlertCircle,
          badge: "warning",
        },
        {
          title: "Assets tagged as missing",
          count: stats.missingAssets,
          href: "/property",
          icon: ShieldAlert,
          badge: "warning",
        },
        {
          title: "Inventory events in progress",
          count: stats.activeInventoryEvents,
          href: "/property",
          icon: Activity,
          badge: "info",
        },
      ].filter((item) => item.count > 0),
    [stats],
  );

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const now = Date.now();
    const activities: ActivityItem[] = [];

    snapshot.registryRecords.forEach((record, index) => {
      const parsed = parseDate(record.date);
      activities.push({
        id: `record-${record.reg || index}`,
        title: `${record.type || "Registry record"}: ${record.name || "Unnamed entry"}`,
        subtitle: `${record.reg || "No reference"} - ${record.status || "Pending"}`,
        when: formatWhen(record.date),
        sortTime: parsed ? parsed.getTime() : now - index,
        href: "/records",
        icon: FileText,
      });
    });

    snapshot.supplyRequests.forEach((request, index) => {
      const parsed = parseDate(request.date);
      activities.push({
        id: `supply-${request.id || index}`,
        title: `Supply request ${request.id || "#"} from ${request.requester || "Unknown"}`,
        subtitle: `Status: ${request.status || "Queued"}`,
        when: formatWhen(request.date),
        sortTime: parsed ? parsed.getTime() : now - (index + 1000),
        href: "/supplies",
        icon: Package,
      });
    });

    snapshot.propertyAssets.forEach((asset, index) => {
      const sourceDate =
        asset.updatedAt || asset.acquisitionDate || asset.createdAt;
      const parsed = parseDate(sourceDate);
      activities.push({
        id: `asset-${index}`,
        title: `${asset.description || "Asset record"} updated`,
        subtitle: `Status: ${asset.status || "In Stock"}`,
        when: formatWhen(sourceDate),
        sortTime: parsed ? parsed.getTime() : now - (index + 2000),
        href: "/property",
        icon: Building2,
      });
    });

    snapshot.employmentRecords.forEach((record, index) => {
      const sourceDate = record.createdAt || record.dateExecution;
      const parsed = parseDate(sourceDate);
      activities.push({
        id: `employment-${record.serialNumber || index}`,
        title: `${record.name || "Employment record"} contract entry`,
        subtitle: `${record.serialNumber || "No serial"} - ${record.surveyProject || "General assignment"}`,
        when: formatWhen(sourceDate),
        sortTime: parsed ? parsed.getTime() : now - (index + 3000),
        href: "/employment",
        icon: Briefcase,
      });
    });

    return activities.sort((a, b) => b.sortTime - a.sortTime).slice(0, 10);
  }, [snapshot]);

  const refreshData = () => {
    setIsRefreshing(true);
    setRefreshNonce((prev) => prev + 1);
    setLastUpdatedAt(new Date());
    window.setTimeout(() => setIsRefreshing(false), 600);
  };

  const userName = currentUser?.name || "Provincial Admin";

  return (
    <div className="space-y-5 pb-8">
      <StaggerIn index={0}>
        <div className="relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-white via-zinc-50 to-blue-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-blue-950/30 p-5 sm:p-6">
          <div className="absolute -top-20 -right-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between relative">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                Operations Dashboard
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
                Compact live pulse for registry, supply, property, and
                employment workflows.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                <Badge variant="info" className="!px-2.5 !py-1">
                  Live Snapshot
                </Badge>
                <LiveClockBadge />
                <span className="inline-flex items-center gap-1.5">
                  <Users size={12} /> {users.length.toLocaleString()} staff
                  accounts
                </span>
                <span className="inline-flex items-center gap-1.5">
                  Welcome, {userName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-10"
                onClick={() => navigate("/records")}
              >
                Open Records <ArrowRight size={14} className="ml-2" />
              </Button>
              <Button variant="blue" className="h-10" onClick={refreshData}>
                <RefreshCw
                  size={14}
                  className={`mr-2 ${isRefreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </StaggerIn>

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        {metricCards.map((card, index) => (
          <StaggerIn key={card.label} index={index + 1}>
            <button
              onClick={() => navigate(card.href)}
              className="w-full text-left p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {card.label}
                </p>
                <div className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-blue-600 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 transition-colors">
                  <card.icon size={16} />
                </div>
              </div>
              <p className="mt-3 text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                <AnimatedNumber value={card.value} format={card.formatter} />
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {card.hint}
              </p>
            </button>
          </StaggerIn>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <StaggerIn index={8} className="xl:col-span-8">
          <DashboardTrendCard
            trendData={trendData}
            hasTrendData={hasTrendData}
            trendWindow={trendWindow}
            lastUpdatedAt={lastUpdatedAt}
            onTrendWindowChange={setTrendWindow}
          />
        </StaggerIn>

        <StaggerIn index={9} className="xl:col-span-4">
          <DashboardWorkloadCard
            workloadItems={workloadItems}
            navigate={navigate}
          />
        </StaggerIn>

        <StaggerIn index={10} className="xl:col-span-4">
          <Card
            title="Priority Queue"
            description="Most urgent work across modules"
          >
            {priorityQueue.length > 0 ? (
              <div className="space-y-2">
                {priorityQueue.map((item) => (
                  <button
                    key={item.title}
                    onClick={() => navigate(item.href)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0">
                        <item.icon size={14} />
                      </div>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {item.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={item.badge}>
                        {item.count.toLocaleString()}
                      </Badge>
                      <ArrowRight size={14} className="text-zinc-400" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-sm text-zinc-500 dark:text-zinc-400">
                No urgent queue items right now.
              </div>
            )}

            <div className="mt-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <span>Completion Health</span>
                <span>{stats.completionRate}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max(Math.min(stats.completionRate, 100), 0)}%`,
                  }}
                />
              </div>
            </div>
          </Card>
        </StaggerIn>

        <StaggerIn index={11} className="xl:col-span-8">
          <Card
            title="Recent Activity"
            description="Cross-module updates from your latest records"
          >
            {recentActivity.length > 0 ? (
              <div
                className={`space-y-2 ${recentActivity.length > 5 ? "max-h-[332px] sm:max-h-[352px] overflow-y-auto pr-1 scrollbar-thin" : ""}`}
              >
                {recentActivity.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.href)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0">
                        <item.icon size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {item.when}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-sm text-zinc-500 dark:text-zinc-400">
                No activity yet. Add records from each module and they will
                appear here.
              </div>
            )}
          </Card>
        </StaggerIn>
      </div>
    </div>
  );
};
