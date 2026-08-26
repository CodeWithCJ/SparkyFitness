import type { FamilyDiaryUser } from '../../types/familyDiary';
import { apiFetch } from './apiClient';

interface AccessibleFamilyUserResponse {
  user_id: string;
  full_name: string | null;
  email: string | null;
  permissions: Record<string, boolean | undefined> | null;
  access_end_date: string | null;
}

const hasDiaryPermission = (
  permissions: AccessibleFamilyUserResponse['permissions'],
) =>
  Boolean(
    permissions?.diary ||
      permissions?.calorie ||
      permissions?.can_manage_diary ||
      permissions?.can_view_reports ||
      permissions?.can_view_food_library,
  );

const hasCopyPermission = (
  permissions: AccessibleFamilyUserResponse['permissions'],
) =>
  Boolean(
    permissions?.can_manage_diary &&
      (permissions.food_list || permissions.can_view_food_library),
  );

export async function fetchFamilyDiaryUsers(): Promise<FamilyDiaryUser[]> {
  const users = await apiFetch<AccessibleFamilyUserResponse[]>({
    endpoint: '/api/identity/users/accessible-users',
    serviceName: 'Family Diary API',
    operation: 'fetch accessible family users',
  });

  return users
    .filter(user => hasDiaryPermission(user.permissions))
    .map(user => ({
      userId: user.user_id,
      displayName: user.full_name ?? user.email ?? '',
      email: user.email,
      canCopy: hasCopyPermission(user.permissions),
      accessEndDate: user.access_end_date,
    }));
}
