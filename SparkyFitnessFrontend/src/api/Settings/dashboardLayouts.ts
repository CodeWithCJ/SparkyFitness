import { WEB_TABS_PAGE_KEY, type WebHideableTabId } from '@workspace/shared';
import { apiCall } from '@/api/api';
import { knownHiddenWebTabs } from '@/constants/webTabs';
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

/** The main web tabs the person turned off; none saved means every tab shows. */
export const getHiddenWebTabs = async (): Promise<WebHideableTabId[]> => {
  const saved = await apiCall<{ hidden?: unknown } | null>(
    `/dashboard-layouts/${WEB_TABS_PAGE_KEY}`,
    { method: 'GET', suppress404Toast: true }
  );
  return knownHiddenWebTabs(saved?.hidden);
};

export const saveHiddenWebTabs = async (
  hidden: WebHideableTabId[]
): Promise<WebHideableTabId[]> => {
  const saved = await apiCall<{ hidden?: unknown } | null>(
    `/dashboard-layouts/${WEB_TABS_PAGE_KEY}`,
    { method: 'PUT', body: { layout: {}, hidden } }
  );
  return knownHiddenWebTabs(saved?.hidden);
};

export const resetDashboardLayout = async (pageKey: string): Promise<void> => {
  return apiCall(`/dashboard-layouts/${pageKey}`, {
    method: 'DELETE',
    responseType: 'text',
  });
};
