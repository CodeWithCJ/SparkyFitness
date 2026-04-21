import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Timer, Flame, Route, Heart, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 py-2">
      <div className="flex flex-col gap-1.5">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
          <Timer className="h-3 w-3 mr-1 text-purple-500" />
          {t('workout.durationMin', 'Duration (min)')}
        </Label>
        <Input
          className="h-8 text-sm"
          type="number"
          value={durationMinutes}
          onChange={(e) =>
            onDurationChange(
              e.target.value === '' ? '' : Number(e.target.value)
            )
          }
        />
      </div>

      {!simplified && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
              <Route className="h-3 w-3 mr-1 text-blue-500" />
              {t('workout.distance', 'Distance')} ({distanceUnit})
            </Label>
            <Input
              className="h-8 text-sm"
              type="number"
              value={distance ?? ''}
              onChange={(e) =>
                onDistanceChange(
                  e.target.value === '' ? '' : Number(e.target.value)
                )
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
              <Flame className="h-3 w-3 mr-1 text-orange-500" />
              {t('workout.calories', 'Calories')}
            </Label>
            <Input
              className="h-8 text-sm"
              type="number"
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
            <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
              <Heart className="h-3 w-3 mr-1 text-red-500" />
              {t('workout.avgHr', 'Avg HR (bpm)')}
            </Label>
            <Input
              className="h-8 text-sm"
              type="number"
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
        <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
          <Activity className="h-3 w-3 mr-1 text-emerald-500" />
          {t('workout.rpe', 'RPE')}
        </Label>
        <Input
          className="h-8 text-sm"
          type="number"
          min="0"
          max="10"
          step="0.5"
          placeholder="1-10"
          value={rpe ?? ''}
          onChange={(e) =>
            onRpeChange(e.target.value === '' ? null : Number(e.target.value))
          }
        />
      </div>
    </div>
  );
};
