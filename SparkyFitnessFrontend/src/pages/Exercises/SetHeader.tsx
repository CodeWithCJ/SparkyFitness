import { Repeat, Dumbbell, Hourglass, Timer, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SET_TABLE_LAYOUT, type SetTableModality } from '@/constants/exercises';

interface SetColumnHeadersProps {
  modality: SetTableModality;
}

export const SetColumnHeaders = ({ modality }: SetColumnHeadersProps) => {
  const { t } = useTranslation();
  const cell =
    'text-[10px] font-bold uppercase text-muted-foreground tracking-wide flex items-center gap-1';
  const { gridClass, showReps, showWeight } = SET_TABLE_LAYOUT[modality];

  return (
    <div className="flex items-center gap-2 px-1 mb-0.5">
      {/* spacer for grip handle */}
      <div className="w-4 shrink-0" />
      <div className={gridClass}>
        <div className={cell}>#</div>
        <div className={cell}>{t('workout.type', 'Type')}</div>
        {showReps && (
          <div className={cell}>
            <Repeat className="h-3 w-3 mr-1 text-blue-500" />
            {t('workout.reps', 'Reps')}
          </div>
        )}
        {showWeight && (
          <div className={cell}>
            <Dumbbell className="h-3 w-3 text-red-500" />
            {t('workout.weight', 'weight')}
          </div>
        )}
        <div className={cell}>
          <Activity className="h-3 w-3 text-emerald-500" />
          {t('workout.rpe', 'RPE')}
        </div>
        <div className={cell}>
          <Hourglass className="h-3 w-3 text-orange-500" />
          {t('workout.durationSec', 'Duration (s)')}
        </div>
        <div className={cell}>
          <Timer className="h-3 w-3 text-purple-500" />
          {t('workout.restSec', 'Rest (s)')}
        </div>
        {/* spacer for actions column */}
        <div />
      </div>
    </div>
  );
};
