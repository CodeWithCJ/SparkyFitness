import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getWaterContainers, setPrimaryWaterContainer, WaterContainer } from '../services/waterContainerService';
import { useToast } from '../hooks/use-toast';
import { usePreferences } from './PreferencesContext';
import { useAuth } from '../hooks/useAuth';

interface WaterContainerContextType {
  activeContainer: WaterContainer | null;
  refreshContainers: () => void;
}

const WaterContainerContext = createContext<WaterContainerContextType | undefined>(undefined);

export const WaterContainerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeContainer, setActiveContainer] = useState<WaterContainer | null>(null);
  const { toast } = useToast();
  const { water_display_unit } = usePreferences();
  const { user, loading } = useAuth();

  const fetchAndSetActiveContainer = async () => {
    try {
      const fetchedContainers = await getWaterContainers();

      let primary = fetchedContainers.find(c => c.is_primary);
      if (!primary && fetchedContainers.length > 0) {
        // If no primary, use the first created container as primary
        primary = fetchedContainers[0];
        // Update this in the backend as well
        await setPrimaryWaterContainer(primary.id);
        // Re-fetch to get the updated primary status
        const updatedContainers = await getWaterContainers();
        primary = updatedContainers.find(c => c.id === primary.id); // Get the updated primary
      }

      if (primary) {
        setActiveContainer(primary);
      } else {
        // No containers exist, set a default
        setActiveContainer({
          id: null,
          user_id: '', // Placeholder, not used for non-persisted default
          name: 'Default Container',
          volume: 2000, // Default to 2000ml
          unit: water_display_unit,
          is_primary: true,
          servings_per_container: 8,
        });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch water containers.', variant: 'destructive' });
      setActiveContainer(null); // Ensure activeContainer is null on error
    }
  };

  useEffect(() => {
    if (!loading && user) {
      fetchAndSetActiveContainer();
    } else if (!loading && !user) {
      // If user logs out, clear the active container
      setActiveContainer(null);
    }
  }, [water_display_unit, user, loading]);

  const refreshContainers = () => {
    fetchAndSetActiveContainer();
  };

  return (
    <WaterContainerContext.Provider value={{ activeContainer, refreshContainers }}>
      {children}
    </WaterContainerContext.Provider>
  );
};

export const useWaterContainer = () => {
  const context = useContext(WaterContainerContext);
  if (context === undefined) {
    throw new Error('useWaterContainer must be used within a WaterContainerProvider');
  }
  return context;
};