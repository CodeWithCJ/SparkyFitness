import { apiCall } from './api';
import { AuthResponse, LoginSettings } from '../types/auth';

export const registerUser = async (email: string, password: string, fullName: string): Promise<AuthResponse> => {
  const response = await apiCall('/auth/register', {
    method: 'POST',
    body: { email, password, full_name: fullName },
  });
  return response as AuthResponse;
};

export const loginUser = async (email: string, password: string): Promise<AuthResponse> => {
  const response = await apiCall('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return response as AuthResponse;
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  await apiCall('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
};

export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  await apiCall('/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
  });
};

export const logoutUser = async (): Promise<void> => {
  try {
    await apiCall('/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Error during backend logout:', error);
  } finally {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    // Optionally, clear other relevant local storage items
    // For example, if user preferences or other sensitive data are stored
    // localStorage.removeItem('userPreferences');
    // Redirect to login page or home page
    window.location.href = '/login'; // Assuming a login route
  }
};

export const initiateOidcLogin = async (providerId: number) => {
  try {
    const response = await apiCall(`/openid/login/${providerId}`);
    if (response.authorizationUrl) {
      window.location.href = response.authorizationUrl;
    } else {
      console.error('Could not get OIDC authorization URL from server.');
    }
  } catch (error) {
    console.error('Failed to initiate OIDC login:', error);
  }
};

export const getOidcProviders = async (): Promise<any[]> => {
  try {
    const response = await apiCall('/openid/providers');
    return response;
  } catch (error) {
    console.error('Error fetching OIDC providers:', error);
    return [];
  }
};

export const checkOidcAvailability = async (): Promise<boolean> => {
  try {
    const response = await apiCall('/openid/providers');
    return response && response.length > 0;
  } catch (error: any) {
    console.warn('OIDC availability check failed due to an error:', error.message);
    return false;
  }
};

export const getLoginSettings = async (): Promise<LoginSettings> => {
  try {
    const response = await apiCall('/auth/settings');
    return response as LoginSettings;
  } catch (error) {
    console.error('Error fetching login settings:', error);
    // Fallback to a safe default (email enabled) if the API call fails
    return {
      email: { enabled: true },
      oidc: { enabled: false, providers: [] },
      warning: 'Could not load login settings from server. Defaulting to email login.'
    };
  }
};