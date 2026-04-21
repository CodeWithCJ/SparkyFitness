import { Repeat, Dumbbell, Hourglass, Timer, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SetColumnHeadersProps {
  category?: string | null;
}

export const SetColumnHeaders = ({ category }: SetColumnHeadersProps) => {
  const { t } = useTranslation();
  const cell =
    'text-[10px] font-bold uppercase text-muted-foreground tracking-wide flex items-center gap-1';
  const isIsometric = category === 'isometric';

  return (
    <div className="flex items-center gap-2 px-1 mb-0.5">
      {/* spacer for grip handle */}
      <div className="w-4 shrink-0" />
      <div className="grid grid-cols-[20px_140px_1fr_1fr_1fr_1fr_1fr_72px] gap-1.5 grow">
        <div className={cell}>#</div>
        <div className={cell}>{t('workout.type', 'Type')}</div>
        <div className={cell}>
          <Repeat className="h-3 w-3 mr-1 text-blue-500" />
          {isIsometric
            ? t('workout.hold_s', 'Hold (s)')
            : t('workout.reps', 'Reps')}
        </div>
        <div className={cell}>
          <Dumbbell className="h-3 w-3 text-red-500" />
          {t('workout.weight', 'weight')}
        </div>
        <div className={cell}>
          <Activity className="h-3 w-3 text-emerald-500" />
          {t('workout.rpe', 'RPE')}
        </div>
        <div className={cell}>
          <Hourglass className="h-3 w-3 text-orange-500" />
          {t('workout.durationMin', 'Duration (min)')}
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
