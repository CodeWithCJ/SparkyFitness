import type React from 'react';
import { createContext, useContext, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAccessibleUsersQuery } from '@/hooks/Auth/useAuth';
import { AccessibleUser } from '@/api/Auth/auth';
import { error as logError } from '@/utils/logging';

interface ActiveUserContextType {
  activeUserId: string | null;
  activeUserName: string | null;
  isActingOnBehalf: boolean;
  accessibleUsers: AccessibleUser[];
  switchToUser: (userId: string | null) => Promise<void>;
  loadAccessibleUsers: () => void;
  hasPermission: (permission: string) => boolean;
  hasWritePermission: (permission: string) => boolean;
}

const ActiveUserContext = createContext<ActiveUserContextType | undefined>(
  undefined
);

// eslint-disable-next-line  react-refresh/only-export-components
export const useActiveUser = () => {
  const context = useContext(ActiveUserContext);
  if (context === undefined) {
    throw new Error('useActiveUser must be used within an ActiveUserProvider');
  }
  return context;
};

export const ActiveUserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading: authLoading, switchContext } = useAuth();
  const { loggingLevel } = usePreferences();

  const { data: accessibleUsers = [], refetch: loadAccessibleUsers } =
    useAccessibleUsersQuery(!authLoading && !!user);

  const activeUserId = user?.activeUserId || user?.id || null;

  const activeUserName = useMemo(() => {
    if (!user) return null;

    if (activeUserId === user.id) {
      return user.fullName || user.email || 'You';
    }

    const activeUser = accessibleUsers.find((u) => u.user_id === activeUserId);

    return activeUser?.full_name || activeUser?.email || 'Family Member';
  }, [user, activeUserId, accessibleUsers]);

  const isActingOnBehalf = activeUserId !== user?.id;

  const switchToUser = useCallback(
    async (userId: string | null) => {
      if (!user) return;
      const targetUserId = userId || user.id;

      try {
        await switchContext(targetUserId);
      } catch (err) {
        logError(loggingLevel, 'Failed to switch profile context', err);
        throw err;
      }
    },
    [switchContext, user, loggingLevel]
  );

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user || !activeUserId) return false;
      if (activeUserId === user.id) return true;

      const accessibleUser = accessibleUsers.find(
        (u) => u.user_id === activeUserId
      );
      if (!accessibleUser) return false;

      const directPermission =
        accessibleUser.permissions[
          permission as keyof typeof accessibleUser.permissions
        ];

      if (directPermission) return true;

      if (
        accessibleUser.permissions.reports &&
        (permission === 'diary' || permission === 'checkin')
      ) {
        return true;
      }

      return false;
    },
    [user, activeUserId, accessibleUsers]
  );

  const hasWritePermission = useCallback(
    (permission: string): boolean => {
      if (!user || !activeUserId) return false;
      if (activeUserId === user.id) return true;

      const accessibleUser = accessibleUsers.find(
        (u) => u.user_id === activeUserId
      );

      return (
        accessibleUser?.permissions[
          permission as keyof typeof accessibleUser.permissions
        ] || false
      );
    },
    [user, activeUserId, accessibleUsers]
  );

  const value = useMemo(
    () => ({
      activeUserId,
      activeUserName,
      isActingOnBehalf,
      accessibleUsers,
      switchToUser,
      loadAccessibleUsers: () => {
        loadAccessibleUsers();
      },
      hasPermission,
      hasWritePermission,
    }),
    [
      activeUserId,
      activeUserName,
      isActingOnBehalf,
      accessibleUsers,
      hasPermission,
      hasWritePermission,
      loadAccessibleUsers,
      switchToUser,
    ]
  );

  return (
    <ActiveUserContext.Provider value={value}>
      {children}
    </ActiveUserContext.Provider>
  );
};
