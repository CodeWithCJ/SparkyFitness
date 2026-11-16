import { useMemo } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { kineticsClock, type KineticsClock } from '@/utils/kineticsTime';

/**
 * The profile's time zone, time format and language for the Diary's
 * modeled-curve cards, so their days and clock labels match the Diary.
 */
export const useKineticsClock = (): KineticsClock => {
  const { timezone, timeFormat, language } = usePreferences();
  return useMemo(
    () => kineticsClock(timezone, timeFormat, language),
    [timezone, timeFormat, language]
  );
};
