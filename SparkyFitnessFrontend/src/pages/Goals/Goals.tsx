import { useDailyGoals } from '@/hooks/Goals/useGoals';
import { useTranslation } from 'react-i18next';
import { GoalsContent } from './GoalsContent';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useMemo } from 'react';

const GoalsSettings = () => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const today = useMemo(
    () => formatDateInUserTimezone(new Date(), 'yyyy-MM-dd'),
    [formatDateInUserTimezone]
  );
  const { data: serverGoals, isLoading, isError } = useDailyGoals(today);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        {t('goals.goalsSettings.loadingGoals', 'Loading goals...')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg text-destructive">
        {t(
          'goals.goalsSettings.errorLoading',
          'Failed to load nutrition goals. Please try again later.'
        )}
      </div>
    );
  }

  if (!serverGoals) return null;

  return <GoalsContent key={today} today={today} initialData={serverGoals} />;
};

export default GoalsSettings;
