import { apiFetch } from './apiClient';

export interface DashboardStats {
  eaten: number;
  burned: number;
  remaining: number;
  goal: number;
  net: number;
  progress: number;
  steps: number;
  stepCalories: number;
  bmr: number;
  unit: string;
}

export const fetchDashboardStats = async (date: string): Promise<DashboardStats> => {
  return apiFetch<DashboardStats>({
    endpoint: `/api/dashboard/stats?date=${date}`,
    serviceName: 'Dashboard API',
    operation: 'fetch dashboard stats',
  });
};
