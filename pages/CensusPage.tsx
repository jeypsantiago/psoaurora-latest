import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Calendar,
  ChevronDown,
  Clock,
  ClipboardList,
  Edit2,
  ExternalLink,
  Eye,
  Filter,
  FolderPlus,
  Grid3X3,
  List,
  Lock,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Modal } from '../components/ui';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useDialog } from '../DialogContext';
import { useRbac } from '../RbacContext';
import { useToast } from '../ToastContext';
import { useUsers } from '../UserContext';
import type {
  ActivityFrequency,
  ActivityStatus,
  ActivityType,
  CensusActivity,
  MunicipalityCycleStat,
} from '../services/censusData';
import {
  AURORA_MUNICIPALITIES,
  ALL_FREQUENCIES,
  ALL_STATUSES,
  ALL_TYPES,
  closeActiveCensusSurveyCycle,
  fetchCensusActivities,
  getFrequencyBgClass,
  getFrequencyOrder,
  getStatusBgClass,
  getStatusColor,
  getStatusOrder,
  getTypeBgClass,
  previewCycleMetrics,
  refreshCensusActivities,
  saveCensusSurveyCycle,
  saveCensusSurveyMaster,
} from '../services/censusData';
import { readStorageString, setStorageItem } from '../services/storage';

const AuroraMunicipalityHeatMap = lazy(() =>
  import('../components/census/AuroraMunicipalityHeatMap').then((module) => ({
    default: module.AuroraMunicipalityHeatMap,
  })),
);
const CensusStatusDistributionChart = lazy(() =>
  import('../components/census/CensusCharts').then((module) => ({
    default: module.CensusStatusDistributionChart,
  })),
);

const StaggerIn: React.FC<{ children: React.ReactNode; index: number; className?: string }> = ({
  children,
  index,
  className = '',
}) => (
  <div className={`opacity-0 animate-reveal ${className}`} style={{ animationDelay: `${index * 60}ms` }}>
    {children}
  </div>
);

const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
  const [display, setDisplay] = useState(0);
  const previousValue = useRef(0);

  useEffect(() => {
    const start = previousValue.current;
    previousValue.current = value;

    if (start === value) {
      setDisplay(value);
      return;
    }

    const duration = 600;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (value - start) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{display}</>;
};

const ProgressBar: React.FC<{ value: number; status: ActivityStatus; size?: 'sm' | 'md' }> = ({ value, status, size = 'sm' }) => {
  const color = getStatusColor(status);
  return (
    <div className={`w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
};

const MapLoadingFallback: React.FC = () => (
  <div className="h-[320px] rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 p-5 flex items-center justify-center">
    <div className="inline-flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-[12px] font-semibold text-zinc-500 dark:text-zinc-300 shadow-sm">
      <span className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      Loading municipality map...
    </div>
  </div>
);

interface FilterDropdownProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${open ? 'z-[1410]' : 'z-10'}`}>
      <button
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all"
      >
        <span className="text-zinc-500 dark:text-zinc-400">{label}:</span>
        <span className="text-zinc-900 dark:text-white">{value || 'All'}</span>
        <ChevronDown size={14} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1405]" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 w-56 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-[1410] p-1.5 max-h-64 overflow-y-auto">
            <button
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${!value ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
            >
              All
            </button>
            {options.map((option) => (
              <button
                key={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${value === option ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

interface DetailModalProps {
  activity: CensusActivity | null;
  canEdit: boolean;
  onClose: () => void;
  onEditMaster: (activity: CensusActivity) => void;
  onEditCycle: (activity: CensusActivity) => void;
  onCloseCycle: (activity: CensusActivity) => void;
}

const formatDate = (dateValue: string): string => {
  if (!dateValue) return '--';
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const DetailModal: React.FC<DetailModalProps> = ({
  activity,
  canEdit,
  onClose,
  onEditMaster,
  onEditCycle,
  onCloseCycle,
}) => {
  if (!activity) return null;

  return (
    <Modal isOpen={!!activity} onClose={onClose} title="Activity Details" maxWidth="max-w-3xl">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${getStatusBgClass(activity.status)}`}>
                {activity.status}
              </span>
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${getFrequencyBgClass(activity.frequency)}`}>
                {activity.frequency}
              </span>
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${getTypeBgClass(activity.activityType)}`}>
                {activity.activityType}
              </span>
            </div>
            <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white leading-tight">{activity.name}</h2>
            <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">{activity.acronym}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-black text-zinc-900 dark:text-white">{activity.progress}%</div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Progress</div>
          </div>
        </div>

        <ProgressBar value={activity.progress} status={activity.status} size="md" />

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
            <div className="flex items-center gap-2 mb-1">
              <FolderPlus size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cycle</span>
            </div>
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">{activity.cycleCode || 'No Active Cycle'}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Deadline</span>
            </div>
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">{formatDate(activity.deadline)}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
            <div className="flex items-center gap-2 mb-1">
              <User size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Focal Person</span>
            </div>
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">{activity.assignedTo || 'No focal person'}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Current Phase</span>
            </div>
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">{activity.currentPhase}</p>
          </div>
        </div>

        {activity.hasActiveCycle ? (
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cycle Performance (Consolidated)</span>
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{activity.completedCount} / {activity.targetCount}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-zinc-600 dark:text-zinc-300">
              <div>Start: <span className="font-semibold text-zinc-900 dark:text-white">{formatDate(activity.startDate)}</span></div>
              <div>Updated By: <span className="font-semibold text-zinc-900 dark:text-white">{activity.updatedBy || 'System'}</span></div>
            </div>

            <Suspense fallback={<MapLoadingFallback />}>
              <AuroraMunicipalityHeatMap
                stats={activity.municipalityStats}
                compact
                showLegend
                showLabels
                showValues
              />
            </Suspense>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-start gap-2">
            <Lock size={14} className="text-amber-600 dark:text-amber-400 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              No active cycle for this activity yet. Start an active cycle to track target, completion, and status automatically.
            </p>
          </div>
        )}

        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-2 mb-1.5">
            <MapPin size={14} className="text-zinc-400" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Coverage</span>
          </div>
          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{activity.coverage || 'Aurora Province'}</p>
        </div>

        {!!activity.notes && (
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
            <div className="flex items-center gap-2 mb-1.5">
              <ClipboardList size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Notes</span>
            </div>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{activity.notes}</p>
          </div>
        )}

        {!!activity.source && (
          <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10">
            <div className="flex items-center gap-2 mb-1.5">
              <ExternalLink size={14} className="text-blue-500" />
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Source</span>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{activity.source}</p>
          </div>
        )}

        {!!activity.remarks && (
          <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10">
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed italic">{activity.remarks}</p>
          </div>
        )}

        {canEdit && (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-9" onClick={() => onEditMaster(activity)}>
              <Edit2 size={13} className="mr-1.5" />
              Edit Activity
            </Button>
            <Button variant="blue" className="h-9" onClick={() => onEditCycle(activity)}>
              <FolderPlus size={13} className="mr-1.5" />
              {activity.hasActiveCycle ? 'Edit Active Cycle' : 'Start Active Cycle'}
            </Button>
            {activity.hasActiveCycle && (
              <Button variant="ghost" className="h-9" onClick={() => onCloseCycle(activity)}>
                Close Active Cycle
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
          <span>Last updated: {formatDate(activity.lastUpdated)}</span>
          <span>ID: {activity.masterId}</span>
        </div>
      </div>
    </Modal>
  );
};

interface MasterFormState {
  name: string;
  acronym: string;
  activityType: ActivityType;
  frequency: ActivityFrequency;
  coverage: string;
  notes: string;
  source: string;
}

interface MunicipalityCycleFormRow {
  municipality: string;
  targetCount: string;
  completedCount: string;
}

interface CycleFormState {
  cycleCode: string;
  startDate: string;
  deadline: string;
  municipalityStats: MunicipalityCycleFormRow[];
  assignedTo: string;
  remarks: string;
}

const addDays = (isoDate: string, days: number): string => {
  const parsed = new Date(isoDate);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().split('T')[0];
};

const getActorIdentity = (name?: string, email?: string): string => {
  const resolved = (name || email || '').trim();
  return resolved || 'System';
};

const emptyMasterFormState = (): MasterFormState => ({
  name: '',
  acronym: '',
  activityType: 'Survey',
  frequency: 'Monthly',
  coverage: 'Aurora Province',
  notes: '',
  source: '',
});

const emptyMunicipalityRows = (): MunicipalityCycleFormRow[] => (
  AURORA_MUNICIPALITIES.map((municipality) => ({
    municipality,
    targetCount: '0',
    completedCount: '0',
  }))
);

const municipalityRowsFromStats = (stats: MunicipalityCycleStat[]): MunicipalityCycleFormRow[] => {
  const byMunicipality = new Map(stats.map((entry) => [entry.municipality, entry]));
  return AURORA_MUNICIPALITIES.map((municipality) => {
    const stat = byMunicipality.get(municipality);
    return {
      municipality,
      targetCount: String(stat?.targetCount ?? 0),
      completedCount: String(stat?.completedCount ?? 0),
    };
  });
};

const municipalityRowsToStats = (rows: MunicipalityCycleFormRow[]): MunicipalityCycleStat[] => {
  const byMunicipality = new Map(rows.map((entry) => [entry.municipality, entry]));
  return AURORA_MUNICIPALITIES.map((municipality) => {
    const row = byMunicipality.get(municipality);
    const targetCount = Math.max(0, Math.round(Number(row?.targetCount) || 0));
    const completedCount = Math.min(Math.max(0, Math.round(Number(row?.completedCount) || 0)), targetCount);
    return {
      municipality,
      targetCount,
      completedCount,
    };
  });
};

const emptyCycleFormState = (assignee: string): CycleFormState => {
  const today = new Date().toISOString().split('T')[0];
  return {
    cycleCode: '',
    startDate: today,
    deadline: addDays(today, 90),
    municipalityStats: emptyMunicipalityRows(),
    assignedTo: assignee,
    remarks: '',
  };
};

export const CensusPage: React.FC = () => {
  const { toast } = useToast();
  const { confirm } = useDialog();
  const { can } = useRbac();
  const { currentUser } = useUsers();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsSnapshot = searchParams.toString();
  const actionParam = searchParams.get('action') || '';
  const activityParam = searchParams.get('activity') || '';
  const intentParam = searchParams.get('intent') || searchParams.get('panel') || '';

  const canEdit = can('census.edit');

  const [activities, setActivities] = useState<CensusActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFreq, setFilterFreq] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    const saved = readStorageString(STORAGE_KEYS.censusSurveysView, 'cards');
    return saved === 'table' ? 'table' : 'cards';
  });
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'frequency' | 'status' | 'progress' | 'deadline'>('frequency');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [clock, setClock] = useState(new Date());

  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);
  const [masterForm, setMasterForm] = useState<MasterFormState>(emptyMasterFormState);
  const [isMasterSaving, setIsMasterSaving] = useState(false);

  const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
  const [cycleContext, setCycleContext] = useState<CensusActivity | null>(null);
  const [cycleForm, setCycleForm] = useState<CycleFormState>(() => emptyCycleFormState(''));
  const [isCycleSaving, setIsCycleSaving] = useState(false);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) || null,
    [activities, selectedActivityId]
  );

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.censusSurveysView, viewMode);
  }, [viewMode]);

  const loadActivities = useCallback(async (force = false): Promise<CensusActivity[]> => {
    try {
      const nextData = force ? await refreshCensusActivities() : await fetchCensusActivities();
      setActivities(nextData);
      setSelectedActivityId((previous) => (previous && nextData.some((activity) => activity.id === previous) ? previous : null));
      return nextData;
    } catch (error) {
      console.error('Failed to load Census & Surveys data.', error);
      toast('error', 'Unable to load Census & Surveys data.');
      return [];
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadActivities();
      setLoading(false);
    })();
  }, [loadActivities]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadActivities(true);
    setTimeout(() => setIsRefreshing(false), 600);
  }, [loadActivities]);

  const openCreateMasterModal = useCallback(() => {
    setEditingMasterId(null);
    setMasterForm(emptyMasterFormState());
    setIsMasterModalOpen(true);
  }, []);

  useEffect(() => {
    if (actionParam !== 'add-activity') return;
    if (!canEdit) return;

    const next = new URLSearchParams(searchParamsSnapshot);
    next.delete('action');
    setSearchParams(next, { replace: true });

    openCreateMasterModal();
  }, [actionParam, canEdit, openCreateMasterModal, searchParamsSnapshot, setSearchParams]);

  const openEditMasterModal = useCallback((activity: CensusActivity) => {
    setEditingMasterId(activity.masterId);
    setMasterForm({
      name: activity.name,
      acronym: activity.acronym,
      activityType: activity.activityType,
      frequency: activity.frequency,
      coverage: activity.coverage,
      notes: activity.notes,
      source: activity.source,
    });
    setIsMasterModalOpen(true);
  }, []);

  const openCycleModal = useCallback((activity: CensusActivity) => {
    const assigneeFallback = getActorIdentity(currentUser?.name, currentUser?.email);
    setCycleContext(activity);
    if (activity.hasActiveCycle) {
      setCycleForm({
        cycleCode: activity.cycleCode,
        startDate: activity.startDate,
        deadline: activity.deadline,
        municipalityStats: municipalityRowsFromStats(activity.municipalityStats),
        assignedTo: activity.assignedTo,
        remarks: activity.remarks,
      });
    } else {
      setCycleForm(emptyCycleFormState(assigneeFallback));
    }
    setIsCycleModalOpen(true);
  }, [currentUser?.email, currentUser?.name]);

  useEffect(() => {
    if (!activityParam || loading) return;

    const next = new URLSearchParams(searchParamsSnapshot);
    next.delete('activity');
    next.delete('intent');
    next.delete('panel');

    const matchedActivity = activities.find((activity) => activity.masterId === activityParam || activity.id === activityParam);
    if (!matchedActivity) {
      setSearchParams(next, { replace: true });
      return;
    }

    if ((intentParam === 'edit-cycle' || intentParam === 'manage') && canEdit) {
      setSelectedActivityId(null);
      openCycleModal(matchedActivity);
    } else if (intentParam === 'edit-activity' && canEdit) {
      setSelectedActivityId(null);
      openEditMasterModal(matchedActivity);
    } else {
      setSelectedActivityId(matchedActivity.id);
    }

    setSearchParams(next, { replace: true });
  }, [
    activityParam,
    activities,
    canEdit,
    intentParam,
    loading,
    openCycleModal,
    openEditMasterModal,
    searchParamsSnapshot,
    setSearchParams,
  ]);

  const handleMasterSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (isMasterSaving) return;

    setIsMasterSaving(true);
    try {
      await saveCensusSurveyMaster(
        {
          name: masterForm.name,
          acronym: masterForm.acronym,
          activityType: masterForm.activityType,
          frequency: masterForm.frequency,
          coverage: masterForm.coverage,
          notes: masterForm.notes,
          source: masterForm.source,
        },
        {
          masterId: editingMasterId || undefined,
          actor: getActorIdentity(currentUser?.name, currentUser?.email),
        }
      );

      toast('success', editingMasterId ? 'Activity updated successfully.' : 'Activity added successfully.');
      setIsMasterModalOpen(false);
      await loadActivities(true);
    } catch (error: any) {
      toast('error', error?.message || 'Unable to save activity.');
    } finally {
      setIsMasterSaving(false);
    }
  }, [currentUser?.email, currentUser?.name, editingMasterId, isMasterSaving, loadActivities, masterForm, toast]);

  const cycleMunicipalityStats = useMemo(
    () => municipalityRowsToStats(cycleForm.municipalityStats),
    [cycleForm.municipalityStats]
  );

  const cycleMunicipalityTotals = useMemo(() => {
    return cycleMunicipalityStats.reduce(
      (accumulator, stat) => {
        accumulator.targetCount += stat.targetCount;
        accumulator.completedCount += stat.completedCount;
        return accumulator;
      },
      {
        targetCount: 0,
        completedCount: 0,
      }
    );
  }, [cycleMunicipalityStats]);

  const cyclePreview = useMemo(
    () => previewCycleMetrics({
      startDate: cycleForm.startDate,
      deadline: cycleForm.deadline,
      municipalityStats: cycleMunicipalityStats,
    }),
    [cycleForm.deadline, cycleForm.startDate, cycleMunicipalityStats]
  );

  const handleCycleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (isCycleSaving || !cycleContext) return;

    setIsCycleSaving(true);
    try {
      await saveCensusSurveyCycle(
        cycleContext.masterId,
        {
          cycleCode: cycleForm.cycleCode,
          startDate: cycleForm.startDate,
          deadline: cycleForm.deadline,
          municipalityStats: cycleMunicipalityStats,
          assignedTo: cycleForm.assignedTo,
          remarks: cycleForm.remarks,
        },
        {
          cycleId: cycleContext.cycleId || undefined,
          actor: getActorIdentity(currentUser?.name, currentUser?.email),
        }
      );

      const nextActivities = await loadActivities(true);
      const refreshedActivity = nextActivities.find((activity) => activity.masterId === cycleContext.masterId) || null;

      if (refreshedActivity) {
        setCycleContext(refreshedActivity);
        setSelectedActivityId(refreshedActivity.id);
        setCycleForm({
          cycleCode: refreshedActivity.cycleCode,
          startDate: refreshedActivity.startDate,
          deadline: refreshedActivity.deadline,
          municipalityStats: municipalityRowsFromStats(refreshedActivity.municipalityStats),
          assignedTo: refreshedActivity.assignedTo,
          remarks: refreshedActivity.remarks,
        });
      }

      toast(
        'success',
        cycleContext.hasActiveCycle
          ? 'Active cycle updated. You can continue adjusting municipality outputs.'
          : 'Active cycle started. You can continue adjusting municipality outputs.'
      );
    } catch (error: any) {
      toast('error', error?.message || 'Unable to save cycle.');
    } finally {
      setIsCycleSaving(false);
    }
  }, [currentUser?.email, currentUser?.name, cycleContext, cycleForm, cycleMunicipalityStats, isCycleSaving, loadActivities, toast]);

  const handleCloseActiveCycle = useCallback(async (activity: CensusActivity) => {
    if (!activity.hasActiveCycle) return;

    const approved = await confirm(
      `Close active cycle ${activity.cycleCode || ''} for ${activity.acronym}? You can create a new cycle after this.`.trim(),
      {
        title: 'Close Active Cycle',
        confirmLabel: 'Close Cycle',
      }
    );

    if (!approved) return;

    try {
      await closeActiveCensusSurveyCycle(activity.masterId, {
        actor: getActorIdentity(currentUser?.name, currentUser?.email),
      });
      toast('success', 'Active cycle closed.');
      await loadActivities(true);
    } catch (error: any) {
      toast('error', error?.message || 'Unable to close active cycle.');
    }
  }, [confirm, currentUser?.email, currentUser?.name, loadActivities, toast]);

  const filtered = useMemo(() => {
    let result = [...activities];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((activity) => (
        activity.name.toLowerCase().includes(query)
        || activity.acronym.toLowerCase().includes(query)
        || activity.assignedTo.toLowerCase().includes(query)
      ));
    }
    if (filterFreq) result = result.filter((activity) => activity.frequency === filterFreq);
    if (filterType) result = result.filter((activity) => activity.activityType === filterType);
    if (filterStatus) result = result.filter((activity) => activity.status === filterStatus);

    result.sort((left, right) => {
      let compare = 0;
      switch (sortField) {
        case 'name':
          compare = left.name.localeCompare(right.name);
          break;
        case 'frequency':
          compare = getFrequencyOrder(left.frequency) - getFrequencyOrder(right.frequency);
          break;
        case 'status':
          compare = getStatusOrder(left.status) - getStatusOrder(right.status);
          break;
        case 'progress':
          compare = left.progress - right.progress;
          break;
        case 'deadline': {
          const leftDeadline = left.deadline ? new Date(left.deadline).getTime() : Number.MAX_SAFE_INTEGER;
          const rightDeadline = right.deadline ? new Date(right.deadline).getTime() : Number.MAX_SAFE_INTEGER;
          compare = leftDeadline - rightDeadline;
          break;
        }
      }
      return sortDir === 'asc' ? compare : -compare;
    });

    return result;
  }, [activities, filterFreq, filterStatus, filterType, searchQuery, sortDir, sortField]);

  const stats = useMemo(() => {
    const countByStatus = (status: ActivityStatus) => activities.filter((activity) => activity.status === status).length;
    const frequencyLower = (activity: CensusActivity) => activity.frequency.toLowerCase();

    const monthly = activities.filter((activity) => frequencyLower(activity).includes('monthly')).length;
    const quarterly = activities.filter((activity) => frequencyLower(activity).includes('quarterly')).length;
    const annual = activities.filter((activity) => {
      const value = frequencyLower(activity);
      return value.includes('annual') || value.includes('every') || value.includes('biennial') || value.includes('triennial');
    }).length;

    const avgProgress = activities.length
      ? Math.round(activities.reduce((sum, activity) => sum + activity.progress, 0) / activities.length)
      : 0;

    return {
      total: activities.length,
      activeCycles: activities.filter((activity) => activity.hasActiveCycle).length,
      monthly,
      quarterly,
      annual,
      census: activities.filter((activity) => activity.activityType.toLowerCase().includes('census')).length,
      fieldwork: countByStatus('Fieldwork'),
      processing: countByStatus('Processing'),
      completed: countByStatus('Completed'),
      upcoming: countByStatus('Upcoming'),
      delayed: countByStatus('Delayed'),
      avgProgress,
    };
  }, [activities]);

  const pieData = useMemo(
    () => [
      { name: 'Fieldwork', value: stats.fieldwork, color: '#10b981' },
      { name: 'Processing', value: stats.processing, color: '#3b82f6' },
      { name: 'Completed', value: stats.completed, color: '#6366f1' },
      { name: 'Upcoming', value: stats.upcoming, color: '#71717a' },
      { name: 'Delayed', value: stats.delayed, color: '#f59e0b' },
    ].filter((item) => item.value > 0),
    [stats]
  );

  const hasFilters = !!(searchQuery || filterFreq || filterType || filterStatus);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterFreq('');
    setFilterType('');
    setFilterStatus('');
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDir('asc');
  };

  const statCards = [
    {
      label: 'Total Activities',
      value: stats.total,
      icon: ClipboardList,
      iconWrapperClass: 'bg-blue-50 dark:bg-blue-500/10',
      iconClass: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Active Cycles',
      value: stats.activeCycles,
      icon: FolderPlus,
      iconWrapperClass: 'bg-violet-50 dark:bg-violet-500/10',
      iconClass: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'Quarterly Items',
      value: stats.quarterly,
      icon: BarChart3,
      iconWrapperClass: 'bg-cyan-50 dark:bg-cyan-500/10',
      iconClass: 'text-cyan-600 dark:text-cyan-400',
    },
    {
      label: 'Active Fieldwork',
      value: stats.fieldwork,
      icon: Target,
      iconWrapperClass: 'bg-emerald-50 dark:bg-emerald-500/10',
      iconClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Avg. Progress',
      value: stats.avgProgress,
      suffix: '%',
      icon: TrendingUp,
      iconWrapperClass: 'bg-amber-50 dark:bg-amber-500/10',
      iconClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Completed',
      value: stats.completed,
      icon: Activity,
      iconWrapperClass: 'bg-indigo-50 dark:bg-indigo-500/10',
      iconClass: 'text-indigo-600 dark:text-indigo-400',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="inline-flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-[12px] font-semibold text-zinc-500 dark:text-zinc-300 shadow-sm">
          <span className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          Loading Census & Surveys data...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <StaggerIn index={0}>
        <div className="relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-white via-zinc-50 to-indigo-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-indigo-950/30 p-5 sm:p-6">
          <div className="absolute -top-20 -right-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-12 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between relative">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                Census & Surveys
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
                Track activity masters and manage one active cycle per Census & Surveys item with municipality-level target/completion tracking and automatic consolidated status.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                <Badge variant="info" className="!px-2.5 !py-1">Cycle Tracker</Badge>
                <span className="inline-flex items-center gap-1.5"><Clock size={12} /> {clock.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="inline-flex items-center gap-1.5"><ClipboardList size={12} /> {stats.total} Activities</span>
                <span className="inline-flex items-center gap-1.5"><FolderPlus size={12} /> {stats.activeCycles} Active Cycles</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap lg:justify-end">
              <div className="inline-flex items-center rounded-xl border border-zinc-200 dark:border-zinc-800 p-1 bg-zinc-50 dark:bg-zinc-900">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
                  title="Card View"
                >
                  <Grid3X3 size={16} />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
                  title="Table View"
                >
                  <List size={16} />
                </button>
              </div>

              {canEdit && (
                <Button variant="outline" className="h-10" onClick={openCreateMasterModal}>
                  <Plus size={14} className="mr-2" />
                  Add Activity
                </Button>
              )}

              <Button variant="blue" className="h-10" onClick={handleRefresh}>
                <RefreshCw size={14} className={`mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </StaggerIn>

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        {statCards.map((card, index) => (
          <StaggerIn key={card.label} index={index + 1}>
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{card.label}</p>
                <div className={`h-8 w-8 rounded-xl ${card.iconWrapperClass} flex items-center justify-center ${card.iconClass}`}>
                  <card.icon size={16} />
                </div>
              </div>
              <p className="mt-3 text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                <AnimatedNumber value={card.value} />{card.suffix || ''}
              </p>
            </div>
          </StaggerIn>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 space-y-4">
          <StaggerIn index={7} className="relative z-[1400]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input
                  type="text"
                  placeholder="Search activities, acronyms, focal persons..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>

              <FilterDropdown label="Frequency" value={filterFreq} options={ALL_FREQUENCIES} onChange={setFilterFreq} />
              <FilterDropdown label="Type" value={filterType} options={ALL_TYPES} onChange={setFilterType} />
              <FilterDropdown label="Status" value={filterStatus} options={ALL_STATUSES} onChange={setFilterStatus} />

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border border-transparent hover:border-red-200 dark:hover:border-red-500/20 transition-all"
                >
                  <X size={14} /> Clear
                </button>
              )}

              <div className="ml-auto text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                {filtered.length} of {activities.length} activities
              </div>
            </div>
          </StaggerIn>

          {viewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((activity, index) => (
                <StaggerIn key={activity.id} index={index + 8}>
                  <button
                    onClick={() => setSelectedActivityId(activity.id)}
                    className="w-full text-left p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${getStatusBgClass(activity.status)}`}>
                          {activity.status}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${getFrequencyBgClass(activity.frequency)}`}>
                          {activity.frequency}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-zinc-400 group-hover:text-blue-500 transition-colors">
                        <Eye size={14} />
                      </div>
                    </div>

                    <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white leading-tight mb-0.5 line-clamp-2">
                      {activity.name}
                    </h3>
                    <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-3">{activity.acronym}</p>

                    <div className="mb-3 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${getTypeBgClass(activity.activityType)}`}>
                        {activity.activityType}
                      </span>
                      {!activity.hasActiveCycle && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          No Active Cycle
                        </span>
                      )}
                    </div>

                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Progress</span>
                        <span className="text-xs font-extrabold text-zinc-900 dark:text-white">{activity.progress}%</span>
                      </div>
                      <ProgressBar value={activity.progress} status={activity.status} />
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 min-w-0">
                        <User size={12} />
                        <span className="font-semibold break-words">{activity.assignedTo || 'No focal person'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                        <Calendar size={12} />
                        <span className="font-semibold">{activity.deadline ? formatDate(activity.deadline) : '--'}</span>
                      </div>
                    </div>
                  </button>
                </StaggerIn>
              ))}

              {filtered.length === 0 && (
                <div className="col-span-full py-12 text-center">
                  <Filter size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
                  <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No activities match your filters</p>
                  <button onClick={clearFilters} className="mt-2 text-xs font-semibold text-blue-600 hover:underline">Clear all filters</button>
                </div>
              )}
            </div>
          )}

          {viewMode === 'table' && (
            <StaggerIn index={8}>
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        {[
                          { key: 'name' as const, label: 'Activity' },
                          { key: 'frequency' as const, label: 'Frequency' },
                          { key: 'status' as const, label: 'Status' },
                          { key: 'progress' as const, label: 'Progress' },
                          { key: 'deadline' as const, label: 'Deadline' },
                        ].map((column) => (
                          <th
                            key={column.key}
                            onClick={() => toggleSort(column.key)}
                            className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors select-none"
                          >
                            <span className="inline-flex items-center gap-1">
                              {column.label}
                              {sortField === column.key && (
                                <ChevronDown size={12} className={`transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`} />
                              )}
                            </span>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 min-w-[220px]">Focal Person</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Cycle</th>
                        <th className="px-4 py-3 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {filtered.map((activity) => (
                        <tr
                          key={activity.id}
                          onClick={() => setSelectedActivityId(activity.id)}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-bold text-zinc-900 dark:text-white">{activity.name}</div>
                            <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2 mt-0.5">
                              {activity.acronym}
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${getTypeBgClass(activity.activityType)}`}>
                                {activity.activityType}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${getFrequencyBgClass(activity.frequency)}`}>
                              {activity.frequency}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${getStatusBgClass(activity.status)}`}>
                              {activity.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 min-w-[120px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <ProgressBar value={activity.progress} status={activity.status} />
                              </div>
                              <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 w-8 text-right">{activity.progress}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 font-semibold whitespace-nowrap">
                            {activity.deadline ? formatDate(activity.deadline) : '--'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-[8px] font-bold text-blue-600 dark:text-blue-400">
                                {activity.assignedTo
                                  .split(' ')
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((part) => part[0])
                                  .join('') || 'NA'}
                              </div>
                              <span className="text-zinc-600 dark:text-zinc-400 font-medium" title={activity.assignedTo || 'No focal person'}>
                                {activity.assignedTo || 'No focal person'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 font-semibold whitespace-nowrap">
                            {activity.cycleCode || '--'}
                          </td>
                          <td className="px-4 py-3">
                            <ArrowUpRight size={14} className="text-zinc-400" />
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">
                            No activities match your filters
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </StaggerIn>
          )}
        </div>

        <div className="xl:col-span-4 space-y-4">
          <StaggerIn index={8}>
            <Card title="Status Distribution" description="Current status breakdown across all activities">
              <Suspense fallback={<div className="h-52 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />}>
                <CensusStatusDistributionChart pieData={pieData} />
              </Suspense>
              <div className="space-y-2 mt-2">
                {pieData.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => setFilterStatus(filterStatus === item.name ? '' : item.name)}
                    className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-colors ${filterStatus === item.name
                      ? 'border-blue-300 dark:border-blue-500/40 bg-blue-50/50 dark:bg-blue-500/5'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{item.name}</span>
                    </div>
                    <Badge variant={item.name === 'Delayed' ? 'warning' : item.name === 'Completed' ? 'success' : 'info'}>
                      {item.value}
                    </Badge>
                  </button>
                ))}
              </div>
            </Card>
          </StaggerIn>

          <StaggerIn index={9}>
            <Card title="By Frequency" description="Activity count per collection cadence">
              <div className="space-y-3">
                {[
                  { name: 'Monthly', count: stats.monthly, color: '#8b5cf6' },
                  { name: 'Quarterly', count: stats.quarterly, color: '#06b6d4' },
                  { name: 'Annual+', count: stats.annual, color: '#f97316' },
                  { name: 'Census', count: stats.census, color: '#f43f5e' },
                ].map((item) => (
                  <div key={item.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{item.name}</span>
                      <span className="text-xs font-extrabold text-zinc-900 dark:text-white">{item.count}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${stats.total ? (item.count / stats.total) * 100 : 0}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </StaggerIn>

          <StaggerIn index={10}>
            <Card title="Quick Summary" description="Live operational snapshot">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Active Fieldwork</span>
                  </div>
                  <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400">{stats.fieldwork}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">In Processing</span>
                  </div>
                  <span className="text-sm font-extrabold text-blue-700 dark:text-blue-400">{stats.processing}</span>
                </div>

                {stats.delayed > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Delayed</span>
                    </div>
                    <span className="text-sm font-extrabold text-amber-700 dark:text-amber-400">{stats.delayed}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Overall Progress</span>
                    <span className="text-xs font-extrabold text-zinc-900 dark:text-white">{stats.avgProgress}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700"
                      style={{ width: `${stats.avgProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>
          </StaggerIn>
        </div>
      </div>

      <DetailModal
        activity={selectedActivity}
        canEdit={canEdit}
        onClose={() => setSelectedActivityId(null)}
        onEditMaster={(activity) => {
          setSelectedActivityId(null);
          openEditMasterModal(activity);
        }}
        onEditCycle={(activity) => {
          setSelectedActivityId(null);
          openCycleModal(activity);
        }}
        onCloseCycle={handleCloseActiveCycle}
      />

      <Modal
        isOpen={isMasterModalOpen}
        onClose={() => setIsMasterModalOpen(false)}
        title={editingMasterId ? 'Edit Activity' : 'Add Activity'}
        maxWidth="max-w-3xl"
        footer={(
          <>
            <Button variant="outline" onClick={() => setIsMasterModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="census-master-form" variant="blue" disabled={isMasterSaving}>
              {isMasterSaving ? 'Saving...' : (editingMasterId ? 'Save Changes' : 'Create Activity')}
            </Button>
          </>
        )}
      >
        <form id="census-master-form" onSubmit={handleMasterSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Activity Name *</label>
              <input
                required
                value={masterForm.name}
                onChange={(event) => setMasterForm((current) => ({ ...current, name: event.target.value }))}
                className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
                placeholder="Enter activity name"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Acronym</label>
              <input
                value={masterForm.acronym}
                onChange={(event) => setMasterForm((current) => ({ ...current, acronym: event.target.value.toUpperCase() }))}
                className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
                placeholder="Example: MISSI"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Type *</label>
              <select
                required
                value={masterForm.activityType}
                onChange={(event) => setMasterForm((current) => ({ ...current, activityType: event.target.value as ActivityType }))}
                className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
              >
                {ALL_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Frequency *</label>
              <select
                required
                value={masterForm.frequency}
                onChange={(event) => setMasterForm((current) => ({ ...current, frequency: event.target.value as ActivityFrequency }))}
                className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
              >
                {ALL_FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>{frequency}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Coverage</label>
            <input
              value={masterForm.coverage}
              onChange={(event) => setMasterForm((current) => ({ ...current, coverage: event.target.value }))}
              className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
              placeholder="Coverage area"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Source</label>
            <input
              value={masterForm.source}
              onChange={(event) => setMasterForm((current) => ({ ...current, source: event.target.value }))}
              className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
              placeholder="Reference source"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Notes</label>
            <textarea
              value={masterForm.notes}
              onChange={(event) => setMasterForm((current) => ({ ...current, notes: event.target.value }))}
              className="mt-1 w-full min-h-[96px] bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
              placeholder="Optional notes"
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isCycleModalOpen}
        onClose={() => setIsCycleModalOpen(false)}
        title={cycleContext?.hasActiveCycle ? 'Edit Active Cycle' : 'Start Active Cycle'}
        maxWidth="max-w-4xl"
        footer={(
          <>
            <p className="mr-auto text-xs text-zinc-500 dark:text-zinc-400">
              Save keeps this window open so you can review the map and continue updating municipality outputs.
            </p>
            <Button variant="outline" onClick={() => setIsCycleModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="census-cycle-form" variant="blue" disabled={isCycleSaving || !cycleContext}>
              {isCycleSaving ? 'Saving...' : (cycleContext?.hasActiveCycle ? 'Save and Continue' : 'Start and Continue')}
            </Button>
          </>
        )}
      >
        <form id="census-cycle-form" onSubmit={handleCycleSubmit} className="space-y-4">
          <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
            <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Activity</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">{cycleContext?.name || '--'}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">{cycleContext?.acronym || '--'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Cycle Code</label>
              <input
                value={cycleForm.cycleCode}
                onChange={(event) => setCycleForm((current) => ({ ...current, cycleCode: event.target.value }))}
                className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
                placeholder="Auto-generated if blank"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Focal Person *</label>
              <input
                required
                value={cycleForm.assignedTo}
                onChange={(event) => setCycleForm((current) => ({ ...current, assignedTo: event.target.value }))}
                className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
                placeholder="Enter focal person name"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Start Date *</label>
              <input
                required
                type="date"
                value={cycleForm.startDate}
                onChange={(event) => setCycleForm((current) => ({ ...current, startDate: event.target.value }))}
                className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Deadline *</label>
              <input
                required
                type="date"
                value={cycleForm.deadline}
                onChange={(event) => setCycleForm((current) => ({ ...current, deadline: event.target.value }))}
                className="mt-1 w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Municipality Target / Completed *</p>
              <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Total: {cycleMunicipalityTotals.completedCount} / {cycleMunicipalityTotals.targetCount}
              </p>
            </div>

            <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <span>Municipality</span>
              <span>Target</span>
              <span>Completed</span>
            </div>

            <div className="max-h-56 overflow-y-auto pr-1 space-y-2">
              {cycleForm.municipalityStats.map((entry) => {
                const rowTarget = Math.max(0, Math.round(Number(entry.targetCount) || 0));
                return (
                  <div key={entry.municipality} className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center rounded-lg border border-zinc-200/70 dark:border-zinc-700/70 bg-white dark:bg-zinc-900/70 px-2 py-1.5">
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">{entry.municipality}</p>
                    <input
                      min={0}
                      type="number"
                      value={entry.targetCount}
                      onChange={(event) => {
                        const rawValue = event.target.value;
                        const cleanedValue = rawValue === '' ? '' : String(Math.max(0, Math.round(Number(rawValue) || 0)));
                        setCycleForm((current) => ({
                          ...current,
                          municipalityStats: current.municipalityStats.map((row) => {
                            if (row.municipality !== entry.municipality) return row;
                            const nextTarget = Math.max(0, Math.round(Number(cleanedValue) || 0));
                            const currentCompleted = Math.max(0, Math.round(Number(row.completedCount) || 0));
                            return {
                              ...row,
                              targetCount: cleanedValue,
                              completedCount: String(Math.min(currentCompleted, nextTarget)),
                            };
                          }),
                        }));
                      }}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-xs"
                    />
                    <input
                      min={0}
                      max={rowTarget > 0 ? rowTarget : undefined}
                      type="number"
                      value={entry.completedCount}
                      onChange={(event) => {
                        const rawValue = event.target.value;
                        const cleanedValue = rawValue === '' ? '' : String(Math.max(0, Math.round(Number(rawValue) || 0)));
                        setCycleForm((current) => ({
                          ...current,
                          municipalityStats: current.municipalityStats.map((row) => {
                            if (row.municipality !== entry.municipality) return row;
                            const targetCount = Math.max(0, Math.round(Number(row.targetCount) || 0));
                            const completedCount = Math.min(Math.max(0, Math.round(Number(cleanedValue) || 0)), targetCount);
                            return {
                              ...row,
                              completedCount: String(completedCount),
                            };
                          }),
                        }));
                      }}
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-xs"
                    />
                  </div>
                );
              })}
            </div>

            <Suspense fallback={<MapLoadingFallback />}>
              <AuroraMunicipalityHeatMap
                stats={cycleMunicipalityStats}
                compact
                showLabels
                showLegend
                className="mt-3"
              />
            </Suspense>
          </div>

          <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Computed Preview</p>
            <div className="flex items-center justify-between mb-2">
              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${getStatusBgClass(cyclePreview.status)}`}>
                {cyclePreview.status}
              </span>
              <span className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">{cyclePreview.progress}%</span>
            </div>
            <ProgressBar value={cyclePreview.progress} status={cyclePreview.status} />
            <p className="mt-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              Consolidated: {cycleMunicipalityTotals.completedCount} / {cycleMunicipalityTotals.targetCount}
            </p>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">Phase: {cyclePreview.phase}</p>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Remarks</label>
            <textarea
              value={cycleForm.remarks}
              onChange={(event) => setCycleForm((current) => ({ ...current, remarks: event.target.value }))}
              className="mt-1 w-full min-h-[90px] bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm"
              placeholder="Cycle remarks"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
