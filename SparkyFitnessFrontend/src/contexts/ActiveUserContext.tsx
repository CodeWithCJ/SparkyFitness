
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { debug, info, warn, error } from '@/utils/logging';
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiCall } from '@/services/api';

interface AccessibleUser {
  user_id: string;
  full_name: string | null;
  email: string | null;
  permissions: {
    diary: boolean; // Mapped from can_manage_diary
    checkin: boolean; // Mapped from can_manage_checkin
    reports: boolean; // Mapped from can_view_reports
    food_list: boolean; // Mapped from can_view_food_library
  };
  access_end_date: string | null;
}

interface ActiveUserContextType {
  activeUserId: string | null;
  activeUserName: string | null;
  isActingOnBehalf: boolean;
  accessibleUsers: AccessibleUser[];
  switchToUser: (userId: string | null) => Promise<void>;
  loadAccessibleUsers: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasWritePermission: (permission: string) => boolean;
}

const ActiveUserContext = createContext<ActiveUserContextType | undefined>(undefined);

export const useActiveUser = () => {
  const context = useContext(ActiveUserContext);
  if (context === undefined) {
    throw new Error('useActiveUser must be used within an ActiveUserProvider');
  }
  return context;
};

import { NavigateFunction } from 'react-router-dom';

export const ActiveUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, refreshUser, switchContext } = useAuth(); // Add refreshUser and switchContext from useAuth
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "ActiveUserProvider: Initializing ActiveUserProvider.");

  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeUserName, setActiveUserName] = useState<string | null>(null);
  const [accessibleUsers, setAccessibleUsers] = useState<AccessibleUser[]>([]);

  useEffect(() => {
    if (!loading) { // Only proceed after authentication loading is complete
      if (user) {
        const currentActiveUserId = user.activeUserId || user.id;

        info(loggingLevel, "ActiveUserProvider: User logged in, setting active user context.");
        setActiveUserId(currentActiveUserId);

        // Initial name set, will be refined once accessibleUsers load
        setActiveUserName(user.fullName || user.email || 'You');
        loadAccessibleUsers(currentActiveUserId);
      } else {
        info(loggingLevel, "ActiveUserProvider: User logged out, clearing active user and accessible users.");
        setActiveUserId(null);
        setActiveUserName(null);
        setAccessibleUsers([]);
      }
    }
  }, [user, loading, loggingLevel]);

  const loadAccessibleUsers = useCallback(async (initialActiveUserId?: string) => {
    if (!user) {
      warn(loggingLevel, "ActiveUserProvider: Attempted to load accessible users without a user.");
      return;
    }
    info(loggingLevel, "ActiveUserProvider: Loading accessible users for user:", user.id);

    // Fetch accessible users for the logged-in user
    try {
      const data = await apiCall(`/identity/users/accessible-users`);

      info(loggingLevel, 'ActiveUserProvider: Accessible users data received:', data);

      if (!data || data.length === 0) {
        info(loggingLevel, 'ActiveUserProvider: No accessible users found.');
      }

      // Transform the data to ensure proper typing
      const transformedData: AccessibleUser[] = (data || []).map((item: any) => ({
        user_id: item.user_id,
        full_name: item.full_name,
        email: item.email,
        permissions: typeof item.permissions === 'object' ? {
          // If the backend returns 'calorie', use it, otherwise fall back to can_manage_diary
          diary: item.permissions.diary || item.permissions.calorie || item.permissions.can_manage_diary || false,
          checkin: item.permissions.checkin || item.permissions.can_manage_checkin || false,
          reports: item.permissions.reports || item.permissions.can_view_reports || false,
          food_list: item.permissions.food_list || item.permissions.can_view_food_library || false,
          calorie: item.permissions.calorie || false
        } : {
          diary: false,
          checkin: false,
          reports: false,
          food_list: false,
          calorie: false
        },
        access_end_date: item.access_end_date
      }));

      setAccessibleUsers(transformedData);
      // NOTE: activeUserName is now updated by a dedicated effect that watches activeUserId
    } catch (err) {
      error(loggingLevel, 'ActiveUserProvider: Unexpected error loading accessible users:', err);
    }
  }, [user, loggingLevel]);

  // Effect to re-load accessible users when the main user changes or on initial load
  useEffect(() => {
    if (user && !loading) {
      loadAccessibleUsers();
    }
  }, [user, loading]); // Remove loadAccessibleUsers from dependency array

  // Sync activeUserId from auth context when it changes (e.g., after context switch)
  useEffect(() => {
    if (user && user.activeUserId && user.activeUserId !== activeUserId) {
      debug(loggingLevel, "ActiveUserProvider: Detected activeUserId change in auth context, updating local state from:", activeUserId, "to:", user.activeUserId);
      setActiveUserId(user.activeUserId);
      // Reload accessible users to ensure we have the latest data
      loadAccessibleUsers(user.activeUserId);
    }
  }, [user?.activeUserId, user?.id, activeUserId, loggingLevel]);

  // Dedicated effect to update activeUserName whenever activeUserId changes
  useEffect(() => {
    if (!user) {
      setActiveUserName(null);
      return;
    }

    info(loggingLevel, "ActiveUserProvider: Updating active user name for activeUserId:", activeUserId);

    // If active user is the logged-in user
    if (!activeUserId || activeUserId === user.id) {
      info(loggingLevel, "ActiveUserProvider: Acting on own behalf, name:", user.fullName || user.email);
      setActiveUserName(user.fullName || user.email || 'You');
    } else {
      // If acting on behalf of someone else, look up their name from accessible users
      const activeUser = accessibleUsers.find(u => u.user_id === activeUserId);
      if (activeUser) {
        info(loggingLevel, "ActiveUserProvider: Found family member name:", activeUser.full_name || activeUser.email);
        setActiveUserName(activeUser.full_name || activeUser.email || 'Family Member');
      } else {
        // If not found, show a generic name
        info(loggingLevel, "ActiveUserProvider: Active user not found in accessible users, showing generic name");
        setActiveUserName('Family Member');
      }
    }
  }, [activeUserId, user, accessibleUsers, loggingLevel]);

  const switchToUser = async (userId: string | null) => {
    if (!user) {
      warn(loggingLevel, "ActiveUserProvider: Attempted to switch user without a logged-in user.");
      return;
    }
    info(loggingLevel, "ActiveUserProvider: Attempting to switch active user from:", activeUserId, "to:", userId);

    const targetUserId = userId || user.id; // Default to own user ID if null is passed

    try {
      await switchContext(targetUserId);
      info(loggingLevel, "ActiveUserProvider: Profile switch successful. New activeUserId should be:", targetUserId);
    } catch (err) {
      error(loggingLevel, "ActiveUserProvider: Failed to switch profile context:", err);
      throw err;
    }
  };

  const hasPermission = (permission: string): boolean => {
    debug(loggingLevel, "ActiveUserProvider: Checking permission:", permission, "for active user:", activeUserId);
    if (!user || !activeUserId) {
      debug(loggingLevel, "ActiveUserProvider: No user or activeUserId, returning false for permission:", permission);
      return false;
    }

    // If acting on own behalf, have all permissions
    if (activeUserId === user.id) {
      debug(loggingLevel, "ActiveUserProvider: User is acting on own behalf, granting permission:", permission);
      return true;
    }

    // If acting on behalf of someone else, check permissions with inheritance
    const accessibleUser = accessibleUsers.find(u => u.user_id === activeUserId);
    if (!accessibleUser) {
      warn(loggingLevel, "ActiveUserProvider: Accessible user not found for activeUserId:", activeUserId);
      return false;
    }

    // Direct permission check
    const directPermission = accessibleUser.permissions[permission as keyof typeof accessibleUser.permissions];
    if (directPermission) {
      debug(loggingLevel, "ActiveUserProvider: Direct permission granted for:", permission);
      return true;
    }

    // Inheritance logic: reports permission grants read-only access to calorie and checkin
    if (accessibleUser.permissions.reports) {
      if (permission === 'diary' || permission === 'checkin') {
        debug(loggingLevel, "ActiveUserProvider: Read-only access inherited from reports for:", permission);
        return true; // Read-only access inherited from reports
      }
    }

    return false;
  };

  const hasWritePermission = (permission: string): boolean => {
    debug(loggingLevel, "ActiveUserProvider: Checking write permission:", permission, "for active user:", activeUserId);
    if (!user || !activeUserId) {
      debug(loggingLevel, "ActiveUserProvider: No user or activeUserId, returning false for write permission:", permission);
      return false;
    }

    // If acting on own behalf, have all write permissions
    if (activeUserId === user.id) {
      debug(loggingLevel, "ActiveUserProvider: User is acting on own behalf, granting write permission:", permission);
      return true;
    }

    // If acting on behalf of someone else, only direct permissions grant write access
    const accessibleUser = accessibleUsers.find(u => u.user_id === activeUserId);
    const granted = accessibleUser?.permissions[permission as keyof typeof accessibleUser.permissions] || false;
    debug(loggingLevel, "ActiveUserProvider: Direct write permission for", permission, "is:", granted);
    return granted;
  };

  const isActingOnBehalf = activeUserId !== user?.id;
  debug(loggingLevel, "ActiveUserProvider: isActingOnBehalf:", isActingOnBehalf);

  return (
    <ActiveUserContext.Provider value={{
      activeUserId,
      activeUserName,
      isActingOnBehalf,
      accessibleUsers,
      switchToUser,
      loadAccessibleUsers,
      hasPermission,
      hasWritePermission,
    }}>
      {children}
    </ActiveUserContext.Provider>
  );
};
