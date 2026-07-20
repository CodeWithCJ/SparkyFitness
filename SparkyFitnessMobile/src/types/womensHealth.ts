import type {
  CycleMode,
  FlowLevel,
  CyclePhase,
  PredictionConfidence,
  RegularityLabel,
  SharedCycleSettings,
  SharedCycleDailyLog,
  SharedCycleTestEntry,
  SharedCycle,
  DerivedCycle,
  CycleStats,
  PredictedCycle,
  CyclePrediction,
  DayEvidence,
  PregnancyDueDateBasis,
  PregnancyStatus,
  SharedPregnancy,
  SharedKickSession,
  SharedContraction,
  Trimester,
  GestationalAge,
} from '@workspace/shared';

export type {
  CycleMode,
  FlowLevel,
  CyclePhase,
  PredictionConfidence,
  RegularityLabel,
  SharedCycleSettings,
  SharedCycleDailyLog,
  SharedCycleTestEntry,
  SharedCycle,
  DerivedCycle,
  CycleStats,
  PredictedCycle,
  CyclePrediction,
  DayEvidence,
  PregnancyDueDateBasis,
  PregnancyStatus,
  SharedPregnancy,
  SharedKickSession,
  SharedContraction,
  Trimester,
  GestationalAge,
};

export interface BumpPhoto {
  id: string;
  pregnancy_id: string;
  week: number;
  entry_date: string;
  file_path: string;
  notes: string | null;
}

export interface CycleFertilityInfo {
  estimatedOvulationDate: string | null;
  conceptionProbability: number;
  isFertile: boolean;
}

export interface CycleInsightsOverview {
  stats: CycleStats;
  accuracy: number;
  matrix: Record<string, Record<string, number>>;
  /** Map of upcoming date (YYYY-MM-DD) to the symptom names expected on that day. */
  forecast: Record<string, string[]>;
  anomalies: { key: string; severity: string; message: string }[];
  productStats: any;
  bbtSeries: { date: string; bbt: number }[];
  cycles: SharedCycle[];
}

export interface CycleOverview {
  settings: SharedCycleSettings | null;
  date: string;
  phase: CyclePhase;
  cycleDay: number | null;
  currentCycleStart: string | null;
  prediction: CyclePrediction;
  stats: CycleStats;
  log: SharedCycleDailyLog | null;
  late: { isLate: boolean; daysLate: number };
  insightKey: string;
}

export interface FertilityDetails {
  fertileWindow: string[];
  ovulationDate: string | null;
  daysUntilNextPeriod: number;
}

export interface CycleCorrelations {
  symptoms: { name: string; correlation: number }[];
  bbt: { date: string; value: number }[];
}

export interface DisplayPreferences {
  enabled_items: string[];
  custom_items: {
    value: string;
    displayName: string;
    capacityMl?: number;
  }[];
}

/**
 * Real shape of GET /api/v2/pregnancy/overview (see
 * SparkyFitnessServer/services/pregnancyService.ts `getOverview`). When there
 * is no active pregnancy the server returns just `{ pregnancy: null }` — every
 * other field is absent, not just falsy, so treat them all as optional and
 * never assume a truthy `overview` implies `gestation` is present.
 */
export interface PregnancyOverview {
  pregnancy: SharedPregnancy | null;
  date?: string;
  gestation?: GestationalAge;
  baby?: {
    week: number;
    comparison: string;
    lengthCm: number | null;
    weightG: number | null;
    wombScene: 8 | 20 | 36;
    babyBlurb: string;
    momBlurb: string;
  } | null;
  checklist?: {
    id: string | null;
    template_key: string | null;
    title: string;
    week: number;
    completed: boolean;
    dismissed: boolean;
  }[];
  checklistProgress?: { done: number; total: number };
  nextAppointment?: HealthAppointment | null;
  recentKickSessions?: SharedKickSession[];
  vitals?: {
    latestWeight: number | null;
    prePregnancyWeight: number | null;
    height: number | null;
    prePregnancyBmi: number | null;
    weightDelta: number | null;
    weightGainStatus: 'within_range' | 'below_range' | 'above_range' | null;
    gainRange: unknown;
    bpValue: unknown;
    prenatalMedication: { id: string; name: string | null; entryId: string | null; loggedToday: boolean } | null;
    supplementMedication: { id: string; name: string | null; entryId: string | null; loggedToday: boolean } | null;
  };
}

export interface ContractionAnalysis {
  frequencySeconds: number;
  durationSeconds: number;
  shouldGoToHospital: boolean;
}

export interface PregnancyChecklistItem {
  id: string;
  user_id: string;
  pregnancy_id: string;
  template_key: string | null;
  custom_title: string | null;
  week: number | null;
  completed_at: string | null;
  dismissed: boolean;
}

export interface HealthAppointment {
  id: string;
  user_id: string;
  pregnancy_id: string | null;
  scheduled_at: string;
  appointment_type: string | null;
  title: string | null;
  location: string | null;
  notes: string | null;
  outcome: string | null;
}

