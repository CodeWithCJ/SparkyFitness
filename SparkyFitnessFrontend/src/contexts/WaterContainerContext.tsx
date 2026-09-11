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
  activeContainer: WaterContainer | undefined | null;
  containers: WaterContainer[];
  standardContainers: WaterContainer[];
  quickAddPresets: WaterContainer[];
}

const WaterContainerContext = createContext<
  WaterContainerContextType | undefined
>(undefined);

export const WaterContainerProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { water_display_unit } = usePreferences();
  const { user, loading } = useAuth();
  const { activeUserId } = useActiveUser();

  const currentUserId = activeUserId || user?.id;
  const { data: containers = [], isSuccess } =
    useWaterContainersQuery(currentUserId);
  const { mutate: setPrimary } = useSetPrimaryWaterContainerMutation();

  const standardContainers = useMemo(
    () => containers.filter((c) => !c.is_quick_add),
    [containers]
  );

  const quickAddPresets = useMemo(
    () => containers.filter((c) => !!c.is_quick_add),
    [containers]
  );

  // If standard containers exist but none is primary, set the first standard container as primary
  useEffect(() => {
    if (isSuccess && standardContainers.length > 0) {
      const hasPrimary = standardContainers.some((c) => c.is_primary);
      if (!hasPrimary) {
        const firstContainer = standardContainers[0];
        if (firstContainer) {
          setPrimary(firstContainer.id);
        }
      }
    }
  }, [standardContainers, isSuccess, setPrimary]);

  const activeContainer = useMemo(() => {
    if (loading || !currentUserId || !isSuccess) return null;

    const primary = standardContainers.find((c) => c.is_primary);
    if (primary) return primary;

    if (standardContainers.length === 0) {
      return {
        id: -1,
        user_id: '',
        name: 'Default Container',
        volume: 2000,
        unit: water_display_unit,
        is_primary: true,
        servings_per_container: 8,
        hydration_factor: 1.0,
        is_quick_add: false,
        sort_order: 0,
      } as WaterContainer;
    }

    return standardContainers[0];
  }, [
    standardContainers,
    currentUserId,
    isSuccess,
    loading,
    water_display_unit,
  ]);

  return (
    <WaterContainerContext.Provider
      value={{
        activeContainer,
        containers,
        standardContainers,
        quickAddPresets,
      }}
    >
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
