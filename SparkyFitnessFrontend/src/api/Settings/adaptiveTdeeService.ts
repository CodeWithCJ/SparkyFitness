import { api } from '@/api/api';

export interface AdaptiveTdeeResult {
  tdee: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  weightTrend?: number;
  isFallback: boolean;
  fallbackReason?: string;
  avgIntake?: number;
  daysOfData?: number;
  lastCalculated: string;
}

export const adaptiveTdeeService = {
  getAdaptiveTdee: async (): Promise<AdaptiveTdeeResult> => {
    return api.get('/adaptive-tdee');
  },
};
