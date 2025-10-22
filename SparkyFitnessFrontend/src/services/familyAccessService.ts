import { apiCall } from './api';

export interface FamilyAccess {
  id: string;
  owner_user_id: string;
  owner_email?: string; // Added owner_email
  family_email: string;
  family_user_id: string;
  family_user_email?: string; // Added family_user_email
  access_permissions: {
    can_manage_diary: boolean;
    can_view_food_library: boolean;
    can_view_exercise_library: boolean;
    can_manage_checkin: boolean; // Added can_manage_checkin
    can_view_reports: boolean; // Added can_view_reports
    share_external_providers: boolean;
  };
  access_end_date: string | null;
  is_active: boolean;
  status: string;
  created_at: string;
}

interface FamilyAccessPayload {
  owner_user_id: string;
  family_user_id: string;
  family_email: string;
  access_permissions: {
    can_manage_diary: boolean;
    can_view_food_library: boolean;
    can_view_exercise_library: boolean;
    can_manage_checkin: boolean; // Added can_manage_checkin
    can_view_reports: boolean; // Added can_view_reports
    share_external_providers: boolean;
  };
  access_end_date: string | null;
  status: string;
}

export const loadFamilyAccess = async (currentUserId: string): Promise<FamilyAccess[]> => {
  const data = await apiCall(`/auth/family-access`, {
    method: 'GET',
    suppress404Toast: true,
  });
  const transformedData: FamilyAccess[] = (data || []).map((item: any) => ({
    id: item.id,
    owner_user_id: item.owner_user_id,
    owner_email: item.owner_email, // Map owner_email
    family_email: item.family_email,
    family_user_id: item.family_user_id,
    family_user_email: item.family_user_email, // Map family_user_email
    access_permissions: typeof item.access_permissions === 'object' ? {
      can_manage_diary: item.access_permissions.can_manage_diary || false,
      can_view_food_library: item.access_permissions.can_view_food_library || false,
      can_view_exercise_library: item.access_permissions.can_view_exercise_library || false,
      can_manage_checkin: item.access_permissions.can_manage_checkin || false, // Map can_manage_checkin
      can_view_reports: item.access_permissions.can_view_reports || false, // Map can_view_reports
      share_external_providers: item.access_permissions.share_external_providers || false,
    } : {
      can_manage_diary: false,
      can_view_food_library: false,
      can_view_exercise_library: false,
      can_manage_checkin: false,
      can_view_reports: false,
      share_external_providers: false,
    },
    access_end_date: item.access_end_date,
    is_active: item.is_active,
    status: item.status || 'pending',
    created_at: item.created_at,
  }));
  return transformedData;
};

export const findUserByEmail = async (email: string): Promise<string | null> => {
  const response = await apiCall(`/auth/users/find-by-email?email=${encodeURIComponent(email)}`, {
    method: 'GET',
  });
  return response.userId || null;
};

export const createFamilyAccess = async (payload: FamilyAccessPayload): Promise<FamilyAccess> => {
  return apiCall('/auth/family-access', {
    method: 'POST',
    body: payload,
  });
};

export const updateFamilyAccess = async (id: string, payload: Partial<FamilyAccessPayload>): Promise<FamilyAccess> => {
  return apiCall(`/auth/family-access/${id}`, {
    method: 'PUT',
    body: payload,
  });
};

export const toggleFamilyAccessActiveStatus = async (id: string, isActive: boolean): Promise<FamilyAccess> => {
  return apiCall(`/auth/family-access/${id}`, {
    method: 'PUT',
    body: { is_active: isActive },
  });
};

export const deleteFamilyAccess = async (id: string): Promise<void> => {
  return apiCall(`/auth/family-access/${id}`, {
    method: 'DELETE',
  });
};