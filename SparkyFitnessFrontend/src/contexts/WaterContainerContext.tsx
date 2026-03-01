import type React from 'react';
import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
  useMemo,
} from 'react';
import { usePreferences } from './PreferencesContext';
import { useAuth } from '../hooks/useAuth';
import { useActiveUser } from './ActiveUserContext';
import {
  useWaterContainersQuery,
  useSetPrimaryWaterContainerMutation,
} from '@/hooks/Settings/useWaterContainers';
import { WaterContainer } from '@/types/settings';

interface WaterContainerContextType {
  activeContainer: WaterContainer | null;
}

const WaterContainerContext = createContext<
  WaterContainerContextType | undefined
>(undefined);

export const WaterContainerProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { water_display_unit } = usePreferences();
  const { user, loading } = useAuth();
  const { activeUserId } = useActiveUser(); // Get activeUserId

  const currentUserId = activeUserId || user?.id;
  const { data: containers = [], isSuccess } =
    useWaterContainersQuery(currentUserId);
  const { mutate: setPrimary } = useSetPrimaryWaterContainerMutation();

  // container exists but no container is primary
  useEffect(() => {
    if (isSuccess && containers.length > 0) {
      const hasPrimary = containers.some((c) => c.is_primary);
      if (!hasPrimary) {
        setPrimary(containers[0].id);
      }
    }
  }, [containers, isSuccess, setPrimary]);

  const activeContainer = useMemo(() => {
    if (loading || !currentUserId || !isSuccess) return null;

    const primary = containers.find((c) => c.is_primary);
    if (primary) return primary;

    // Fallback, wenn keine Container in der Datenbank existieren
    if (containers.length === 0) {
      return {
        id: -1, // Verhindert Type-Errors, da id oft number ist
        user_id: '',
        name: 'Default Container',
        volume: 2000,
        unit: water_display_unit,
        is_primary: true,
        servings_per_container: 8,
      } as WaterContainer;
    }

    return containers[0];
  }, [containers, currentUserId, isSuccess, loading, water_display_unit]);

  return (
    <WaterContainerContext.Provider value={{ activeContainer }}>
      {children}
    </WaterContainerContext.Provider>
  );
};

export const useWaterContainer = () => {
  const context = useContext(WaterContainerContext);
  if (context === undefined) {
    throw new Error(
      'useWaterContainer must be used within a WaterContainerProvider'
    );
  }
  return context;
};
