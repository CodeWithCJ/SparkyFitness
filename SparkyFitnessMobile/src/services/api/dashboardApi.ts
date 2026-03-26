import { apiFetch } from './apiClient';
import type { DashboardStatsResponse } from '@workspace/shared';

export type { DashboardStatsResponse as DashboardStats };

export const fetchDashboardStats = async (date: string): Promise<DashboardStatsResponse> => {
  return apiFetch<DashboardStatsResponse>({
    endpoint: `/api/dashboard/stats?date=${encodeURIComponent(date)}`,
    serviceName: 'Dashboard API',
    operation: 'fetch dashboard stats',
  });
};
