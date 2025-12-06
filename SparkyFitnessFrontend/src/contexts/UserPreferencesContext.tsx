import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

type EnergyUnit = 'kcal' | 'kJ';

interface UserPreferences {
  energy_unit: EnergyUnit;
  // Add other user preferences here as needed
}

interface UserPreferencesContextType {
  preferences: UserPreferences | null;
  updatePreferences: (newPreferences: Partial<UserPreferences>) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

interface UserPreferencesProviderProps {
  children: ReactNode;
}

export const UserPreferencesProvider: React.FC<UserPreferencesProviderProps> = ({ children }) => {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/preferences'); // Assuming API is relative to frontend
      if (!response.ok) {
        throw new Error(`Error fetching preferences: ${response.statusText}`);
      }
      const data: UserPreferences = await response.json();
      setPreferences(data);
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to fetch user preferences:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreferences = useCallback(async (newPreferences: Partial<UserPreferences>) => {
    try {
      setLoading(true); // Indicate loading while updating
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPreferences),
      });

      if (!response.ok) {
        throw new Error(`Error updating preferences: ${response.statusText}`);
      }

      const updatedData: UserPreferences = await response.json();
      setPreferences(updatedData); // Update local state with the latest from the server
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to update user preferences:', err);
      // Optionally re-fetch preferences to ensure state consistency if update failed
      fetchPreferences();
      throw err; // Re-throw to allow component to handle the error
    } finally {
      setLoading(false);
    }
  }, [fetchPreferences]);

  const contextValue = {
    preferences,
    updatePreferences,
    loading,
    error,
  };

  return (
    <UserPreferencesContext.Provider value={contextValue}>
      {children}
    </UserPreferencesContext.Provider>
  );
};

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
};
