import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/NumericInput';
import { Label } from '@/components/ui/label';
import { Timer, Flame, Route, Heart, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useId } from 'react';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

interface CardioLogProps {
  durationMinutes: number | '';
  distance: number | null | '';
  caloriesBurned: number | '';
  avgHeartRate: number | '';
  rpe: number | null | '';
  distanceUnit: string;
  onDurationChange: (v: number | '') => void;
  onDistanceChange: (v: number | '') => void;
  onCaloriesChange: (v: number | '') => void;
  onAvgHeartRateChange: (v: number | '') => void;
  onRpeChange: (v: number | null | '') => void;
  simplified?: boolean;
}

export const CardioLog = ({
  durationMinutes,
  distance,
  caloriesBurned,
  avgHeartRate,
  rpe,
  distanceUnit,
  onDurationChange,
  onDistanceChange,
  onCaloriesChange,
  onAvgHeartRateChange,
  onRpeChange,
  simplified = false,
}: CardioLogProps) => {
  const { t } = useTranslation();
  const fieldPrefix = useId();
  const distanceUnitLabel = getLocalizedUnitLabel(distanceUnit, t);
  const durationLabel = t('workout.durationMin', 'Duration (min)');
  const distanceLabel = `${t('workout.distance', 'Distance')} (${distanceUnitLabel})`;
  const caloriesLabel = t('workout.calories', 'Calories burned');
  const heartRateLabel = t('workout.avgHr', 'Average heart rate');
  const rpeLabel = t('workout.rpe', 'Perceived exertion');

  return (
    <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2 md:grid-cols-5">
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor={`${fieldPrefix}-duration`}
          className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground"
        >
          <Timer className="h-3 w-3 text-purple-500" aria-hidden="true" />
          {durationLabel}
        </Label>
        <NumericInput
          id={`${fieldPrefix}-duration`}
          className="h-8 text-sm"
          inputMode="decimal"
          dir="ltr"
          decimals={2}
          step={0.01}
          value={durationMinutes === '' ? null : durationMinutes}
          onValueChange={(v) => onDurationChange(v ?? '')}
        />
      </div>

      {!simplified && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor={`${fieldPrefix}-distance`}
              className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground"
            >
              <Route className="h-3 w-3 text-blue-500" aria-hidden="true" />
              {distanceLabel}
            </Label>
            <NumericInput
              id={`${fieldPrefix}-distance`}
              className="h-8 text-sm"
              inputMode="decimal"
              dir="ltr"
              decimals={1}
              step={0.1}
              value={distance === '' ? null : distance}
              onValueChange={(v) => onDistanceChange(v ?? '')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor={`${fieldPrefix}-calories`}
              className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground"
            >
              <Flame className="h-3 w-3 text-orange-500" aria-hidden="true" />
              {caloriesLabel}
            </Label>
            <Input
              id={`${fieldPrefix}-calories`}
              className="h-8 text-sm"
              type="number"
              inputMode="numeric"
              dir="ltr"
              value={caloriesBurned}
              placeholder={t('workout.caloriesAuto', 'Auto')}
              onChange={(e) =>
                onCaloriesChange(
                  e.target.value === '' ? '' : Number(e.target.value)
                )
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor={`${fieldPrefix}-heart-rate`}
              className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground"
            >
              <Heart className="h-3 w-3 text-red-500" aria-hidden="true" />
              {heartRateLabel}
            </Label>
            <Input
              id={`${fieldPrefix}-heart-rate`}
              className="h-8 text-sm"
              type="number"
              inputMode="numeric"
              dir="ltr"
              value={avgHeartRate}
              onChange={(e) =>
                onAvgHeartRateChange(
                  e.target.value === '' ? '' : Number(e.target.value)
                )
              }
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor={`${fieldPrefix}-rpe`}
          className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground"
        >
          <Activity className="h-3 w-3 text-emerald-500" aria-hidden="true" />
          {rpeLabel}
        </Label>
        <Input
          id={`${fieldPrefix}-rpe`}
          className="h-8 text-sm"
          type="number"
          inputMode="decimal"
          dir="ltr"
          min="0"
          max="10"
          step="0.5"
          placeholder="1–10"
          value={rpe ?? ''}
          onChange={(e) =>
            onRpeChange(e.target.value === '' ? null : Number(e.target.value))
          }
        />
      </div>
    </div>
  );
};
