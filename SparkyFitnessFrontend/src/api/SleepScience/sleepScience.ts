import {
  SleepDebtData,
  BaselineResult,
  MCTQStatsData,
  DailyNeedData,
  EnergyCurveData,
  ChronotypeData,
  DataSufficiencyData,
} from '@/types/sleepScience';
import { api } from '../api';

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
