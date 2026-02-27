// ====== Types ======

import { api } from '../api';

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

// ====== API Calls ======

export const getSleepDebt = async (
  targetUserId?: string
): Promise<SleepDebtData> => {
  return api.get('/sleep-science/sleep-debt', {
    params: { targetUserId },
  });
};

export const calculateBaseline = async (
  windowDays: number = 90
): Promise<BaselineResult> => {
  return api.post('/sleep-science/calculate-baseline', {
    body: { windowDays },
  });
};

export const getMCTQStats = async (
  targetUserId?: string
): Promise<MCTQStatsData> => {
  return api.get('/sleep-science/mctq-stats', {
    params: { targetUserId },
  });
};

export const getDailyNeed = async (
  date?: string,
  targetUserId?: string
): Promise<DailyNeedData> => {
  return api.get('/sleep-science/daily-need', {
    params: { date, targetUserId },
  });
};

export const getEnergyCurve = async (
  targetUserId?: string
): Promise<EnergyCurveData> => {
  return api.get('/sleep-science/energy-curve', {
    params: { targetUserId },
  });
};

export const getChronotype = async (
  targetUserId?: string
): Promise<ChronotypeData> => {
  return api.get('/sleep-science/chronotype', {
    params: { targetUserId },
  });
};

export const getDataSufficiency = async (
  targetUserId?: string
): Promise<DataSufficiencyData> => {
  return api.get('/sleep-science/data-sufficiency', {
    params: { targetUserId },
  });
};
