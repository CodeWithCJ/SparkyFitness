export interface SleepDebtDailyEntry {
  date: string;
  tst: number;
  deviation: number;
  weight: number;
  weightedDebt: number;
}
export interface SleepDebtData {
  currentDebt: number;
  debtCategory: 'low' | 'moderate' | 'high' | 'critical';
  sleepNeed: number;
  last14Days: SleepDebtDailyEntry[];
  trend: {
    direction: 'improving' | 'stable' | 'worsening';
    change7d: number;
  };
  paybackTime: number;
}

export interface MCTQStatsData {
  profile: {
    baselineSleepNeed: number;
    method: string;
    confidence: string;
    basedOnDays: number;
    lastCalculated: string | null;
    sdWorkday: number | null;
    sdFreeday: number | null;
    socialJetlag: number | null;
  } | null;
  latestCalculation: Record<string, unknown> | null;
  dayClassifications: {
    dayOfWeek: number;
    classifiedAs: string;
    meanWakeHour: number | null;
    varianceMinutes: number | null;
    sampleCount: number;
  }[];
}

export interface BaselineResult {
  success: boolean;
  sleepNeedIdeal?: number;
  sdWorkday?: number;
  sdFreeday?: number;
  sdWeek?: number;
  socialJetlag?: number | null;
  confidence?: string;
  basedOnDays?: number;
  workdaysCount?: number;
  freedaysCount?: number;
  method?: string;
  error?: string;
  message?: string;
}

export interface DailyNeedData {
  date: string;
  baseline: number;
  strainAddition: number;
  debtAddition: number;
  napSubtraction: number;
  totalNeed: number;
  method: string;
  confidence: string;
  trainingLoadScore: number | null;
  currentDebtHours: number;
  napMinutes: number;
  recoveryScoreYesterday: number | null;
}

export interface EnergyCurvePoint {
  hour: number;
  time: string;
  energy: number;
  zone: 'peak' | 'rising' | 'dip' | 'wind-down' | 'sleep';
  processS: number;
  processC: number;
}

export interface EnergyCurveData {
  success: boolean;
  points?: EnergyCurvePoint[];
  currentEnergy?: number;
  currentZone?: string;
  nextPeak?: { hour: number; energy: number } | null;
  nextDip?: { hour: number; energy: number } | null;
  melatoninWindow?: { start: number; end: number };
  wakeTime?: number;
  sleepDebtPenalty?: number;
  error?: string;
  message?: string;
}

export interface ChronotypeData {
  success: boolean;
  chronotype?: 'early' | 'intermediate' | 'late';
  averageWakeTime?: string;
  averageSleepTime?: string | null;
  circadianNadir?: string;
  circadianAcrophase?: string;
  melatoninWindowStart?: string | null;
  melatoninWindowEnd?: string | null;
  basedOnDays?: number;
  confidence?: string;
  error?: string;
  message?: string;
}

export interface DataSufficiencyData {
  sufficient: boolean;
  totalDays: number;
  daysWithTimestamps: number;
  workdaysAvailable: number;
  freedaysAvailable: number;
  workdaysNeeded: number;
  freedaysNeeded: number;
  projectedConfidence: string;
  recommendation: string;
}
