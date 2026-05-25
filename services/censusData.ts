import { STORAGE_KEYS } from "../constants/storageKeys";
import { backend } from "./backend";
import { upsertAppStateFromStorageValue } from "./appState";
import { fetchPublicAppStateRecord } from "./publicAppState";

export type ActivityStatus =
  | "Fieldwork"
  | "Processing"
  | "Completed"
  | "Upcoming"
  | "Delayed";

export type ActivityFrequency =
  | "Monthly"
  | "Monthly / Quarterly"
  | "Quarterly"
  | "Annual"
  | "Annual (Non-FIES years)"
  | "Annual / Biennial"
  | "Every 2 Years"
  | "Every 3 Years"
  | "Every 5 Years"
  | "Every 10 Years"
  | "Semi-annual"
  | "Biennial"
  | "Triennial"
  | "Other";

export type ActivityType =
  | "Survey"
  | "Monitoring"
  | "Census"
  | "Census/Survey"
  | "Household Survey"
  | "Agriculture Survey"
  | "Price Survey"
  | "Establishment Survey"
  | "Fisheries Survey"
  | "Census/Community Data System"
  | "Other";

export const AURORA_MUNICIPALITIES = [
  "Baler",
  "Casiguran",
  "Dilasag",
  "Dinalungan",
  "Dingalan",
  "Dipaculao",
  "Maria Aurora",
  "San Luis",
] as const;

export type AuroraMunicipality = (typeof AURORA_MUNICIPALITIES)[number];

export interface MunicipalityCycleStat {
  municipality: AuroraMunicipality;
  targetCount: number;
  completedCount: number;
}

export interface CensusSurveyMaster {
  id: string;
  name: string;
  acronym: string;
  frequency: ActivityFrequency;
  activityType: ActivityType;
  coverage: string;
  notes: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CensusSurveyCycle {
  id: string;
  masterId: string;
  cycleCode: string;
  startDate: string;
  deadline: string;
  targetCount: number;
  completedCount: number;
  municipalityStats: MunicipalityCycleStat[];
  assignedTo: string;
  remarks: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface CensusActivity {
  id: string;
  masterId: string;
  cycleId: string | null;
  cycleCode: string;
  frequency: ActivityFrequency;
  activityType: ActivityType;
  name: string;
  acronym: string;
  coverage: string;
  notes: string;
  source: string;
  status: ActivityStatus;
  progress: number;
  startDate: string;
  deadline: string;
  targetCount: number;
  completedCount: number;
  municipalityStats: MunicipalityCycleStat[];
  assignedTo: string;
  lastUpdated: string;
  currentPhase: string;
  remarks: string;
  hasActiveCycle: boolean;
  updatedBy: string;
}

export interface CensusSurveyMasterInput {
  name: string;
  acronym: string;
  frequency: ActivityFrequency;
  activityType: ActivityType;
  coverage: string;
  notes: string;
  source: string;
}

export interface CensusSurveyCycleInput {
  cycleCode?: string;
  startDate: string;
  deadline: string;
  targetCount?: number;
  completedCount?: number;
  municipalityStats?: MunicipalityCycleStat[];
  assignedTo: string;
  remarks: string;
}

export interface CensusSurveyState {
  masters: CensusSurveyMaster[];
  cycles: CensusSurveyCycle[];
}

const STATUS_ORDER_MAP: Record<ActivityStatus, number> = {
  Upcoming: 1,
  Fieldwork: 2,
  Processing: 3,
  Delayed: 4,
  Completed: 5,
};

const FREQUENCY_ORDER: Record<string, number> = {
  Monthly: 1,
  "Monthly / Quarterly": 2,
  Quarterly: 3,
  "Semi-annual": 4,
  Annual: 5,
  "Annual (Non-FIES years)": 6,
  "Annual / Biennial": 7,
  Biennial: 8,
  "Every 2 Years": 9,
  Triennial: 10,
  "Every 3 Years": 11,
  "Every 5 Years": 12,
  "Every 10 Years": 13,
};

const STATUS_PHASE_MAP: Record<ActivityStatus, string> = {
  Fieldwork: "Data Collection",
  Processing: "Data Processing",
  Completed: "Completed & Archived",
  Upcoming: "Planning & Preparation",
  Delayed: "Needs Intervention",
};

export const STATUS_COLORS: Record<ActivityStatus, string> = {
  Fieldwork: "#10b981",
  Processing: "#3b82f6",
  Completed: "#6366f1",
  Upcoming: "#71717a",
  Delayed: "#f59e0b",
};

const DEFAULT_MASTER_SEED: Array<{
  name: string;
  activityType: ActivityType;
  frequency: ActivityFrequency;
}> = [
  {
    name: "Monthly Integrated Survey of Selected Industries (MISSI)",
    activityType: "Survey",
    frequency: "Monthly",
  },
  {
    name: "Producer Price Survey (PPS)",
    activityType: "Survey",
    frequency: "Monthly",
  },
  {
    name: "Labor Force Survey (LFS)",
    activityType: "Survey",
    frequency: "Monthly / Quarterly",
  },
  {
    name: "Farm Prices Survey (FPS)",
    activityType: "Survey",
    frequency: "Monthly",
  },
  {
    name: "Rice and Corn Stocks Survey (RCSS)",
    activityType: "Survey",
    frequency: "Monthly",
  },
  {
    name: "Consumer Price Index (CPI) Monitoring",
    activityType: "Monitoring",
    frequency: "Monthly",
  },
  {
    name: "Palay / Corn Production Survey",
    activityType: "Survey",
    frequency: "Quarterly",
  },
  {
    name: "Commercial / Backyard Livestock & Poultry Survey",
    activityType: "Survey",
    frequency: "Quarterly",
  },
  {
    name: "Inland / Municipal Fisheries Survey",
    activityType: "Survey",
    frequency: "Quarterly",
  },
  {
    name: "Annual Survey of Philippine Business and Industry (ASPBI)",
    activityType: "Survey",
    frequency: "Annual",
  },
  {
    name: "Survey on Overseas Filipinos (SOF)",
    activityType: "Survey",
    frequency: "Annual",
  },
  {
    name: "Annual Poverty Indicators Survey (APIS)",
    activityType: "Survey",
    frequency: "Annual (Non-FIES years)",
  },
  {
    name: "Survey on Information and Communication Tech (SICT)",
    activityType: "Survey",
    frequency: "Annual / Biennial",
  },
  {
    name: "Family Income and Expenditure Survey (FIES)",
    activityType: "Survey",
    frequency: "Every 3 Years",
  },
  {
    name: "Community-Based Monitoring System (CBMS)",
    activityType: "Census/Survey",
    frequency: "Every 3 Years",
  },
  {
    name: "Integrated Survey on Labor and Employment (ISLE)",
    activityType: "Survey",
    frequency: "Every 2 Years",
  },
  {
    name: "Occupational Wages Survey (OWS)",
    activityType: "Survey",
    frequency: "Every 2 Years",
  },
  {
    name: "Census of Philippine Business and Industry (CPBI)",
    activityType: "Census",
    frequency: "Every 5 Years",
  },
  {
    name: "National Demographic and Health Survey (NDHS)",
    activityType: "Survey",
    frequency: "Every 5 Years",
  },
  {
    name: "Functional Literacy, Education & Mass Media Survey",
    activityType: "Survey",
    frequency: "Every 5 Years",
  },
  {
    name: "Census of Population and Housing (CPH)",
    activityType: "Census",
    frequency: "Every 10 Years",
  },
  {
    name: "Census of Agriculture and Fisheries (CAF)",
    activityType: "Census",
    frequency: "Every 10 Years",
  },
];

const STOP_WORDS = new Set([
  "and",
  "of",
  "on",
  "the",
  "for",
  "with",
  "to",
  "in",
]);

export const ALL_STATUSES: ActivityStatus[] = [
  "Fieldwork",
  "Processing",
  "Completed",
  "Upcoming",
  "Delayed",
];

export const ALL_FREQUENCIES: ActivityFrequency[] = [
  "Monthly",
  "Monthly / Quarterly",
  "Quarterly",
  "Annual",
  "Annual (Non-FIES years)",
  "Annual / Biennial",
  "Every 2 Years",
  "Every 3 Years",
  "Every 5 Years",
  "Every 10 Years",
  "Semi-annual",
  "Biennial",
  "Triennial",
  "Other",
];

export const ALL_TYPES: ActivityType[] = [
  "Survey",
  "Monitoring",
  "Census",
  "Census/Survey",
  "Household Survey",
  "Agriculture Survey",
  "Price Survey",
  "Establishment Survey",
  "Fisheries Survey",
  "Census/Community Data System",
  "Other",
];

const hasWindow = typeof window !== "undefined";
type PublicAppStateReadStatus = "ok" | "not_found" | "forbidden";
type PublicAppStateReadResult = {
  value: unknown;
  status: PublicAppStateReadStatus;
};
export type PublicCensusFeedState =
  | "published"
  | "missing"
  | "private_only"
  | "invalid"
  | "error"
  | "stale";
export interface PublicCensusFeedSnapshot {
  state: PublicCensusFeedState;
  activities: CensusActivity[];
  activeCycleCount: number;
  rawActiveCycleCount: number;
  totalActivities: number;
  missingKeys: string[];
  unreadableKeys: string[];
  orphanedCycleCount: number;
}
const warnedUnreadablePublicCensusKeys = new Set<string>();

const nowIsoDate = (): string => new Date().toISOString().split("T")[0];
const nowIsoDateTime = (): string => new Date().toISOString();

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
};

const toIsoDate = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().split("T")[0];
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const parseJsonSafe = <T>(rawValue: string | null, fallback: T): T => {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
};

const normalizeFocalPerson = (value: unknown): string => {
  if (typeof value !== "string") return "No focal person";
  const normalized = value.trim();
  if (!normalized) return "No focal person";
  if (normalized.toLowerCase() === "unassigned") return "No focal person";
  return normalized;
};

const AURORA_MUNICIPALITY_LOOKUP = new Map<string, AuroraMunicipality>(
  AURORA_MUNICIPALITIES.map((municipality) => [
    municipality.toLowerCase(),
    municipality,
  ]),
);

const normalizeMunicipalityName = (
  value: unknown,
): AuroraMunicipality | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return AURORA_MUNICIPALITY_LOOKUP.get(normalized) || null;
};

const createEmptyMunicipalityStats = (): MunicipalityCycleStat[] =>
  AURORA_MUNICIPALITIES.map((municipality) => ({
    municipality,
    targetCount: 0,
    completedCount: 0,
  }));

const cloneMunicipalityStats = (
  stats: MunicipalityCycleStat[],
): MunicipalityCycleStat[] => stats.map((stat) => ({ ...stat }));

const toValidCount = (value: unknown): number =>
  Math.max(0, Math.round(toNumber(value, 0)));

const distributeIntegersEvenly = (total: number, slots: number): number[] => {
  if (slots <= 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  const base = Math.floor(safeTotal / slots);
  const remainder = safeTotal % slots;
  return Array.from(
    { length: slots },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
};

const distributeCompletedByTarget = (
  targets: number[],
  completedTotal: number,
): number[] => {
  const safeTargets = targets.map((target) => Math.max(0, Math.round(target)));
  const totalTarget = safeTargets.reduce((sum, value) => sum + value, 0);
  if (totalTarget <= 0) return safeTargets.map(() => 0);

  const clampedTotal = Math.min(
    Math.max(0, Math.round(completedTotal)),
    totalTarget,
  );
  const completed = safeTargets.map((target) => {
    if (target <= 0) return 0;
    return Math.min(target, Math.floor((target / totalTarget) * clampedTotal));
  });

  let remaining =
    clampedTotal - completed.reduce((sum, value) => sum + value, 0);
  while (remaining > 0) {
    let didAssign = false;
    for (let index = 0; index < completed.length && remaining > 0; index += 1) {
      if (completed[index] >= safeTargets[index]) continue;
      completed[index] += 1;
      remaining -= 1;
      didAssign = true;
    }
    if (!didAssign) break;
  }

  return completed;
};

const buildLegacyMunicipalityStats = (
  targetCount: number,
  completedCount: number,
): MunicipalityCycleStat[] => {
  const safeTarget = Math.max(0, Math.round(targetCount));
  const safeCompleted = Math.max(0, Math.round(completedCount));
  if (safeTarget <= 0) return createEmptyMunicipalityStats();

  const targetByMunicipality = distributeIntegersEvenly(
    safeTarget,
    AURORA_MUNICIPALITIES.length,
  );
  const completedByMunicipality = distributeCompletedByTarget(
    targetByMunicipality,
    safeCompleted,
  );

  return AURORA_MUNICIPALITIES.map((municipality, index) => ({
    municipality,
    targetCount: targetByMunicipality[index],
    completedCount: completedByMunicipality[index],
  }));
};

const normalizeMunicipalityStats = (
  rawStats: unknown,
  fallbackTargetCount = 0,
  fallbackCompletedCount = 0,
): MunicipalityCycleStat[] => {
  const seeded = new Map<AuroraMunicipality, MunicipalityCycleStat>(
    createEmptyMunicipalityStats().map((stat) => [stat.municipality, stat]),
  );

  if (Array.isArray(rawStats)) {
    for (const entry of rawStats) {
      if (!entry || typeof entry !== "object") continue;
      const source = entry as Partial<MunicipalityCycleStat>;
      const municipality = normalizeMunicipalityName(source.municipality);
      if (!municipality) continue;

      const targetCount = toValidCount(source.targetCount);
      const completedCount = Math.min(
        toValidCount(source.completedCount),
        targetCount,
      );
      seeded.set(municipality, {
        municipality,
        targetCount,
        completedCount,
      });
    }
  }

  const normalized = AURORA_MUNICIPALITIES.map(
    (municipality) => seeded.get(municipality)!,
  ).map((stat) => ({ ...stat }));
  const totalTarget = normalized.reduce(
    (sum, stat) => sum + stat.targetCount,
    0,
  );
  if (totalTarget > 0) return normalized;

  return buildLegacyMunicipalityStats(
    fallbackTargetCount,
    fallbackCompletedCount,
  );
};

const consolidateMunicipalityStats = (
  stats: MunicipalityCycleStat[],
): { targetCount: number; completedCount: number } => {
  return stats.reduce(
    (accumulator, stat) => {
      accumulator.targetCount += Math.max(0, Math.round(stat.targetCount));
      accumulator.completedCount += Math.max(
        0,
        Math.round(stat.completedCount),
      );
      return accumulator;
    },
    {
      targetCount: 0,
      completedCount: 0,
    },
  );
};

export const getMunicipalityTotals = (
  stats: MunicipalityCycleStat[],
): {
  targetCount: number;
  completedCount: number;
  progress: number;
} => {
  const totals = consolidateMunicipalityStats(stats);
  const safeCompleted = Math.min(totals.completedCount, totals.targetCount);
  return {
    targetCount: totals.targetCount,
    completedCount: safeCompleted,
    progress:
      totals.targetCount > 0
        ? clamp(Math.round((safeCompleted / totals.targetCount) * 100), 0, 100)
        : 0,
  };
};

const cycleNeedsMunicipalityMigration = (rawCycle: unknown): boolean => {
  if (!rawCycle || typeof rawCycle !== "object") return false;
  const source = rawCycle as { municipalityStats?: unknown };
  if (!Array.isArray(source.municipalityStats)) return true;

  const normalizedNames = new Set(
    source.municipalityStats
      .map((stat) => {
        if (!stat || typeof stat !== "object") return null;
        return normalizeMunicipalityName(
          (stat as { municipality?: unknown }).municipality,
        );
      })
      .filter((value): value is AuroraMunicipality => !!value),
  );

  return AURORA_MUNICIPALITIES.some(
    (municipality) => !normalizedNames.has(municipality),
  );
};

const deriveAcronym = (name: string): string => {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()));

  const acronym = words.map((word) => word[0].toUpperCase()).join("");
  return acronym || "CS";
};

const extractNameAndAcronym = (
  name: string,
): { cleanName: string; acronym: string } => {
  const acronymMatch = name.match(/\(([^()]+)\)/);
  const extractedAcronym = acronymMatch
    ? acronymMatch[1].trim().replace(/\s+/g, "")
    : "";
  const cleanName = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    cleanName,
    acronym: extractedAcronym || deriveAcronym(cleanName),
  };
};

const buildUniqueMasterId = (
  baseName: string,
  usedIds: Set<string>,
): string => {
  const baseId = `census-survey-${slugify(baseName) || "activity"}`;
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  const uniqueId = `${baseId}-${suffix}`;
  usedIds.add(uniqueId);
  return uniqueId;
};

const createSeedMasters = (): CensusSurveyMaster[] => {
  const timestamp = nowIsoDateTime();
  const usedIds = new Set<string>();

  return DEFAULT_MASTER_SEED.map((seed) => {
    const { cleanName, acronym } = extractNameAndAcronym(seed.name);
    return {
      id: buildUniqueMasterId(cleanName, usedIds),
      name: cleanName,
      acronym,
      frequency: seed.frequency,
      activityType: seed.activityType,
      coverage: "Aurora Province",
      notes: "",
      source: "PSA Census & Surveys baseline catalog",
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: "System",
      updatedBy: "System",
    };
  });
};

const normalizeFrequency = (value: unknown): ActivityFrequency => {
  if (typeof value !== "string") return "Other";
  return ALL_FREQUENCIES.includes(value as ActivityFrequency)
    ? (value as ActivityFrequency)
    : "Other";
};

const normalizeType = (value: unknown): ActivityType => {
  if (typeof value !== "string") return "Other";
  return ALL_TYPES.includes(value as ActivityType)
    ? (value as ActivityType)
    : "Other";
};

const normalizeMaster = (value: unknown): CensusSurveyMaster | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CensusSurveyMaster>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const timestamp = nowIsoDateTime();
  const acronym =
    typeof raw.acronym === "string" && raw.acronym.trim()
      ? raw.acronym.trim()
      : deriveAcronym(name);

  const baseId =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `census-survey-${slugify(name)}`;

  return {
    id: baseId,
    name,
    acronym,
    frequency: normalizeFrequency(raw.frequency),
    activityType: normalizeType(raw.activityType),
    coverage: typeof raw.coverage === "string" ? raw.coverage.trim() : "",
    notes: typeof raw.notes === "string" ? raw.notes.trim() : "",
    source: typeof raw.source === "string" ? raw.source.trim() : "",
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt
        ? raw.createdAt
        : timestamp,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : timestamp,
    createdBy:
      typeof raw.createdBy === "string" && raw.createdBy.trim()
        ? raw.createdBy.trim()
        : "System",
    updatedBy:
      typeof raw.updatedBy === "string" && raw.updatedBy.trim()
        ? raw.updatedBy.trim()
        : "System",
  };
};

const normalizeCycle = (value: unknown): CensusSurveyCycle | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CensusSurveyCycle>;

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const masterId = typeof raw.masterId === "string" ? raw.masterId.trim() : "";
  if (!id || !masterId) return null;

  const municipalityStats = normalizeMunicipalityStats(
    raw.municipalityStats,
    toValidCount(raw.targetCount),
    toValidCount(raw.completedCount),
  );
  const totals = consolidateMunicipalityStats(municipalityStats);
  const targetCount = totals.targetCount;
  const completedCount = Math.min(totals.completedCount, targetCount);
  const timestamp = nowIsoDateTime();

  return {
    id,
    masterId,
    cycleCode: typeof raw.cycleCode === "string" ? raw.cycleCode.trim() : "",
    startDate: toIsoDate(raw.startDate, nowIsoDate()),
    deadline: toIsoDate(raw.deadline, ""),
    targetCount,
    completedCount,
    municipalityStats,
    assignedTo: normalizeFocalPerson(raw.assignedTo),
    remarks: typeof raw.remarks === "string" ? raw.remarks.trim() : "",
    isActive: !!raw.isActive,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt
        ? raw.createdAt
        : timestamp,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : timestamp,
    updatedBy:
      typeof raw.updatedBy === "string" && raw.updatedBy.trim()
        ? raw.updatedBy.trim()
        : "System",
  };
};

const cloneState = (state: CensusSurveyState): CensusSurveyState => ({
  masters: state.masters.map((master) => ({ ...master })),
  cycles: state.cycles.map((cycle) => ({
    ...cycle,
    municipalityStats: cloneMunicipalityStats(cycle.municipalityStats),
  })),
});

const cloneActivities = (activities: CensusActivity[]): CensusActivity[] =>
  activities.map((activity) => ({
    ...activity,
    municipalityStats: cloneMunicipalityStats(activity.municipalityStats),
  }));

const enforceSingleActiveCycle = (
  cycles: CensusSurveyCycle[],
): CensusSurveyCycle[] => {
  const latestActiveByMaster = new Map<string, CensusSurveyCycle>();

  for (const cycle of cycles) {
    if (!cycle.isActive) continue;
    const existing = latestActiveByMaster.get(cycle.masterId);
    if (!existing || cycle.updatedAt > existing.updatedAt) {
      latestActiveByMaster.set(cycle.masterId, cycle);
    }
  }

  return cycles.map((cycle) => {
    if (!cycle.isActive) return cycle;
    const latest = latestActiveByMaster.get(cycle.masterId);
    if (latest?.id === cycle.id) return cycle;
    return {
      ...cycle,
      isActive: false,
    };
  });
};

let cachedState: CensusSurveyState | null = null;
let cachedActivities: CensusActivity[] | null = null;
let cachedPublicActivities: CensusActivity[] | null = null;

const persistState = (state: CensusSurveyState) => {
  if (hasWindow) {
    window.localStorage.setItem(
      STORAGE_KEYS.censusSurveyMasters,
      JSON.stringify(state.masters),
    );
    window.localStorage.setItem(
      STORAGE_KEYS.censusSurveyCycles,
      JSON.stringify(state.cycles),
    );
  }
  cachedState = cloneState(state);
};

const initializeState = (): CensusSurveyState => {
  if (cachedState) return cloneState(cachedState);

  if (!hasWindow) {
    cachedState = { masters: createSeedMasters(), cycles: [] };
    return cloneState(cachedState);
  }

  const rawMasters = parseJsonSafe<unknown[]>(
    window.localStorage.getItem(STORAGE_KEYS.censusSurveyMasters),
    [],
  );
  const rawCycles = parseJsonSafe<unknown[]>(
    window.localStorage.getItem(STORAGE_KEYS.censusSurveyCycles),
    [],
  );

  const normalizedMasters = rawMasters
    .map((value) => normalizeMaster(value))
    .filter((value): value is CensusSurveyMaster => !!value);

  const masters =
    normalizedMasters.length > 0 ? normalizedMasters : createSeedMasters();
  const masterIds = new Set(masters.map((master) => master.id));

  const normalizedCycles = rawCycles
    .map((value) => normalizeCycle(value))
    .filter(
      (value): value is CensusSurveyCycle =>
        !!value && masterIds.has(value.masterId),
    );

  const cycles = enforceSingleActiveCycle(normalizedCycles);

  const state: CensusSurveyState = { masters, cycles };
  const needsMunicipalityMigration = rawCycles.some((value) =>
    cycleNeedsMunicipalityMigration(value),
  );
  const shouldPersist =
    normalizedMasters.length === 0 ||
    normalizedCycles.length !== rawCycles.length ||
    needsMunicipalityMigration ||
    JSON.stringify(normalizedCycles) !== JSON.stringify(cycles);

  if (shouldPersist) {
    persistState(state);
    if (normalizedMasters.length === 0) {
      window.localStorage.removeItem(STORAGE_KEYS.censusActivities);
      window.localStorage.removeItem(STORAGE_KEYS.censusStatusOverrides);
    }
  } else {
    cachedState = cloneState(state);
  }

  return cloneState(state);
};

const buildStrictPublicStateFromRaw = (
  rawMasters: unknown,
  rawCycles: unknown,
): {
  state: CensusSurveyState;
  orphanedCycleCount: number;
  invalidPayload: boolean;
} => {
  if (!Array.isArray(rawMasters) || !Array.isArray(rawCycles)) {
    return {
      state: { masters: [], cycles: [] },
      orphanedCycleCount: 0,
      invalidPayload: true,
    };
  }

  const normalizedMasters = rawMasters
    .map((value) => normalizeMaster(value))
    .filter((value): value is CensusSurveyMaster => !!value);

  const normalizedCycleCandidates = rawCycles
    .map((value) => normalizeCycle(value))
    .filter((value): value is CensusSurveyCycle => !!value);

  const masterIds = new Set(normalizedMasters.map((master) => master.id));
  const normalizedCycles = normalizedCycleCandidates.filter((value) =>
    masterIds.has(value.masterId),
  );

  return {
    state: {
      masters: normalizedMasters,
      cycles: enforceSingleActiveCycle(normalizedCycles),
    },
    orphanedCycleCount:
      normalizedCycleCandidates.length - normalizedCycles.length,
    invalidPayload: false,
  };
};

const warnUnreadablePublicCensusKeys = (keys: string[]) => {
  if (!hasWindow || keys.length === 0) return;

  const normalizedKeys = [...new Set(keys)].sort();
  const warningId = normalizedKeys.join("|");
  if (warnedUnreadablePublicCensusKeys.has(warningId)) return;

  warnedUnreadablePublicCensusKeys.add(warningId);
  console.warn(
    "Public Census & Surveys state is not readable without login. Active cycles will stay device-local on the landing page until the PocketBase public app_state rules allow these keys:",
    normalizedKeys.join(", "),
  );
};

const readPublicGlobalAppStateValue = async (
  key: string,
): Promise<PublicAppStateReadResult> => {
  const response = await fetchPublicAppStateRecord(key);

  if (response.status === 403 || response.status === 401) {
    return {
      value: null,
      status: "forbidden",
    };
  }

  if (response.status === 404) {
    return {
      value: null,
      status: "not_found",
    };
  }

  if (!response.ok) {
    throw new Error(`public-app-state-http-${response.status}`);
  }

  return {
    value: response.record?.value ?? null,
    status: response.record ? "ok" : "not_found",
  };
};

const countRawActiveCycles = (rawCycles: unknown): number => {
  if (!Array.isArray(rawCycles)) return 0;
  return rawCycles.filter(
    (entry) =>
      !!entry &&
      typeof entry === "object" &&
      !!(entry as { isActive?: unknown }).isActive,
  ).length;
};

const summarizePublicCensusActivities = (activities: CensusActivity[]) => ({
  activeCycleCount: activities.filter((activity) => activity.hasActiveCycle)
    .length,
  totalActivities: activities.length,
});

export const inspectPublicCensusFeed = async (options?: {
  force?: boolean;
}): Promise<PublicCensusFeedSnapshot> => {
  const { force = false } = options || {};

  if (!force && cachedPublicActivities) {
    const summary = summarizePublicCensusActivities(cachedPublicActivities);
    return {
      state: "published",
      activities: cloneActivities(cachedPublicActivities),
      activeCycleCount: summary.activeCycleCount,
      rawActiveCycleCount: summary.activeCycleCount,
      totalActivities: summary.totalActivities,
      missingKeys: [],
      unreadableKeys: [],
      orphanedCycleCount: 0,
    };
  }

  try {
    const [mastersResult, cyclesResult] = await Promise.all([
      readPublicGlobalAppStateValue(STORAGE_KEYS.censusSurveyMasters),
      readPublicGlobalAppStateValue(STORAGE_KEYS.censusSurveyCycles),
    ]);

    const unreadableKeys = [
      mastersResult.status === "forbidden"
        ? STORAGE_KEYS.censusSurveyMasters
        : null,
      cyclesResult.status === "forbidden"
        ? STORAGE_KEYS.censusSurveyCycles
        : null,
    ].filter((value): value is string => !!value);

    if (unreadableKeys.length > 0) {
      warnUnreadablePublicCensusKeys(unreadableKeys);
      return {
        state: "private_only",
        activities: [],
        activeCycleCount: 0,
        rawActiveCycleCount: 0,
        totalActivities: 0,
        missingKeys: [],
        unreadableKeys,
        orphanedCycleCount: 0,
      };
    }

    const missingKeys = [
      mastersResult.status === "not_found"
        ? STORAGE_KEYS.censusSurveyMasters
        : null,
      cyclesResult.status === "not_found"
        ? STORAGE_KEYS.censusSurveyCycles
        : null,
    ].filter((value): value is string => !!value);

    if (missingKeys.length > 0) {
      return {
        state: "missing",
        activities: [],
        activeCycleCount: 0,
        rawActiveCycleCount: countRawActiveCycles(cyclesResult.value),
        totalActivities: 0,
        missingKeys,
        unreadableKeys: [],
        orphanedCycleCount: 0,
      };
    }

    const rawActiveCycleCount = countRawActiveCycles(cyclesResult.value);
    const { state, orphanedCycleCount, invalidPayload } =
      buildStrictPublicStateFromRaw(mastersResult.value, cyclesResult.value);
    const activities = toActivityList(state);
    const summary = summarizePublicCensusActivities(activities);
    const hasDisplayMismatch =
      orphanedCycleCount > 0 ||
      rawActiveCycleCount > summary.activeCycleCount ||
      invalidPayload;

    cachedPublicActivities = cloneActivities(activities);

    return {
      state: hasDisplayMismatch ? "invalid" : "published",
      activities: cloneActivities(activities),
      activeCycleCount: summary.activeCycleCount,
      rawActiveCycleCount,
      totalActivities: summary.totalActivities,
      missingKeys: [],
      unreadableKeys: [],
      orphanedCycleCount,
    };
  } catch {
    if (cachedPublicActivities) {
      const summary = summarizePublicCensusActivities(cachedPublicActivities);
      return {
        state: "stale",
        activities: cloneActivities(cachedPublicActivities),
        activeCycleCount: summary.activeCycleCount,
        rawActiveCycleCount: summary.activeCycleCount,
        totalActivities: summary.totalActivities,
        missingKeys: [],
        unreadableKeys: [],
        orphanedCycleCount: 0,
      };
    }

    return {
      state: "error",
      activities: [],
      activeCycleCount: 0,
      rawActiveCycleCount: 0,
      totalActivities: 0,
      missingKeys: [],
      unreadableKeys: [],
      orphanedCycleCount: 0,
    };
  }
};

const getActiveCycleByMaster = (
  cycles: CensusSurveyCycle[],
): Map<string, CensusSurveyCycle> => {
  const map = new Map<string, CensusSurveyCycle>();
  for (const cycle of cycles) {
    if (!cycle.isActive) continue;
    const existing = map.get(cycle.masterId);
    if (!existing || cycle.updatedAt > existing.updatedAt) {
      map.set(cycle.masterId, cycle);
    }
  }
  return map;
};

const computeProgress = (
  completedCount: number,
  targetCount: number,
): number => {
  if (targetCount <= 0) return 0;
  return clamp(Math.round((completedCount / targetCount) * 100), 0, 100);
};

const computeStatus = (
  cycle: Pick<
    CensusSurveyCycle,
    "startDate" | "deadline" | "completedCount" | "targetCount"
  >,
): ActivityStatus => {
  const progress = computeProgress(cycle.completedCount, cycle.targetCount);
  const today = nowIsoDate();

  if (cycle.targetCount > 0 && cycle.completedCount >= cycle.targetCount) {
    return "Completed";
  }
  if (cycle.startDate && today < cycle.startDate) {
    return "Upcoming";
  }
  if (cycle.deadline && today > cycle.deadline) {
    return "Delayed";
  }
  if (progress >= 80) {
    return "Processing";
  }
  return "Fieldwork";
};

export const previewCycleMetrics = (draft: {
  startDate: string;
  deadline: string;
  targetCount?: number;
  completedCount?: number;
  municipalityStats?: MunicipalityCycleStat[];
}): { progress: number; status: ActivityStatus; phase: string } => {
  const municipalityStats = normalizeMunicipalityStats(
    draft.municipalityStats,
    toValidCount(draft.targetCount),
    toValidCount(draft.completedCount),
  );
  const totals = consolidateMunicipalityStats(municipalityStats);
  const targetCount = totals.targetCount;
  const completedCount = clamp(totals.completedCount, 0, targetCount);
  const startDate = toIsoDate(draft.startDate, nowIsoDate());
  const deadline = toIsoDate(draft.deadline, "");

  const status = computeStatus({
    startDate,
    deadline,
    targetCount,
    completedCount,
  });
  const progress = computeProgress(completedCount, targetCount);

  return {
    progress,
    status,
    phase: STATUS_PHASE_MAP[status],
  };
};

const toActivity = (
  master: CensusSurveyMaster,
  cycle: CensusSurveyCycle | undefined,
): CensusActivity => {
  if (!cycle) {
    return {
      id: master.id,
      masterId: master.id,
      cycleId: null,
      cycleCode: "",
      frequency: master.frequency,
      activityType: master.activityType,
      name: master.name,
      acronym: master.acronym,
      coverage: master.coverage,
      notes: master.notes,
      source: master.source,
      status: "Upcoming",
      progress: 0,
      startDate: "",
      deadline: "",
      targetCount: 0,
      completedCount: 0,
      municipalityStats: createEmptyMunicipalityStats(),
      assignedTo: "No focal person",
      lastUpdated: master.updatedAt,
      currentPhase: STATUS_PHASE_MAP.Upcoming,
      remarks: "No active cycle configured yet.",
      hasActiveCycle: false,
      updatedBy: master.updatedBy,
    };
  }

  const { progress, status, phase } = previewCycleMetrics({
    startDate: cycle.startDate,
    deadline: cycle.deadline,
    municipalityStats: cycle.municipalityStats,
  });

  return {
    id: master.id,
    masterId: master.id,
    cycleId: cycle.id,
    cycleCode: cycle.cycleCode,
    frequency: master.frequency,
    activityType: master.activityType,
    name: master.name,
    acronym: master.acronym,
    coverage: master.coverage,
    notes: master.notes,
    source: master.source,
    status,
    progress,
    startDate: cycle.startDate,
    deadline: cycle.deadline,
    targetCount: cycle.targetCount,
    completedCount: cycle.completedCount,
    municipalityStats: cloneMunicipalityStats(cycle.municipalityStats),
    assignedTo: cycle.assignedTo,
    lastUpdated: cycle.updatedAt,
    currentPhase: phase,
    remarks: cycle.remarks || `${phase} in progress for current cycle.`,
    hasActiveCycle: true,
    updatedBy: cycle.updatedBy,
  };
};

const toActivityList = (state: CensusSurveyState): CensusActivity[] => {
  const activeCycleMap = getActiveCycleByMaster(state.cycles);
  return state.masters
    .map((master) => toActivity(master, activeCycleMap.get(master.id)))
    .sort((left, right) => {
      const byFrequency =
        getFrequencyOrder(left.frequency) - getFrequencyOrder(right.frequency);
      if (byFrequency !== 0) return byFrequency;
      return left.name.localeCompare(right.name);
    });
};

const sanitizeMasterInput = (
  input: CensusSurveyMasterInput,
): CensusSurveyMasterInput => {
  const { cleanName, acronym: inferredAcronym } = extractNameAndAcronym(
    input.name.trim(),
  );
  return {
    name: cleanName,
    acronym: input.acronym.trim() || inferredAcronym,
    activityType: normalizeType(input.activityType),
    frequency: normalizeFrequency(input.frequency),
    coverage: input.coverage.trim(),
    notes: input.notes.trim(),
    source: input.source.trim(),
  };
};

const generateCycleCode = (
  frequency: ActivityFrequency,
  startDate: string,
): string => {
  const parsedDate = new Date(startDate || nowIsoDate());
  const year = parsedDate.getUTCFullYear();
  const month = parsedDate.getUTCMonth() + 1;
  const quarter = Math.floor((month - 1) / 3) + 1;

  if (frequency.includes("Monthly"))
    return `${year}-${String(month).padStart(2, "0")}`;
  if (frequency.includes("Quarterly")) return `${year}-Q${quarter}`;
  if (frequency.includes("Annual")) return `${year}`;
  if (frequency.includes("Every 2 Years")) return `${year}-2Y`;
  if (frequency.includes("Every 3 Years")) return `${year}-3Y`;
  if (frequency.includes("Every 5 Years")) return `${year}-5Y`;
  if (frequency.includes("Every 10 Years")) return `${year}-10Y`;
  return `${year}-CYCLE`;
};

interface SanitizedCycleInput {
  cycleCode: string;
  startDate: string;
  deadline: string;
  targetCount: number;
  completedCount: number;
  municipalityStats: MunicipalityCycleStat[];
  assignedTo: string;
  remarks: string;
}

const sanitizeCycleInput = (
  master: CensusSurveyMaster,
  input: CensusSurveyCycleInput,
): SanitizedCycleInput => {
  const startDate = toIsoDate(input.startDate, nowIsoDate());
  const deadline = toIsoDate(input.deadline, "");
  if (deadline && startDate && startDate > deadline) {
    throw new Error("Deadline must be on or after start date.");
  }

  const municipalityStats = normalizeMunicipalityStats(
    input.municipalityStats,
    toValidCount(input.targetCount),
    toValidCount(input.completedCount),
  );
  const totals = consolidateMunicipalityStats(municipalityStats);
  const targetCount = totals.targetCount;
  const completedCount = Math.min(totals.completedCount, targetCount);

  if (targetCount <= 0) {
    throw new Error("Add a target count for at least one municipality.");
  }

  return {
    cycleCode:
      input.cycleCode?.trim() || generateCycleCode(master.frequency, startDate),
    startDate,
    deadline,
    targetCount,
    completedCount,
    municipalityStats,
    assignedTo: normalizeFocalPerson(input.assignedTo),
    remarks: input.remarks.trim(),
  };
};

const resolveActor = (actor?: string): string => {
  if (!actor) return "System";
  const trimmed = actor.trim();
  return trimmed || "System";
};

const persistAndInvalidate = (state: CensusSurveyState) => {
  persistState(state);
  cachedActivities = null;
  cachedPublicActivities = null;
};

const syncPublicCensusState = async (state: CensusSurveyState) => {
  if (!backend.authStore.isValid) return;

  await Promise.all([
    upsertAppStateFromStorageValue(
      STORAGE_KEYS.censusSurveyMasters,
      JSON.stringify(state.masters),
    ),
    upsertAppStateFromStorageValue(
      STORAGE_KEYS.censusSurveyCycles,
      JSON.stringify(state.cycles),
    ),
  ]);

  cachedPublicActivities = toActivityList(state);
};

const persistAndSyncPublicState = async (state: CensusSurveyState) => {
  await syncPublicCensusState(state);
  persistAndInvalidate(state);
};

export const fetchCensusSurveyState = async (): Promise<CensusSurveyState> =>
  initializeState();

export const fetchCensusActivities = async (): Promise<CensusActivity[]> => {
  if (cachedActivities) return cloneActivities(cachedActivities);
  const state = initializeState();
  const activities = toActivityList(state);
  cachedActivities = activities;
  return cloneActivities(activities);
};

export const refreshCensusActivities = async (): Promise<CensusActivity[]> => {
  cachedState = null;
  cachedActivities = null;
  return fetchCensusActivities();
};

export const getCensusActivitiesSnapshot = (): CensusActivity[] => {
  return cachedPublicActivities ? cloneActivities(cachedPublicActivities) : [];
};

export const fetchPublicCensusActivities = async (): Promise<
  CensusActivity[]
> => {
  const publicSnapshot = await inspectPublicCensusFeed();

  if (
    publicSnapshot.state === "published" ||
    publicSnapshot.state === "invalid" ||
    publicSnapshot.state === "stale"
  ) {
    return cloneActivities(publicSnapshot.activities);
  }

  if (backend.authStore.isValid) {
    const localState = initializeState();
    const localActivities = toActivityList(localState);
    const shouldBackfillPublicState = publicSnapshot.state === "missing";

    if (shouldBackfillPublicState) {
      try {
        await syncPublicCensusState(localState);
        cachedPublicActivities = cloneActivities(localActivities);
        return cloneActivities(localActivities);
      } catch (error) {
        console.warn(
          "Unable to backfill public Census & Surveys app state from local data.",
          error,
        );
      }
    }
  }

  if (publicSnapshot.state === "error") {
    console.error(
      "Failed to load public Census & Surveys activities from app state. Public landing view is unavailable until the backend responds again.",
    );
  }

  return cloneActivities(publicSnapshot.activities);
};

export const refreshPublicCensusActivities = async (): Promise<
  CensusActivity[]
> => {
  cachedPublicActivities = null;
  return fetchPublicCensusActivities();
};

export const saveCensusSurveyMaster = async (
  input: CensusSurveyMasterInput,
  options?: { masterId?: string; actor?: string },
): Promise<CensusSurveyMaster> => {
  const state = initializeState();
  const actor = resolveActor(options?.actor);
  const timestamp = nowIsoDateTime();

  const sanitized = sanitizeMasterInput(input);
  if (!sanitized.name) {
    throw new Error("Activity name is required.");
  }

  const duplicate = state.masters.find((master) => {
    if (options?.masterId && master.id === options.masterId) return false;
    return master.name.toLowerCase() === sanitized.name.toLowerCase();
  });
  if (duplicate) {
    throw new Error("An activity with the same name already exists.");
  }

  if (options?.masterId) {
    const existing = state.masters.find(
      (master) => master.id === options.masterId,
    );
    if (!existing) {
      throw new Error("Unable to find the activity to update.");
    }

    const updated: CensusSurveyMaster = {
      ...existing,
      ...sanitized,
      updatedAt: timestamp,
      updatedBy: actor,
    };

    state.masters = state.masters.map((master) =>
      master.id === existing.id ? updated : master,
    );
    await persistAndSyncPublicState(state);
    return { ...updated };
  }

  const usedIds = new Set(state.masters.map((master) => master.id));
  const created: CensusSurveyMaster = {
    id: buildUniqueMasterId(sanitized.name, usedIds),
    ...sanitized,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: actor,
    updatedBy: actor,
  };

  state.masters = [...state.masters, created];
  await persistAndSyncPublicState(state);
  return { ...created };
};

export const saveCensusSurveyCycle = async (
  masterId: string,
  input: CensusSurveyCycleInput,
  options?: { cycleId?: string; actor?: string },
): Promise<CensusSurveyCycle> => {
  const state = initializeState();
  const actor = resolveActor(options?.actor);
  const timestamp = nowIsoDateTime();

  const master = state.masters.find((entry) => entry.id === masterId);
  if (!master) {
    throw new Error("Unable to find the selected activity.");
  }

  const sanitized = sanitizeCycleInput(master, input);

  if (options?.cycleId) {
    const existing = state.cycles.find(
      (cycle) => cycle.id === options.cycleId && cycle.masterId === masterId,
    );
    if (!existing) {
      throw new Error("Unable to find the selected cycle.");
    }

    const updated: CensusSurveyCycle = {
      ...existing,
      ...sanitized,
      municipalityStats: cloneMunicipalityStats(sanitized.municipalityStats),
      isActive: true,
      updatedAt: timestamp,
      updatedBy: actor,
    };

    state.cycles = state.cycles.map((cycle) => {
      if (cycle.id === updated.id) return updated;
      if (cycle.masterId === masterId && cycle.isActive) {
        return {
          ...cycle,
          isActive: false,
          updatedAt: timestamp,
          updatedBy: actor,
        };
      }
      return cycle;
    });

    await persistAndSyncPublicState(state);
    return { ...updated };
  }

  const activeCycle = state.cycles.find(
    (cycle) => cycle.masterId === masterId && cycle.isActive,
  );
  if (activeCycle) {
    throw new Error(
      "This activity already has an active cycle. Close it first before creating a new cycle.",
    );
  }

  const cycleId = `cycle-${masterId}-${Date.now()}`;
  const created: CensusSurveyCycle = {
    id: cycleId,
    masterId,
    cycleCode:
      sanitized.cycleCode ||
      generateCycleCode(master.frequency, sanitized.startDate),
    startDate: sanitized.startDate,
    deadline: sanitized.deadline,
    targetCount: sanitized.targetCount,
    completedCount: sanitized.completedCount,
    municipalityStats: cloneMunicipalityStats(sanitized.municipalityStats),
    assignedTo: sanitized.assignedTo,
    remarks: sanitized.remarks,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    updatedBy: actor,
  };

  state.cycles = [...state.cycles, created];
  await persistAndSyncPublicState(state);
  return { ...created };
};

export const closeActiveCensusSurveyCycle = async (
  masterId: string,
  options?: { actor?: string },
): Promise<CensusSurveyCycle> => {
  const state = initializeState();
  const actor = resolveActor(options?.actor);
  const timestamp = nowIsoDateTime();

  const activeCycle = state.cycles.find(
    (cycle) => cycle.masterId === masterId && cycle.isActive,
  );
  if (!activeCycle) {
    throw new Error("No active cycle is currently open for this activity.");
  }

  const closed: CensusSurveyCycle = {
    ...activeCycle,
    isActive: false,
    updatedAt: timestamp,
    updatedBy: actor,
  };

  state.cycles = state.cycles.map((cycle) =>
    cycle.id === activeCycle.id ? closed : cycle,
  );
  await persistAndSyncPublicState(state);
  return { ...closed };
};

export const getFrequencyOrder = (frequency: string): number =>
  FREQUENCY_ORDER[frequency] ?? 99;

export const getStatusOrder = (status: ActivityStatus): number =>
  STATUS_ORDER_MAP[status] ?? 99;

export const getStatusColor = (status: ActivityStatus): string =>
  STATUS_COLORS[status] ?? "#71717a";

export const getStatusBgClass = (status: ActivityStatus): string => {
  switch (status) {
    case "Fieldwork":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "Processing":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "Completed":
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    case "Upcoming":
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20";
    case "Delayed":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20";
  }
};

export const getFrequencyBgClass = (frequency: ActivityFrequency): string => {
  switch (frequency) {
    case "Monthly":
    case "Monthly / Quarterly":
      return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
    case "Quarterly":
    case "Semi-annual":
      return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20";
    case "Annual":
    case "Annual (Non-FIES years)":
    case "Annual / Biennial":
      return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "Every 2 Years":
    case "Biennial":
      return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
    case "Every 3 Years":
    case "Triennial":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "Every 5 Years":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
    case "Every 10 Years":
      return "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20";
  }
};

export const getTypeBgClass = (type: ActivityType): string => {
  switch (type) {
    case "Survey":
    case "Household Survey":
    case "Agriculture Survey":
    case "Price Survey":
    case "Establishment Survey":
    case "Fisheries Survey":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "Monitoring":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "Census":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
    case "Census/Survey":
    case "Census/Community Data System":
      return "bg-pink-500/10 text-pink-600 dark:text-pink-400";
    default:
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
  }
};
