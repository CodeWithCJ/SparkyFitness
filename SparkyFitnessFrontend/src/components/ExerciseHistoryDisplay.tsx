import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useExerciseHistory } from '@/hooks/Exercises/useExerciseEntries';

interface ExerciseHistoryDisplayProps {
  exerciseId: string;
  limit?: number;
}

const ExerciseHistoryDisplay: React.FC<ExerciseHistoryDisplayProps> = ({
  exerciseId,
  limit = 3,
}) => {
  const { t } = useTranslation();
  const { weightUnit, convertWeight } = usePreferences();
  const [isMinimized, setIsMinimized] = useState(true);
  const { data: history, isLoading: loading } = useExerciseHistory(
    exerciseId,
    limit
  );

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('exerciseHistoryDisplay.loadingHistory', 'Loading history...')}
      </p>
    );
  }

  if (!history || history.length === 0) {
    return null;
  }

  const now = new Date();
  const validHistory = history.filter(
    (entry) => entry.entry_date && new Date(entry.entry_date) <= now
  );

  if (validHistory.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 text-xs">
      <div
        className="flex items-center text-muted-foreground cursor-pointer"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <History className="h-3 w-3 mr-1" />
        <span className="font-medium">
          {t('exercise.lastEntries', 'Last {{limit}} Entries', { limit })}
        </span>
        {isMinimized ? (
          <ChevronDown className="h-3 w-3 ml-1" />
        ) : (
          <ChevronUp className="h-3 w-3 ml-1" />
        )}
      </div>

      {!isMinimized && (
        <div className="mt-2 space-y-2 bg-muted/30 p-2 rounded">
          {validHistory.map((entry, index) => (
            <div
              key={entry.id || index}
              className="flex flex-col border-b border-border/50 pb-1 last:border-0 last:pb-0"
            >
              <span className="font-medium text-[10px] text-muted-foreground mb-1">
                {entry.entry_date
                  ? new Date(entry.entry_date).toLocaleDateString()
                  : ''}
              </span>
              <div className="flex flex-wrap gap-2 text-muted-foreground">
                {entry.sets &&
                  entry.sets.map((set, i) => (
                    <span
                      key={i}
                      className="bg-background px-1.5 py-0.5 rounded border text-[11px]"
                    >
                      {set.reps}x
                      {convertWeight(set.weight ?? 0, 'kg', weightUnit).toFixed(
                        1
                      )}
                      {weightUnit}
                    </span>
                  ))}
              </div>
              {entry.notes && (
                <span className="italic mt-1 text-[10px] text-muted-foreground opacity-80">
                  {entry.notes}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExerciseHistoryDisplay;
