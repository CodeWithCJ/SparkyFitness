import { apiCall } from '@/api/api';
import type { DashboardLayouts } from '@/utils/dashboardLayout';

export interface SavedDashboardLayout {
  layout: DashboardLayouts;
  hidden: string[];
  updated_at?: string;
}

export interface DashboardLayoutPayload {
  layout: DashboardLayouts;
  hidden: string[];
}

export const getDashboardLayout = async (
  pageKey: string
): Promise<SavedDashboardLayout | null> => {
  return apiCall(`/dashboard-layouts/${pageKey}`, {
    method: 'GET',
    suppress404Toast: true,
  });
};

export const saveDashboardLayout = async (
  pageKey: string,
  payload: DashboardLayoutPayload
): Promise<SavedDashboardLayout> => {
  return apiCall(`/dashboard-layouts/${pageKey}`, {
    method: 'PUT',
    body: payload,
  });
};

export const resetDashboardLayout = async (pageKey: string): Promise<void> => {
  return apiCall(`/dashboard-layouts/${pageKey}`, {
    method: 'DELETE',
    responseType: 'text',
  });
};
