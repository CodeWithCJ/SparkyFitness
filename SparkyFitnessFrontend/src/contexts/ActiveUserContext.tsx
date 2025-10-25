
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
    calorie: boolean;
    checkin: boolean;
    reports: boolean;
    food_list: boolean;
  };
  access_end_date: string | null;
}

interface ActiveUserContextType {
  activeUserId: string | null;
  activeUserName: string | null;
  isActingOnBehalf: boolean;
  accessibleUsers: AccessibleUser[];
  switchToUser: (userId: string | null) => void;
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
  const { user, loading } = useAuth(); // Get loading state from useAuth
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "ActiveUserProvider: Initializing ActiveUserProvider.");

  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeUserName, setActiveUserName] = useState<string | null>(null);
  const [accessibleUsers, setAccessibleUsers] = useState<AccessibleUser[]>([]);

  useEffect(() => {
    if (!loading) { // Only proceed after authentication loading is complete
      if (user) {
        const storedActiveUserId = localStorage.getItem('activeUserId');
        const initialActiveUserId = storedActiveUserId && storedActiveUserId !== user.id ? storedActiveUserId : user.id;

        info(loggingLevel, "ActiveUserProvider: User logged in, setting active user and loading accessible users.");
        setActiveUserId(initialActiveUserId);
        setActiveUserName(user.email || 'You'); // This will be updated after accessible users are loaded
        loadAccessibleUsers(initialActiveUserId); // Pass initialActiveUserId to load permissions
      } else {
        info(loggingLevel, "ActiveUserProvider: User logged out, clearing active user and accessible users.");
        localStorage.removeItem('activeUserId');
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

    const currentActiveUserId = initialActiveUserId || activeUserId;

    // Fetch accessible users for the logged-in user
    try {
      const data = await apiCall(`/auth/users/accessible-users`);

      info(loggingLevel, 'ActiveUserProvider: Accessible users data received:', data);
      
      // Transform the data to ensure proper typing
      const transformedData: AccessibleUser[] = (data || []).map((item: any) => ({
        user_id: item.user_id,
        full_name: item.full_name,
        email: item.email,
        permissions: typeof item.permissions === 'object' ? {
          calorie: item.permissions.calorie || false,
          checkin: item.permissions.checkin || false,
          reports: item.permissions.reports || false,
          food_list: item.permissions.food_list || false
        } : {
          calorie: false,
          checkin: false,
          reports: false,
          food_list: false
        },
        access_end_date: item.access_end_date
      }));
      
      setAccessibleUsers(transformedData);

      // Set active user name based on the loaded accessible users or the current user
      if (currentActiveUserId && currentActiveUserId !== user.id) {
        const activeUser = transformedData.find(u => u.user_id === currentActiveUserId);
        if (activeUser) {
          setActiveUserName(activeUser.full_name || activeUser.email || 'Family Member');
        } else {
          // Fallback if the stored active user is no longer accessible
          localStorage.removeItem('activeUserId');
          setActiveUserId(user.id);
          setActiveUserName(user.email || 'You');
        }
      } else {
        setActiveUserName(user.email || 'You');
      }
    } catch (err) {
      error(loggingLevel, 'ActiveUserProvider: Unexpected error loading accessible users:', err);
    }
  }, [user, activeUserId, loggingLevel]);

  // Effect to re-load accessible users when the main user changes or on initial load
  useEffect(() => {
    if (user && !loading) {
      loadAccessibleUsers();
    }
  }, [user, loading]); // Remove loadAccessibleUsers from dependency array

  const switchToUser = (userId: string | null) => {
    if (!user) {
      warn(loggingLevel, "ActiveUserProvider: Attempted to switch user without a logged-in user.");
      return;
    }
    info(loggingLevel, "ActiveUserProvider: Attempting to switch active user to:", userId);

    const targetUserId = userId || user.id; // Default to own user ID if null is passed

    if (targetUserId === user.id) {
      // Switch back to own profile
      info(loggingLevel, "ActiveUserProvider: Switching to own profile.");
      localStorage.removeItem('activeUserId'); // Clear activeUserId from local storage
      setActiveUserId(user.id);
      setActiveUserName(user.email || 'You');
    } else {
      // Switch to family member's profile
      const accessibleUser = accessibleUsers.find(u => u.user_id === targetUserId);
      if (accessibleUser) {
        info(loggingLevel, "ActiveUserProvider: Switching to family member profile:", accessibleUser.full_name || accessibleUser.email);
        localStorage.setItem('activeUserId', targetUserId); // Store activeUserId in local storage
        setActiveUserId(targetUserId);
        setActiveUserName(accessibleUser.full_name || accessibleUser.email || 'Family Member');
      } else {
        warn(loggingLevel, "ActiveUserProvider: Attempted to switch to an inaccessible user ID:", targetUserId);
      }
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
      if (permission === 'calorie' || permission === 'checkin') {
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
