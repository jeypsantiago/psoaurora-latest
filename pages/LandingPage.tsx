import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building,
  CalendarDays,
  ChevronRight,
  Compass,
  FileText,
  Info,
  Phone,
  Shield,
  Moon,
  Sun,
  X,
  Users,
  User,
} from "lucide-react";
import { useLandingConfig } from "../LandingConfigContext";
import { useTheme } from "../theme-context";
import { Theme } from "../types";
import { PublicBrand } from "../components/public/PublicBrand";
import { PublicButton } from "../components/public/PublicButton";
import { PublicChip } from "../components/public/PublicChip";
import { PublicFooter } from "../components/public/PublicFooter";
import { RevealSection } from "../components/public/RevealSection";
import { STORAGE_KEYS } from "../constants/storageKeys";
import {
  AURORA_MUNICIPALITIES,
  fetchPublicCensusActivities,
  getCensusActivitiesSnapshot,
  refreshPublicCensusActivities,
  type CensusActivity,
  type MunicipalityCycleStat,
} from "../services/censusData";
import { resolveMediaSource } from "../services/mediaAssets";

const LandingTeamSection = lazy(() =>
  import("../components/public/LandingTeamSection").then((module) => ({
    default: module.LandingTeamSection,
  })),
);
const LandingCensusSection = lazy(() =>
  import("../components/public/LandingCensusSection").then((module) => ({
    default: module.LandingCensusSection,
  })),
);
const AuroraMunicipalityHeatMap = lazy(() =>
  import("../components/census/AuroraMunicipalityHeatMap").then((module) => ({
    default: module.AuroraMunicipalityHeatMap,
  })),
);

const coreServices = [
  {
    title: "Civil Registration Services",
    description:
      "Birth, marriage, and death document processing with official verification workflows.",
    icon: FileText,
  },
  {
    title: "Provincial Data Coordination",
    description:
      "Municipality-level data harmonization and reporting standards for all partner LGUs.",
    icon: Building,
  },
  {
    title: "Community Statistics Programs",
    description:
      "Delivery of census and survey indicators for local planning and policy support.",
    icon: Users,
  },
  {
    title: "Quality and Compliance",
    description:
      "Secure, auditable, and quality-checked records aligned with PSA protocols.",
    icon: Shield,
  },
];

const advisories = [
  {
    title: "National ID Registration Support Schedule",
    date: "March 05, 2026",
    category: "Public Service",
  },
  {
    title: "Provincial Data Validation Window for Municipal Focal Persons",
    date: "March 12, 2026",
    category: "Operations",
  },
  {
    title: "Civil Registration Mobile Service in Coastal Municipalities",
    date: "March 20, 2026",
    category: "Field Program",
  },
];

const LANDING_NAVIGATE_DELAY_MS = 120;
const LANDING_MODAL_CLOSE_DELAY_MS = 96;

const statFormatter = new Intl.NumberFormat("en-PH");
const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
});

const ACTIVITY_STATUS_PRIORITY: Record<CensusActivity["status"], number> = {
  Fieldwork: 5,
  Processing: 4,
  Delayed: 3,
  Upcoming: 2,
  Completed: 1,
};

const ACTIVITY_STATUS_STYLES: Record<CensusActivity["status"], string> = {
  Fieldwork:
    "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/18 dark:text-emerald-200 border-emerald-500/30 dark:border-emerald-400/45",
  Processing:
    "bg-blue-500/12 text-blue-700 dark:bg-blue-500/18 dark:text-blue-200 border-blue-500/30 dark:border-blue-400/45",
  Completed:
    "bg-indigo-500/12 text-indigo-700 dark:bg-indigo-500/18 dark:text-indigo-200 border-indigo-500/30 dark:border-indigo-400/45",
  Upcoming:
    "bg-zinc-500/12 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 border-zinc-500/30 dark:border-zinc-600/70",
  Delayed:
    "bg-amber-500/12 text-amber-700 dark:bg-amber-500/18 dark:text-amber-200 border-amber-500/30 dark:border-amber-400/45",
};

const formatCount = (value: number): string =>
  statFormatter.format(Math.max(0, Math.round(value)));

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const formatPercent = (value: number): string => {
  const clamped = clampPercent(value);
  const rounded = Math.round(clamped * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
};

const parseDateValue = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatDateOrFallback = (value: string, fallback = "Not set"): string => {
  const timestamp = parseDateValue(value);
  if (!timestamp) return fallback;
  return dateFormatter.format(new Date(timestamp));
};

const formatTimeOrFallback = (
  value: number | null,
  fallback = "Not synced yet",
): string => {
  if (!value) return fallback;
  return timeFormatter.format(new Date(value));
};

const LandingSectionFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-3xl border border-psa-line dark:border-zinc-800 bg-white dark:bg-[#0b0b0b] p-6 sm:p-8">
    <div className="inline-flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 text-[12px] font-semibold text-zinc-500 dark:text-zinc-300 shadow-sm">
      <span className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      Loading {label}...
    </div>
  </div>
);

const toMunicipalityPreviewRows = (stats: MunicipalityCycleStat[]) => {
  const seeded = new Map(
    AURORA_MUNICIPALITIES.map((municipality) => [
      municipality,
      { municipality, targetCount: 0, completedCount: 0 },
    ]),
  );

  stats.forEach((stat) => {
    const targetCount = Math.max(0, Math.round(Number(stat.targetCount) || 0));
    const completedCount = Math.min(
      Math.max(0, Math.round(Number(stat.completedCount) || 0)),
      targetCount,
    );
    seeded.set(stat.municipality, {
      municipality: stat.municipality,
      targetCount,
      completedCount,
    });
  });

  return AURORA_MUNICIPALITIES.map((municipality) => {
    const row = seeded.get(municipality)!;
    const progress =
      row.targetCount > 0
        ? clampPercent((row.completedCount / row.targetCount) * 100)
        : 0;
    return {
      ...row,
      progress,
      remainingCount: Math.max(0, row.targetCount - row.completedCount),
    };
  });
};

type CensusSplitGroupKey = "census" | "surveys";

type LivePublicActivity = {
  activity: CensusActivity;
  groupKey: CensusSplitGroupKey;
  groupTitle: string;
};

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { config } = useLandingConfig();
  const { theme, toggleTheme } = useTheme();
  const isDarkTheme = theme === Theme.DARK;
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [heroBackgroundFailedSrc, setHeroBackgroundFailedSrc] = useState<
    string | null
  >(null);
  const [pinnedTeamMemberId, setPinnedTeamMemberId] = useState<string | null>(
    null,
  );
  const [hoveredTeamMemberId, setHoveredTeamMemberId] = useState<string | null>(
    null,
  );
  const [pinnedCensusActivityId, setPinnedCensusActivityId] = useState<
    string | null
  >(null);
  const [isCensusModalClosing, setIsCensusModalClosing] = useState(false);
  const [enableLandingMapAnimation, setEnableLandingMapAnimation] =
    useState(false);
  const [censusSnapshotActivities, setCensusSnapshotActivities] = useState<
    CensusActivity[]
  >(() => getCensusActivitiesSnapshot());
  const [isCensusSnapshotLoading, setIsCensusSnapshotLoading] = useState(true);
  const [isCensusSnapshotRefreshing, setIsCensusSnapshotRefreshing] =
    useState(false);
  const [lastCensusSnapshotSyncAt, setLastCensusSnapshotSyncAt] = useState<
    number | null
  >(null);
  const teamCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const teamCardButtonRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const censusModalRef = useRef<HTMLDivElement | null>(null);
  const censusModalCloseTimeoutRef = useRef<number | null>(null);
  const navStateFrameRef = useRef<number | null>(null);
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const isLandingPageMountedRef = useRef(true);
  const censusSnapshotRefreshInFlightRef = useRef(false);

  useEffect(() => {
    const evaluateNavState = () => {
      if (navStateFrameRef.current !== null) return;

      navStateFrameRef.current = window.requestAnimationFrame(() => {
        navStateFrameRef.current = null;

        const nextScrolled = window.scrollY > 18;
        setScrolled((previous) =>
          previous === nextScrolled ? previous : nextScrolled,
        );

        const heroSection = heroSectionRef.current;
        if (!heroSection) {
          const nextPastHero = window.scrollY > 420;
          setPastHero((previous) =>
            previous === nextPastHero ? previous : nextPastHero,
          );
          return;
        }

        const navHeight = nextScrolled ? 78 : 96;
        const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
        const nextPastHero = window.scrollY + navHeight >= heroBottom;
        setPastHero((previous) =>
          previous === nextPastHero ? previous : nextPastHero,
        );
      });
    };

    evaluateNavState();
    window.addEventListener("scroll", evaluateNavState, { passive: true });
    window.addEventListener("resize", evaluateNavState);
    return () => {
      if (navStateFrameRef.current !== null) {
        window.cancelAnimationFrame(navStateFrameRef.current);
      }
      window.removeEventListener("scroll", evaluateNavState);
      window.removeEventListener("resize", evaluateNavState);
    };
  }, []);

  useEffect(() => {
    isLandingPageMountedRef.current = true;

    return () => {
      isLandingPageMountedRef.current = false;
    };
  }, []);

  const loadCensusSnapshot = useCallback(
    async (options?: { force?: boolean; silent?: boolean }) => {
      const { force = false, silent = false } = options || {};
      if (censusSnapshotRefreshInFlightRef.current) return;

      censusSnapshotRefreshInFlightRef.current = true;
      if (silent) {
        setIsCensusSnapshotRefreshing(true);
      } else {
        setIsCensusSnapshotLoading(true);
      }

      try {
        const activities = force
          ? await refreshPublicCensusActivities()
          : await fetchPublicCensusActivities();
        if (!isLandingPageMountedRef.current) return;
        setCensusSnapshotActivities(activities);
        setLastCensusSnapshotSyncAt(Date.now());
      } catch (error) {
        console.error(
          "Failed to load Census & Surveys snapshot for landing page.",
          error,
        );
        if (!isLandingPageMountedRef.current) return;
      } finally {
        censusSnapshotRefreshInFlightRef.current = false;
        if (isLandingPageMountedRef.current) {
          if (silent) {
            setIsCensusSnapshotRefreshing(false);
          } else {
            setIsCensusSnapshotLoading(false);
          }
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadCensusSnapshot({ force: true });
  }, [loadCensusSnapshot]);

  useEffect(() => {
    const refreshSilently = () => {
      if (document.visibilityState === "hidden") return;
      void loadCensusSnapshot({ force: true, silent: true });
    };

    const intervalId = window.setInterval(refreshSilently, 60000);

    const handleFocus = () => refreshSilently();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSilently();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (
        event.key &&
        event.key !== STORAGE_KEYS.censusSurveyMasters &&
        event.key !== STORAGE_KEYS.censusSurveyCycles
      ) {
        return;
      }
      refreshSilently();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadCensusSnapshot]);

  const goToSection = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleLoginNavigation = () => {
    if (isPageTransitioning) return;
    setIsPageTransitioning(true);
    window.setTimeout(() => {
      navigate("/login");
    }, LANDING_NAVIGATE_DELAY_MS);
  };

  const handleCensusModuleNavigation = (activity: CensusActivity) => {
    if (isPageTransitioning) return;

    const params = new URLSearchParams({
      activity: activity.masterId,
      intent: "edit-cycle",
    });

    setIsPageTransitioning(true);
    window.setTimeout(() => {
      navigate(`/census?${params.toString()}`);
    }, LANDING_NAVIGATE_DELAY_MS);
  };

  const closeCensusModal = useCallback(() => {
    if (!pinnedCensusActivityId || isCensusModalClosing) return;

    setIsCensusModalClosing(true);
    if (censusModalCloseTimeoutRef.current) {
      window.clearTimeout(censusModalCloseTimeoutRef.current);
    }

    censusModalCloseTimeoutRef.current = window.setTimeout(() => {
      setPinnedCensusActivityId(null);
      setIsCensusModalClosing(false);
      censusModalCloseTimeoutRef.current = null;
    }, LANDING_MODAL_CLOSE_DELAY_MS);
  }, [isCensusModalClosing, pinnedCensusActivityId]);

  const toggleCensusModal = useCallback(
    (activityId: string) => {
      if (censusModalCloseTimeoutRef.current) {
        window.clearTimeout(censusModalCloseTimeoutRef.current);
        censusModalCloseTimeoutRef.current = null;
      }

      if (pinnedCensusActivityId === activityId && !isCensusModalClosing) {
        setIsCensusModalClosing(true);
        censusModalCloseTimeoutRef.current = window.setTimeout(() => {
          setPinnedCensusActivityId(null);
          setIsCensusModalClosing(false);
          censusModalCloseTimeoutRef.current = null;
        }, LANDING_MODAL_CLOSE_DELAY_MS);
        return;
      }

      setIsCensusModalClosing(false);
      setPinnedCensusActivityId(activityId);
    },
    [isCensusModalClosing, pinnedCensusActivityId],
  );

  const teamMembers = config.team.members;
  const teamEntries = teamMembers.map((member, index) => ({ member, index }));
  const TEAM_CARD_BASE_SHADOW = "0 12px 28px rgba(0,51,102,0.07)";
  const resetTeamCardMotion = (memberId: string) => {
    const card = teamCardRefs.current[memberId];
    const button = teamCardButtonRefs.current[memberId];
    if (!card || !button) return;

    card.style.boxShadow = TEAM_CARD_BASE_SHADOW;
    button.style.transform =
      "perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)";
  };
  const heroBackgroundSource = resolveMediaSource(
    config.hero.backgroundImage?.trim() || "/PSA.webp",
  );
  const heroBackgroundPosition =
    config.hero.backgroundPosition || "center center";
  const heroBackgroundCanRender =
    !!heroBackgroundSource && heroBackgroundFailedSrc !== heroBackgroundSource;

  const censusSnapshot = useMemo(() => {
    const summarizeGroup = (activities: CensusActivity[]) => {
      const totals = activities.reduce(
        (acc, activity) => {
          acc.totalTarget += Math.max(0, activity.targetCount);
          acc.totalCompleted += Math.max(0, activity.completedCount);
          if (activity.hasActiveCycle) acc.activeCycles += 1;
          if (activity.status === "Delayed") acc.delayedActivities += 1;
          return acc;
        },
        {
          totalTarget: 0,
          totalCompleted: 0,
          activeCycles: 0,
          delayedActivities: 0,
        },
      );

      return {
        totalActivities: activities.length,
        ...totals,
      };
    };

    const scoreActivity = (activity: CensusActivity): number => {
      const statusPriority = ACTIVITY_STATUS_PRIORITY[activity.status] ?? 0;
      return (
        (activity.hasActiveCycle ? 150 : 0) +
        statusPriority * 20 +
        clampPercent(activity.progress) / 2 +
        parseDateValue(activity.lastUpdated) / 1000000000000
      );
    };

    const sortActivities = (activities: CensusActivity[]): CensusActivity[] => {
      return [...activities].sort((left, right) => {
        const byScore = scoreActivity(right) - scoreActivity(left);
        if (byScore !== 0) return byScore;
        return left.name.localeCompare(right.name);
      });
    };

    const buildGroup = (
      key: CensusSplitGroupKey,
      title: string,
      subtitle: string,
      activities: CensusActivity[],
    ) => {
      const sortedActivities = sortActivities(activities);

      return {
        key,
        title,
        subtitle,
        ...summarizeGroup(sortedActivities),
        activities: sortedActivities,
      };
    };

    const censusActivities: CensusActivity[] = [];
    const surveyActivities: CensusActivity[] = [];

    censusSnapshotActivities.forEach((activity) => {
      const normalizedType = activity.activityType.toLowerCase();
      if (normalizedType.includes("census")) {
        censusActivities.push(activity);
      } else {
        surveyActivities.push(activity);
      }
    });

    return {
      groups: [
        buildGroup(
          "census",
          "Census",
          "Household and community enumeration operations",
          censusActivities,
        ),
        buildGroup(
          "surveys",
          "Surveys",
          "Sectoral and thematic statistical collection activities",
          surveyActivities,
        ),
      ],
    };
  }, [censusSnapshotActivities]);

  useEffect(() => {
    const activityIds = new Set(
      censusSnapshot.groups.flatMap((group) =>
        group.activities.map((activity) => activity.id),
      ),
    );

    setPinnedCensusActivityId((previous) =>
      previous && activityIds.has(previous) ? previous : null,
    );
  }, [censusSnapshot]);

  useEffect(
    () => () => {
      if (censusModalCloseTimeoutRef.current) {
        window.clearTimeout(censusModalCloseTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!pinnedCensusActivityId) {
      setIsCensusModalClosing(false);
    }
  }, [pinnedCensusActivityId]);

  const activeCensusActivityId = pinnedCensusActivityId;
  const livePublicActivities = useMemo<LivePublicActivity[]>(() => {
    return censusSnapshot.groups
      .flatMap((group) =>
        group.activities
          .filter((activity) => activity.hasActiveCycle)
          .map((activity) => ({
            activity,
            groupKey: group.key,
            groupTitle: group.title,
          })),
      )
      .sort((left, right) => {
        const byProgress = right.activity.progress - left.activity.progress;
        if (byProgress !== 0) return byProgress;
        return left.activity.name.localeCompare(right.activity.name);
      });
  }, [censusSnapshot.groups]);
  const featuredLiveActivity = livePublicActivities[0] ?? null;
  const activeCensusSelection = useMemo(() => {
    if (!activeCensusActivityId) return null;

    for (const group of censusSnapshot.groups) {
      const activity = group.activities.find(
        (entry) => entry.id === activeCensusActivityId,
      );
      if (activity) {
        return { group, activity };
      }
    }

    return null;
  }, [activeCensusActivityId, censusSnapshot.groups]);
  const activeCensusGroup = activeCensusSelection?.group || null;
  const activeCensusActivity = activeCensusSelection?.activity || null;
  const activeCensusIsCensus = activeCensusGroup?.key !== "surveys";
  const modalGlassTone = activeCensusIsCensus
    ? "dark:border-blue-400/18 dark:bg-[linear-gradient(145deg,rgba(9,24,46,0.76),rgba(6,16,31,0.54))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    : "dark:border-teal-400/18 dark:bg-[linear-gradient(145deg,rgba(8,27,24,0.76),rgba(6,18,17,0.54))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
  const modalSoftGlassTone = activeCensusIsCensus
    ? "dark:border-blue-400/14 dark:bg-[linear-gradient(145deg,rgba(9,24,46,0.58),rgba(6,16,31,0.36))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
    : "dark:border-teal-400/14 dark:bg-[linear-gradient(145deg,rgba(8,27,24,0.58),rgba(6,18,17,0.36))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
  const modalChipTone = activeCensusIsCensus
    ? "dark:border-blue-400/18 dark:bg-[linear-gradient(145deg,rgba(11,31,59,0.78),rgba(8,20,38,0.58))]"
    : "dark:border-teal-400/18 dark:bg-[linear-gradient(145deg,rgba(8,31,28,0.78),rgba(7,21,18,0.58))]";
  const showActiveProgressAnimation =
    !!activeCensusActivity &&
    activeCensusActivity.hasActiveCycle &&
    (activeCensusActivity.status === "Fieldwork" ||
      activeCensusActivity.status === "Processing");
  const activeCensusMunicipalityRows = useMemo(
    () => toMunicipalityPreviewRows(activeCensusActivity?.municipalityStats ?? []),
    [activeCensusActivity?.municipalityStats],
  );
  const lowOutputMunicipalities = useMemo(
    () =>
      activeCensusMunicipalityRows
        .filter((row) => row.targetCount > 0)
        .sort((left, right) => {
          const byProgress = left.progress - right.progress;
          if (byProgress !== 0) return byProgress;
          const byRemaining = right.remainingCount - left.remainingCount;
          if (byRemaining !== 0) return byRemaining;
          return left.municipality.localeCompare(right.municipality);
        })
        .slice(0, 3),
    [activeCensusMunicipalityRows],
  );
  const noTargetMunicipalities = useMemo(
    () => activeCensusMunicipalityRows.filter((row) => row.targetCount === 0),
    [activeCensusMunicipalityRows],
  );
  const hasUnderperformingMunicipality = useMemo(
    () => lowOutputMunicipalities.some((row) => row.progress < 100),
    [lowOutputMunicipalities],
  );

  useEffect(() => {
    if (!activeCensusActivity) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const focusHandle = window.requestAnimationFrame(() => {
      censusModalRef.current?.focus();
    });

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCensusModal();
      }
    };

    window.addEventListener("keydown", handleEsc);

    return () => {
      window.cancelAnimationFrame(focusHandle);
      window.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [activeCensusActivity, closeCensusModal]);

  useEffect(() => {
    if (!activeCensusActivity) return;
    censusModalRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeCensusActivity]);

  useEffect(() => {
    if (!activeCensusActivity) {
      setEnableLandingMapAnimation(false);
      return;
    }

    setEnableLandingMapAnimation(false);
    const animationHandle = window.requestAnimationFrame(() => {
      setEnableLandingMapAnimation(true);
    });

    return () => {
      window.cancelAnimationFrame(animationHandle);
    };
  }, [activeCensusActivity]);

  useEffect(() => {
    setHeroBackgroundFailedSrc(null);
  }, [heroBackgroundSource]);

  return (
    <div
      className={`min-h-screen bg-gradient-to-b from-white via-psa-surface to-white dark:from-[#050505] dark:via-[#080808] dark:to-[#050505] text-slate-800 dark:text-slate-100 overflow-x-hidden transform-gpu transition-all duration-200 ease-out ${isPageTransitioning ? "opacity-0 translate-y-2 blur-[1.5px]" : "opacity-100 translate-y-0 blur-0"}`}
    >
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(0,86,179,0.11),transparent_40%),radial-gradient(circle_at_86%_1%,rgba(206,17,38,0.08),transparent_30%),radial-gradient(circle_at_80%_86%,rgba(255,193,7,0.10),transparent_36%)] dark:bg-[radial-gradient(circle_at_18%_14%,rgba(255,255,255,0.09),transparent_42%),radial-gradient(circle_at_82%_86%,rgba(255,255,255,0.05),transparent_46%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(255,255,255,0.92),rgba(255,255,255,0.92)),repeating-linear-gradient(90deg,rgba(0,51,102,0.05)_0,rgba(0,51,102,0.05)_1px,transparent_1px,transparent_82px)] dark:bg-[linear-gradient(0deg,rgba(6,6,6,0.92),rgba(6,6,6,0.92)),repeating-linear-gradient(90deg,rgba(255,255,255,0.04)_0,rgba(255,255,255,0.04)_1px,transparent_1px,transparent_82px)]" />
      </div>

      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          pastHero
            ? "bg-white border-b border-slate-200 py-2.5 shadow-[0_10px_28px_rgba(2,6,23,0.14)] dark:bg-[#080808] dark:border-zinc-800"
            : scrolled
              ? isDarkTheme
                ? "bg-black/80 backdrop-blur-xl border-b border-zinc-700/70 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.55)]"
                : "bg-[#021934]/74 backdrop-blur-xl border-b border-white/20 py-2.5 shadow-[0_10px_24px_rgba(2,6,23,0.24)]"
              : "bg-transparent py-5"
        }`}
      >
        <div className="public-container flex items-center justify-between gap-4">
          <button
            onClick={() => navigate("/")}
            className={`group relative flex items-center gap-3 text-left rounded-xl px-1.5 py-1 transition-all duration-300 ease-out hover:-translate-y-0.5 ${pastHero ? "hover:bg-slate-100/85 dark:hover:bg-zinc-900/85" : "hover:bg-white/10"}`}
          >
            <PublicBrand tone={pastHero ? "default" : "inverse"} />
            <span
              className={`pointer-events-none absolute inset-x-3 -bottom-0.5 h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${pastHero ? "bg-slate-300 dark:bg-zinc-700" : "bg-white/45"}`}
            />
          </button>

          <div className="hidden md:flex items-center gap-5 lg:gap-7 text-xs font-semibold uppercase tracking-[0.12em]">
            <button
              onClick={() => goToSection("highlights")}
              className={`inline-flex items-center gap-1 transition-all duration-300 ease-out hover:-translate-y-0.5 ${pastHero ? "text-[#1f2f44] hover:text-psa-blue dark:text-slate-200 dark:hover:text-blue-300" : "text-white/90 hover:text-white"}`}
            >
              <Compass className="w-4 h-4" /> Highlights
            </button>
            <button
              onClick={() => goToSection("services")}
              className={`inline-flex items-center gap-1 transition-all duration-300 ease-out hover:-translate-y-0.5 ${pastHero ? "text-[#1f2f44] hover:text-psa-blue dark:text-slate-200 dark:hover:text-blue-300" : "text-white/90 hover:text-white"}`}
            >
              <Building className="w-4 h-4" /> Services
            </button>
            <button
              onClick={() => goToSection("team")}
              className={`inline-flex items-center gap-1 transition-all duration-300 ease-out hover:-translate-y-0.5 ${pastHero ? "text-[#1f2f44] hover:text-psa-blue dark:text-slate-200 dark:hover:text-blue-300" : "text-white/90 hover:text-white"}`}
            >
              <Users className="w-4 h-4" /> Team
            </button>
            <button
              onClick={() => goToSection("advisories")}
              className={`inline-flex items-center gap-1 transition-all duration-300 ease-out hover:-translate-y-0.5 ${pastHero ? "text-[#1f2f44] hover:text-psa-blue dark:text-slate-200 dark:hover:text-blue-300" : "text-white/90 hover:text-white"}`}
            >
              <Info className="w-4 h-4" /> Advisories
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className={`psa-focus-ring relative shrink-0 inline-flex h-9 w-[78px] items-center rounded-full border overflow-hidden transition-all duration-300 ease-out hover:-translate-y-0.5 ${
                pastHero
                  ? "border-slate-300/95 dark:border-zinc-700/95"
                  : "border-white/35"
              } ${isDarkTheme ? "shadow-[0_2px_8px_rgba(0,0,0,0.26)]" : "shadow-[0_2px_10px_rgba(15,23,42,0.20)]"} ${scrolled ? "scale-[0.98]" : "scale-100"}
              `}
              aria-label={
                isDarkTheme ? "Switch to light mode" : "Switch to dark mode"
              }
              title={
                isDarkTheme ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              <span
                className={`absolute inset-0 rounded-full transition-colors duration-300 ${isDarkTheme ? "bg-[#1f1f1f]/92" : "bg-[#dce2ea]/94"}`}
              />
              <span
                className={`absolute left-[3px] top-1/2 h-[30px] w-[30px] -translate-y-1/2 rounded-full border shadow-[0_2px_8px_rgba(0,0,0,0.22)] backdrop-blur-md transition-all duration-300 ease-out ${isDarkTheme ? "translate-x-0 bg-white/24 border-white/45" : "translate-x-[42px] bg-[#111827]/26 border-[#0f172a]/38"}`}
              />
              <span className="relative z-10 grid w-full grid-cols-2 place-items-center">
                <span
                  className={`inline-flex transition-all duration-300 ${isDarkTheme ? "text-zinc-100" : "text-zinc-600"}`}
                >
                  <Sun className="w-3.5 h-3.5" />
                </span>
                <span
                  className={`inline-flex transition-all duration-300 ${isDarkTheme ? "text-zinc-300" : "text-zinc-800"}`}
                >
                  <Moon className="w-3.5 h-3.5" />
                </span>
              </span>
            </button>

            <button
              onClick={handleLoginNavigation}
              className={`psa-elevate psa-press psa-focus-ring shrink-0 inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-psa-blue hover:bg-psa-navy text-white text-xs sm:text-sm font-semibold shadow-[0_10px_24px_rgba(0,86,179,0.22)] transition-all duration-300 ease-out hover:-translate-y-0.5 ${scrolled ? "px-2.5 sm:px-3.5 py-1.5 sm:py-1.5" : "px-3 sm:px-4 py-2"}`}
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Staff Login</span>
            </button>
          </div>
        </div>

        <div className="md:hidden px-4 mt-3">
          <div
            className={`public-container rounded-xl p-1.5 flex gap-1.5 overflow-x-auto scrollbar-hide ${pastHero ? "border border-slate-200 bg-white shadow-[0_8px_18px_rgba(2,6,23,0.08)] dark:border-zinc-800 dark:bg-[#0a0a0a]" : scrolled ? (isDarkTheme ? "border border-zinc-700/70 bg-black/70 backdrop-blur-lg shadow-[0_8px_20px_rgba(0,0,0,0.5)]" : "border border-white/35 bg-[#021934]/58 backdrop-blur-lg shadow-[0_8px_20px_rgba(2,6,23,0.28)]") : "border border-white/30 bg-black/25 backdrop-blur-md"}`}
          >
            <PublicChip
              onClick={() => goToSection("highlights")}
              className={`shrink-0 rounded-lg text-xs font-semibold ${pastHero ? "!text-[#334155] dark:!text-slate-200 hover:bg-psa-surfaceAlt dark:hover:bg-zinc-800" : "bg-white/95 text-slate-700 border-white/70 hover:bg-white"}`}
            >
              Highlights
            </PublicChip>
            <PublicChip
              onClick={() => goToSection("services")}
              className={`shrink-0 rounded-lg text-xs font-semibold ${pastHero ? "!text-[#334155] dark:!text-slate-200 hover:bg-psa-surfaceAlt dark:hover:bg-zinc-800" : "bg-white/95 text-slate-700 border-white/70 hover:bg-white"}`}
            >
              Services
            </PublicChip>
            <PublicChip
              onClick={() => goToSection("team")}
              className={`shrink-0 rounded-lg text-xs font-semibold ${pastHero ? "!text-[#334155] dark:!text-slate-200 hover:bg-psa-surfaceAlt dark:hover:bg-zinc-800" : "bg-white/95 text-slate-700 border-white/70 hover:bg-white"}`}
            >
              Team
            </PublicChip>
            <PublicChip
              onClick={() => goToSection("advisories")}
              className={`shrink-0 rounded-lg text-xs font-semibold ${pastHero ? "!text-[#334155] dark:!text-slate-200 hover:bg-psa-surfaceAlt dark:hover:bg-zinc-800" : "bg-white/95 text-slate-700 border-white/70 hover:bg-white"}`}
            >
              Advisories
            </PublicChip>
            <PublicChip
              onClick={() => goToSection("contact")}
              className={`shrink-0 rounded-lg text-xs font-semibold ${pastHero ? "!text-[#334155] dark:!text-slate-200 hover:bg-psa-surfaceAlt dark:hover:bg-zinc-800" : "bg-white/95 text-slate-700 border-white/70 hover:bg-white"}`}
            >
              Contact
            </PublicChip>
          </div>
        </div>
      </nav>

      <section
        ref={heroSectionRef}
        className="relative overflow-hidden min-h-[84vh] sm:min-h-[92vh] lg:min-h-[96vh] pt-44 sm:pt-52 lg:pt-60 2xl:pt-64 pb-14 sm:pb-18 lg:pb-20"
      >
        <div className="absolute inset-0 z-0">
          <div
            className={`absolute inset-0 ${isDarkTheme ? "bg-[#020202]" : "bg-[#1f2937]"}`}
          />
          <img
            key={heroBackgroundSource}
            src={heroBackgroundSource}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${heroBackgroundCanRender ? "opacity-100" : "opacity-0"}`}
            style={{ objectPosition: heroBackgroundPosition }}
            onLoad={() => {
              if (heroBackgroundFailedSrc === heroBackgroundSource) {
                setHeroBackgroundFailedSrc(null);
              }
            }}
            onError={() => setHeroBackgroundFailedSrc(heroBackgroundSource)}
          />
          <img
            src="/PSA.webp"
            alt=""
            aria-hidden="true"
            className={`absolute right-[7%] top-[10%] w-52 sm:w-72 object-contain transition-opacity duration-500 ${heroBackgroundCanRender ? "opacity-0" : "opacity-20"}`}
          />
          <div
            className={`absolute inset-0 ${
              isDarkTheme
                ? "bg-[linear-gradient(104deg,rgba(0,0,0,0.94)_6%,rgba(6,6,6,0.88)_48%,rgba(10,10,10,0.78)_74%,rgba(0,0,0,0.92)_100%)]"
                : "bg-[linear-gradient(104deg,rgba(15,23,42,0.82)_6%,rgba(17,24,39,0.72)_48%,rgba(31,41,55,0.56)_74%,rgba(15,23,42,0.78)_100%)]"
            }`}
          />
          <div
            className={`absolute inset-0 ${
              isDarkTheme
                ? "bg-[radial-gradient(circle_at_16%_22%,rgba(255,255,255,0.10),transparent_40%),radial-gradient(circle_at_85%_85%,rgba(255,255,255,0.06),transparent_48%)]"
                : "bg-[radial-gradient(circle_at_16%_22%,rgba(255,255,255,0.18),transparent_40%),radial-gradient(circle_at_84%_84%,rgba(255,255,255,0.10),transparent_46%)]"
            }`}
          />
          <div className="absolute inset-x-0 bottom-0 h-32 sm:h-40 pointer-events-none">
            <div
              className={`absolute inset-0 ${
                isDarkTheme
                  ? "bg-[linear-gradient(to_bottom,rgba(5,5,5,0)_0%,rgba(5,5,5,0.30)_34%,rgba(5,5,5,0.72)_74%,rgba(5,5,5,0.90)_100%)]"
                  : "bg-[linear-gradient(to_bottom,rgba(15,23,42,0)_0%,rgba(15,23,42,0.10)_36%,rgba(248,250,252,0.42)_74%,rgba(248,250,252,0.74)_100%)]"
              }`}
            />
            <div
              className={`absolute inset-x-10 sm:inset-x-20 bottom-2 h-6 rounded-full blur-2xl ${isDarkTheme ? "bg-black/28" : "bg-slate-900/12"}`}
            />
          </div>
        </div>

        <div className="public-container relative z-10">
          <div className="max-w-4xl">
            <div
              className="relative opacity-0 animate-reveal-left"
              style={{ animationDuration: "0.8s" }}
            >
              <div className="relative">
                <p className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-white bg-white/12 border border-white/26 rounded-full px-4 py-2">
                  {config.hero.eyebrow || "Philippine Statistics Authority"}
                </p>

                <h1 className="mt-6 font-serif text-[2rem] sm:text-[3rem] lg:text-[3.7rem] leading-[1.07] text-white max-w-3xl">
                  {config.hero.headline.split("\n").map((line, idx) => (
                    <React.Fragment key={idx}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))}
                </h1>

                <p className="mt-5 text-base sm:text-lg text-slate-100/95 max-w-2xl leading-relaxed">
                  {config.hero.subheadline}
                </p>

                <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3.5">
                  <PublicButton
                    onClick={handleLoginNavigation}
                    variant="primary"
                    size="lg"
                    className="shadow-[0_14px_28px_rgba(0,86,179,0.34)]"
                  >
                    {config.hero.buttonText} <ArrowRight className="w-4 h-4" />
                  </PublicButton>
                  <button
                    onClick={() => goToSection("services")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/28 bg-white/8 px-5 py-3 text-sm font-semibold text-white/95 hover:bg-white/16 transition-colors"
                  >
                    Explore services <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {!isCensusSnapshotLoading && featuredLiveActivity ? (
                  <div className="mt-6 max-w-3xl rounded-[24px] border border-white/18 bg-white/10 px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.2)] backdrop-blur-md sm:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                          Live Now On Public Board
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white leading-snug">
                          {featuredLiveActivity.groupTitle}:{" "}
                          {featuredLiveActivity.activity.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-100/90">
                          {featuredLiveActivity.activity.currentPhase} -{" "}
                          {formatCount(
                            featuredLiveActivity.activity.completedCount,
                          )}{" "}
                          of{" "}
                          {formatCount(
                            featuredLiveActivity.activity.targetCount,
                          )}{" "}
                          completed.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-xs font-semibold text-white">
                          {featuredLiveActivity.groupTitle}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-emerald-300/35 bg-emerald-500/18 px-3 py-1.5 text-xs font-semibold text-emerald-50">
                          {formatPercent(
                            featuredLiveActivity.activity.progress,
                          )}{" "}
                          progress
                        </span>
                        <span className="inline-flex items-center rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-xs font-semibold text-white">
                          Updated{" "}
                          {formatDateOrFallback(
                            featuredLiveActivity.activity.lastUpdated,
                            "recently",
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="pointer-events-none relative -mt-12 sm:-mt-14 h-16 sm:h-20 z-[1]">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,23,42,0.05)_0%,rgba(248,250,252,0.74)_100%)] dark:bg-[linear-gradient(to_bottom,rgba(5,5,5,0.08)_0%,rgba(5,5,5,0.72)_100%)]" />
        <div className="absolute inset-x-10 sm:inset-x-24 bottom-1 h-8 rounded-full bg-slate-900/10 dark:bg-black/24 blur-2xl" />
      </div>

      <Suspense fallback={<LandingSectionFallback label="team section" />}>
          <LandingTeamSection
            teamTitle={config.team.title}
            teamSubtitle={config.team.subtitle}
            teamEntries={teamEntries}
            pinnedTeamMemberId={pinnedTeamMemberId}
            setPinnedTeamMemberId={setPinnedTeamMemberId}
            hoveredTeamMemberId={hoveredTeamMemberId}
            setHoveredTeamMemberId={setHoveredTeamMemberId}
            teamCardRefs={teamCardRefs}
            teamCardButtonRefs={teamCardButtonRefs}
            resetTeamCardStyle={resetTeamCardMotion}
          />
      </Suspense>
      <Suspense fallback={<LandingSectionFallback label="census board" />}>
        <LandingCensusSection
          highlightsTitle={config.highlights.title || "Census & Surveys Highlights"}
          isCensusSnapshotLoading={isCensusSnapshotLoading}
          isCensusSnapshotRefreshing={isCensusSnapshotRefreshing}
          lastCensusSnapshotSyncAt={lastCensusSnapshotSyncAt}
          censusSnapshot={censusSnapshot}
          livePublicActivities={livePublicActivities}
          activeCensusActivityId={activeCensusActivityId}
          toggleCensusModal={toggleCensusModal}
          formatCount={formatCount}
          formatPercent={formatPercent}
          formatTimeOrFallback={formatTimeOrFallback}
          clampPercent={clampPercent}
        />
      </Suspense>
      {activeCensusGroup &&
      activeCensusActivity &&
      typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                onClick={closeCensusModal}
                className="landing-census-modal-backdrop fixed inset-0 z-[2290] bg-slate-950/34"
                data-state={isCensusModalClosing ? "closing" : "open"}
                aria-label={`Close ${activeCensusActivity.name} live board backdrop`}
              />

              <div className="fixed inset-0 z-[2300] grid place-items-center p-3 sm:p-5 lg:p-8 pointer-events-none">
                <article
                  ref={censusModalRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`landing-census-board-${activeCensusActivity.id}`}
                  tabIndex={-1}
                  className={`landing-census-modal-panel pointer-events-auto relative w-full max-w-[1080px] max-h-[calc(100vh-2rem)] sm:max-h-[84vh] lg:max-h-[78vh] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[24px] border border-zinc-200/90 bg-white/95 shadow-[0_14px_34px_rgba(15,23,42,0.16)] focus:outline-none ${activeCensusIsCensus ? "dark:border-blue-400/22 dark:bg-[linear-gradient(180deg,rgba(5,14,30,0.97),rgba(7,18,34,0.95))]" : "dark:border-teal-400/22 dark:bg-[linear-gradient(180deg,rgba(5,16,15,0.97),rgba(7,20,18,0.95))]"}`}
                  style={{ scrollbarGutter: "stable" }}
                  data-state={isCensusModalClosing ? "closing" : "open"}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1.5 ${activeCensusGroup.key === "census" ? "bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500" : "bg-gradient-to-r from-teal-500 via-emerald-500 to-lime-500"}`}
                  />

                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-20 left-10 h-36 w-36 rounded-full bg-blue-400/8 blur-2xl" />
                    <div className="absolute bottom-0 right-0 h-44 w-44 rounded-full bg-teal-400/8 blur-2xl" />
                  </div>

                  <div className="relative">
                    <div
                      className={`sticky top-0 z-20 border-b border-zinc-200/85 bg-white pl-4 pr-6 pb-3 pt-4 shadow-[0_10px_22px_rgba(15,23,42,0.05)] sm:pl-5 sm:pr-7 sm:pb-4 sm:pt-5 lg:pl-5 lg:pr-7 lg:pb-4 lg:pt-5 ${activeCensusIsCensus ? "dark:border-blue-400/14 dark:bg-[linear-gradient(180deg,rgba(4,12,28,0.98),rgba(6,16,32,0.92))]" : "dark:border-teal-400/14 dark:bg-[linear-gradient(180deg,rgba(4,15,14,0.98),rgba(6,18,17,0.92))]"}`}
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 max-w-3xl">
                          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-psa-blue">
                            {activeCensusActivity.hasActiveCycle
                              ? `Live ${activeCensusGroup.title} Board`
                              : `${activeCensusGroup.title} Read-Only Board`}
                          </p>
                          <h3
                            id={`landing-census-board-${activeCensusActivity.id}`}
                            className="mt-2 font-serif text-2xl sm:text-3xl text-psa-navy dark:text-white leading-tight"
                          >
                            {activeCensusActivity.name}
                          </h3>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            {[
                              activeCensusActivity.acronym,
                              activeCensusActivity.activityType,
                              activeCensusActivity.coverage ||
                                "Aurora Province",
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${ACTIVITY_STATUS_STYLES[activeCensusActivity.status]}`}
                          >
                            {activeCensusActivity.status}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCensusModuleNavigation(activeCensusActivity)
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-blue-300/80 dark:border-blue-300/38 bg-blue-50/90 dark:bg-[rgba(30,64,175,0.42)] px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-white hover:bg-blue-100 dark:hover:bg-[rgba(37,99,235,0.54)] shadow-sm dark:shadow-[0_12px_24px_rgba(37,99,235,0.24)] dark:[text-shadow:0_1px_1px_rgba(2,6,23,0.55)] backdrop-blur-sm transition-colors"
                          >
                            Open in Staff Module{" "}
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={closeCensusModal}
                            className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-zinc-200/80 dark:border-zinc-700/70 bg-white/90 dark:bg-zinc-950/70 text-slate-500 dark:text-slate-300 hover:text-psa-blue transition-colors"
                            aria-label={`Close ${activeCensusActivity.name} live board`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 pt-3 sm:p-5 sm:pt-4 lg:p-5 lg:pt-4">
                      <div className="grid gap-3.5 lg:grid-cols-12">
                        <div className="lg:col-span-7 space-y-3.5">
                          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.45fr)_repeat(3,minmax(0,1fr))]">
                            <div
                              className={`rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2.5 ${modalGlassTone}`}
                            >
                              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 font-semibold">
                                Focal Person
                              </p>
                              <p
                                className="mt-1.5 whitespace-nowrap text-[11px] font-bold leading-snug tracking-[-0.02em] text-slate-900 dark:text-white sm:text-[12px]"
                                title={
                                  activeCensusActivity.assignedTo ||
                                  "No focal person"
                                }
                              >
                                {activeCensusActivity.assignedTo ||
                                  "No focal person"}
                              </p>
                            </div>
                            <div
                              className={`rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2.5 ${modalGlassTone}`}
                            >
                              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 font-semibold">
                                Frequency
                              </p>
                              <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                                {activeCensusActivity.frequency}
                              </p>
                            </div>
                            <div
                              className={`rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2.5 ${modalGlassTone}`}
                            >
                              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 font-semibold">
                                Cycle
                              </p>
                              <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                                {activeCensusActivity.cycleCode ||
                                  "No cycle yet"}
                              </p>
                            </div>
                            <div
                              className={`rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2.5 ${modalGlassTone}`}
                            >
                              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 font-semibold">
                                Last Updated
                              </p>
                              <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                                {formatDateOrFallback(
                                  activeCensusActivity.lastUpdated,
                                  "No update yet",
                                )}
                              </p>
                            </div>
                          </div>

                          {activeCensusActivity.hasActiveCycle ? (
                            <>
                              <div
                                className={`rounded-[20px] border border-zinc-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(239,246,255,0.95))] px-3.5 py-3.5 sm:px-4 ${activeCensusIsCensus ? "dark:border-blue-400/18 dark:bg-[linear-gradient(145deg,rgba(8,18,38,0.70),rgba(8,28,48,0.52))]" : "dark:border-teal-400/18 dark:bg-[linear-gradient(145deg,rgba(7,22,21,0.70),rgba(8,28,24,0.52))]"}`}
                              >
                                <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 font-semibold">
                                      Overall Progress
                                    </p>
                                    <p className="mt-1.5 text-3xl font-black text-slate-900 dark:text-white">
                                      {formatPercent(
                                        activeCensusActivity.progress,
                                      )}
                                    </p>
                                  </div>
                                  <div>
                                    <div className="flex items-center justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                                      <span className="inline-flex items-center gap-2 font-semibold uppercase tracking-[0.12em]">
                                        Completed / Target
                                        {showActiveProgressAnimation ? (
                                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-emerald-50/90 px-2 py-0.5 text-[9px] font-bold tracking-[0.16em] text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                            <span className="landing-progress-live-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            LIVE
                                          </span>
                                        ) : null}
                                      </span>
                                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                                        {activeCensusActivity.targetCount > 0
                                          ? `${formatCount(activeCensusActivity.completedCount)} / ${formatCount(activeCensusActivity.targetCount)}`
                                          : "No target yet"}
                                      </span>
                                    </div>
                                    <div className="mt-2 h-2.5 rounded-full bg-slate-200/90 dark:bg-zinc-800 overflow-hidden">
                                      <div
                                        className={`relative h-full rounded-full ${activeCensusGroup.key === "census" ? "bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500" : "bg-gradient-to-r from-teal-500 via-emerald-500 to-lime-500"} transition-[width] duration-700 ease-out ${showActiveProgressAnimation ? "landing-progress-fill-active" : ""}`}
                                        style={{
                                          width: `${Math.max(clampPercent(activeCensusActivity.progress), activeCensusActivity.progress > 0 ? 6 : 0)}%`,
                                        }}
                                      >
                                        {showActiveProgressAnimation ? (
                                          <span className="landing-progress-sheen absolute inset-y-0 w-16 rounded-full" />
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                  <div
                                    className={`rounded-2xl border border-zinc-200/75 bg-white/90 px-3 py-2.5 ${modalChipTone}`}
                                  >
                                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 font-semibold">
                                      Current Phase
                                    </p>
                                    <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                                      {activeCensusActivity.currentPhase}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <Suspense
                                fallback={
                                  <div className="rounded-[20px] border border-zinc-200/80 bg-white/90 px-4 py-10 text-center text-sm font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300">
                                    Loading live map...
                                  </div>
                                }
                              >
                                <AuroraMunicipalityHeatMap
                                  stats={activeCensusActivity.municipalityStats}
                                  compact
                                  showLegend
                                  showLabels
                                  showStatusAnimation={enableLandingMapAnimation}
                                  className="rounded-[20px]"
                                />
                              </Suspense>
                            </>
                          ) : (
                            <>
                              <div
                                className={`rounded-[20px] border border-dashed border-zinc-300/80 bg-slate-50/90 px-3.5 py-3.5 sm:px-4 ${modalSoftGlassTone}`}
                              >
                                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 font-semibold">
                                  No live cycle yet
                                </p>
                                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                                  This activity is visible here for monitoring,
                                  but its live cycle has not been configured yet
                                  in the protected Census &amp; Surveys module.
                                </p>
                              </div>

                              <Suspense
                                fallback={
                                  <div className="rounded-[20px] border border-zinc-200/80 bg-white/90 px-4 py-10 text-center text-sm font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300">
                                    Loading live map...
                                  </div>
                                }
                              >
                                <AuroraMunicipalityHeatMap
                                  stats={[]}
                                  compact
                                  showLegend
                                  showLabels
                                  showStatusAnimation={enableLandingMapAnimation}
                                  className="rounded-[20px]"
                                />
                              </Suspense>
                            </>
                          )}
                        </div>

                        <div className="lg:col-span-5 space-y-3.5">
                          <div
                            className={`rounded-[20px] border border-zinc-200/80 bg-white/82 px-3.5 py-3.5 sm:px-4 ${modalGlassTone}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 font-semibold">
                                  Municipality Watchlist
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  Lowest output areas at a glance
                                </p>
                              </div>
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                {
                                  activeCensusMunicipalityRows.filter(
                                    (row) => row.targetCount > 0,
                                  ).length
                                }{" "}
                                with targets
                              </span>
                            </div>

                            {lowOutputMunicipalities.length > 0 &&
                            hasUnderperformingMunicipality ? (
                              <div className="mt-3 space-y-2">
                                {lowOutputMunicipalities.map((row) => (
                                  <div
                                    key={`${activeCensusActivity.id}-${row.municipality}`}
                                    className="rounded-xl border border-amber-200/80 dark:border-amber-400/28 bg-amber-50/85 dark:bg-[linear-gradient(145deg,rgba(64,40,8,0.48),rgba(39,27,6,0.30))] dark:backdrop-blur-sm px-3 py-2.5"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900 dark:text-amber-50">
                                          {row.municipality}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-slate-600 dark:text-amber-100/90">
                                          {formatCount(row.completedCount)} /{" "}
                                          {formatCount(row.targetCount)}{" "}
                                          completed
                                        </p>
                                      </div>
                                      <span className="inline-flex items-center rounded-full border border-amber-300/80 dark:border-amber-300/32 bg-white/80 dark:bg-[linear-gradient(145deg,rgba(90,58,10,0.94),rgba(58,38,7,0.88))] px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-50 whitespace-nowrap shadow-sm dark:shadow-[0_8px_18px_rgba(245,158,11,0.20)]">
                                        {formatPercent(row.progress)}
                                      </span>
                                    </div>
                                    <div className="mt-2 h-1.5 rounded-full bg-amber-100/90 dark:bg-white/10 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                                        style={{
                                          width: `${Math.max(row.progress, row.progress > 0 ? 6 : 0)}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : activeCensusMunicipalityRows.some(
                                (row) => row.targetCount > 0,
                              ) ? (
                              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                                All municipalities with targets are currently at
                                100% completion.
                              </p>
                            ) : (
                              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                                No municipality targets are configured yet for
                                this activity.
                              </p>
                            )}
                          </div>

                          <div
                            className={`rounded-[20px] border border-zinc-200/80 bg-white/82 px-3.5 py-3.5 sm:px-4 ${modalGlassTone}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 font-semibold">
                                  No Target Municipalities
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  Aurora areas still waiting for assignment
                                </p>
                              </div>
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                {formatCount(noTargetMunicipalities.length)}{" "}
                                unassigned
                              </span>
                            </div>

                            {noTargetMunicipalities.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {noTargetMunicipalities.map((row) => (
                                  <span
                                    key={`${activeCensusActivity.id}-${row.municipality}-no-target`}
                                    className="inline-flex items-center rounded-full border border-zinc-200/80 dark:border-zinc-700/70 bg-zinc-100/90 dark:bg-zinc-900/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                                  >
                                    {row.municipality}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                                All Aurora municipalities already have targets
                                for this activity.
                              </p>
                            )}
                          </div>

                          <div
                            className={`rounded-[20px] border border-blue-200/80 bg-blue-50/72 px-3.5 py-3.5 sm:px-4 ${modalSoftGlassTone}`}
                          >
                            <p className="text-[10px] uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300 font-semibold">
                              Staff Module
                            </p>
                            <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                              This landing-page board is read only. Editing
                              stays inside the protected Census &amp; Surveys
                              module after login.
                            </p>
                            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                              Use the header action above when you need to
                              continue inside the protected module.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </>,
            document.body,
          )
        : null}

      <section
        id="services"
        className="public-container public-section-y-compact"
      >
        <RevealSection>
          <div className="rounded-3xl border border-psa-line dark:border-zinc-800 bg-white dark:bg-[#0b0b0b] p-6 sm:p-8 lg:p-10 public-shadow-medium">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-psa-blue font-semibold">
                  Core Services
                </p>
                <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-psa-navy">
                  Institutional Programs and Support
                </h2>
              </div>
              <PublicButton
                onClick={handleLoginNavigation}
                variant="secondary"
                size="md"
                className="self-start sm:self-auto"
              >
                Access Internal Modules <ChevronRight className="w-4 h-4" />
              </PublicButton>
            </div>

            <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
              {coreServices.map((item, idx) => (
                <RevealSection
                  key={item.title}
                  delay={idx * 90}
                  className="psa-elevate rounded-2xl border border-psa-line dark:border-zinc-800 bg-psa-surfaceAlt dark:bg-[#101010] p-5 sm:p-6 hover:bg-white dark:hover:bg-zinc-900"
                >
                  <div className="w-10 h-10 rounded-lg border border-psa-blue/20 dark:border-blue-300/30 bg-psa-blue/10 dark:bg-blue-500/20 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-psa-blue" />
                  </div>
                  <h3 className="mt-4 font-semibold text-lg text-psa-navy">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {item.description}
                  </p>
                </RevealSection>
              ))}
            </div>
          </div>
        </RevealSection>
      </section>

      <section id="advisories" className="public-container public-section-y">
        <RevealSection>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-psa-blue font-semibold">
                Latest Advisories
              </p>
              <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-psa-navy">
                Updates and Schedules
              </h2>
            </div>
            <button className="inline-flex self-start sm:self-auto items-center gap-2 text-sm font-semibold text-psa-blue hover:text-psa-navy dark:hover:text-blue-300">
              View all updates <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 sm:gap-5">
            {advisories.map((item, idx) => (
              <RevealSection
                key={item.title}
                delay={idx * 100}
                className="psa-elevate rounded-2xl border border-psa-line dark:border-zinc-800 bg-white dark:bg-[#101010] p-5 sm:p-6 shadow-[0_12px_28px_rgba(0,51,102,0.06)]"
              >
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300 font-semibold">
                  {item.category}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-psa-navy leading-snug">
                  {item.title}
                </h3>
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-psa-blue" /> {item.date}
                </p>
                <button className="psa-focus-ring mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-psa-blue hover:text-psa-navy dark:hover:text-blue-300 rounded-md">
                  Read advisory <ChevronRight className="w-4 h-4" />
                </button>
              </RevealSection>
            ))}
          </div>
        </RevealSection>
      </section>

      <section className="public-container public-section-bottom">
        <RevealSection>
          <div className="rounded-2xl border border-psa-line dark:border-zinc-800 bg-gradient-to-r from-white via-psa-surfaceAlt to-white dark:from-[#0a0a0a] dark:via-[#111111] dark:to-[#0a0a0a] px-5 sm:px-7 py-5 sm:py-6 grid md:grid-cols-[auto_1fr_auto] items-center gap-4">
            <p className="text-sm font-semibold text-psa-navy">Quick Access:</p>
            <div className="flex flex-wrap gap-2.5">
              <PublicChip href="https://psa.gov.ph">
                PSA National Website
              </PublicChip>
              <PublicChip href="https://openstat.psa.gov.ph">
                OpenSTAT Portal
              </PublicChip>
              <PublicChip
                onClick={handleLoginNavigation}
                className="rounded-full"
              >
                Staff Sign-In
              </PublicChip>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-2">
              <Phone className="w-4 h-4 text-psa-blue" /> (042) 724-4389
            </p>
          </div>
        </RevealSection>
      </section>

      <PublicFooter
        footer={config.footer}
        rightCaption="Official PSA Provincial Portal"
        leadText="Providing official statistics and civil registration services for informed decisions and public welfare."
      />
    </div>
  );
};
