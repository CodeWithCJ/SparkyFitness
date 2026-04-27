import { api } from '@/api/api';
import { AdaptiveTdeeResult } from '@/types/settings';

export type { AdaptiveTdeeResult };

export const adaptiveTdeeService = {
  getAdaptiveTdee: async (date: string): Promise<AdaptiveTdeeResult> => {
    return api.get(`/adaptive-tdee?date=${date}`);
  },
};
