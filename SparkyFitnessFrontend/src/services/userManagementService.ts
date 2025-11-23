import { api } from './api';

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: 'user' | 'admin';
  is_active: boolean;
  created_at: string;
  last_login_at: string;
  mfa_totp_enabled: boolean;
  mfa_email_enabled: boolean;
}

export interface UserProfile {
  date_of_birth: string;
  gender: 'male' | 'female';
  // Add other profile fields here
}

export const userManagementService = {
  getUsers: async (searchTerm: string = ''): Promise<User[]> => {
    const response = await api.get(`/admin/users?searchTerm=${searchTerm}`);
    return response as User[];
  },

  updateUserFullName: async (userId: string, newFullName: string): Promise<void> => {
    await api.put(`/admin/users/${userId}/full-name`, { body: { full_name: newFullName } });
  },

  deleteUser: async (userId: string): Promise<void> => {
    await api.delete(`/admin/users/${userId}`);
  },

  resetUserPassword: async (userId: string): Promise<void> => {
    await api.post(`/admin/users/${userId}/reset-password`);
  },

  updateUserStatus: async (userId: string, isActive: boolean): Promise<void> => {
    await api.put(`/admin/users/${userId}/status`, { body: { isActive } });
  },

  updateUserRole: async (userId: string, role: 'user' | 'admin'): Promise<void> => {
    await api.put(`/admin/users/${userId}/role`, { body: { role } });
  },

  resetUserMfa: async (userId: string): Promise<void> => {
    await api.post(`/admin/auth/users/${userId}/mfa/reset`);
  },

  getUserProfile: async (userId: string): Promise<UserProfile> => {
    try {
      const response = await api.get(`/auth/profiles`);
      return response;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  },
};