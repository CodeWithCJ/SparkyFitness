import {
  SleepDebtData,
  sleepDebtDataSchema,
  BaselineResult,
  baselineResultSchema,
  MCTQStatsData,
  mctqStatsDataSchema,
  DailyNeedData,
  dailyNeedResponseSchema,
  EnergyCurveData,
  energyCurveDataSchema,
  ChronotypeData,
  chronotypeDataSchema,
  DataSufficiencyData,
  dataSufficiencyDataSchema,
} from '@workspace/shared';
import { apiCall } from '../api';

export const getSleepDebt = async (
  targetUserId?: string
): Promise<SleepDebtData> => {
  const response = await apiCall('/sleep-science/sleep-debt', {
    params: { targetUserId },
  });
  return sleepDebtDataSchema.parse(response);
};

export const calculateBaseline = async (
  windowDays: number = 90
): Promise<BaselineResult> => {
  const response = await apiCall('/sleep-science/calculate-baseline', {
    method: 'POST',
    body: JSON.stringify({ windowDays }),
  });
  return baselineResultSchema.parse(response);
};

export const getMCTQStats = async (
  targetUserId?: string
): Promise<MCTQStatsData> => {
  const response = await apiCall('/sleep-science/mctq-stats', {
    params: { targetUserId },
  });
  return mctqStatsDataSchema.parse(response);
};

export const getDailyNeed = async (
  date?: string,
  targetUserId?: string
): Promise<DailyNeedData> => {
  const response = await apiCall('/sleep-science/daily-need', {
    params: { date, targetUserId },
  });
  return dailyNeedResponseSchema.parse(response);
};

export const getEnergyCurve = async (
  targetUserId?: string
): Promise<EnergyCurveData> => {
  const response = await apiCall('/sleep-science/energy-curve', {
    params: { targetUserId },
  });
  return energyCurveDataSchema.parse(response);
};

export const getChronotype = async (
  targetUserId?: string
): Promise<ChronotypeData> => {
  const response = await apiCall('/sleep-science/chronotype', {
    params: { targetUserId },
  });
  return chronotypeDataSchema.parse(response);
};

export const getDataSufficiency = async (
  targetUserId?: string
): Promise<DataSufficiencyData> => {
  const response = await apiCall('/sleep-science/data-sufficiency', {
    params: { targetUserId },
  });
  return dataSufficiencyDataSchema.parse(response);
};
