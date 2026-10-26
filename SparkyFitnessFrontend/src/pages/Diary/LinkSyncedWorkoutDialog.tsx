import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CALORIE_LINK_RESOLUTIONS,
  type CalorieLinkResolution,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  useCalorieLinkSuggestions,
  useClearCalorieLinkMutation,
  useSetCalorieLinkMutation,
} from '@/hooks/Exercises/useExerciseEntries';

interface LinkSyncedWorkoutDialogProps {
  /** Any entry of the workout: the entry itself, or one exercise of a session. */
  entryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
}

const RESOLUTION_DEFAULTS: Record<CalorieLinkResolution, string> = {
  sparkyfitness: 'This workout ({{value}})',
  synced: 'The synced workout ({{value}})',
  higher: 'The higher of the two ({{value}})',
  lower: 'The lower of the two ({{value}})',
  average: 'The average ({{value}})',
  custom: 'A custom total',
};

const LinkSyncedWorkoutDialog: React.FC<LinkSyncedWorkoutDialogProps> = ({
  entryId,
  open,
  onOpenChange,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
}) => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useCalorieLinkSuggestions(entryId, open);
  const setLink = useSetCalorieLinkMutation();
  const clearLink = useClearCalorieLinkMutation();

  const [selectedId, setSelectedId] = useState('');
  const [resolution, setResolution] =
    useState<CalorieLinkResolution>('sparkyfitness');
  const [customInput, setCustomInput] = useState<number | ''>('');

  // Start on the synced workout already linked, else the first that looks like
  // the same session; the person can always choose another.
  useEffect(() => {
    if (!data) return;
    const linked = data.link?.synced_entry_id;
    const best = data.candidates.find((c) => c.match !== null);
    setSelectedId(linked ?? best?.id ?? '');
    setResolution(data.link?.resolution ?? 'sparkyfitness');
  }, [data]);

  const unit = getEnergyUnitString(energyUnit);
  const show = (kcal: number) =>
    `${Math.round(convertEnergy(kcal, 'kcal', energyUnit))} ${unit}`;

  const selected = data?.candidates.find((c) => c.id === selectedId);
  const manual = data?.manual_total_calories ?? 0;
  const syncedKcal = selected?.calories_burned ?? 0;
  const preview: Record<CalorieLinkResolution, string> = useMemo(
    () => ({
      sparkyfitness: show(manual),
      synced: show(syncedKcal),
      higher: show(Math.max(manual, syncedKcal)),
      lower: show(Math.min(manual, syncedKcal)),
      average: show((manual + syncedKcal) / 2),
      custom: '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manual, syncedKcal, energyUnit]
  );

  const canLink = !!selected && (resolution !== 'custom' || customInput !== '');

  const handleLink = async () => {
    if (!selected) return;
    await setLink.mutateAsync({
      entryId,
      body: {
        synced_entry_id: selected.id,
        resolution,
        ...(resolution === 'custom' && customInput !== ''
          ? {
              custom_calories: convertEnergy(
                Number(customInput),
                energyUnit,
                'kcal'
              ),
            }
          : {}),
      },
    });
    onOpenChange(false);
  };

  const handleUnlink = async () => {
    await clearLink.mutateAsync(entryId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('exercise.calorieLink.title', 'Link a synced workout')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'exercise.calorieLink.description',
              'If a watch or health app recorded this session too, link the two so its calories count once. Both estimates are kept.'
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <p className="text-sm text-muted-foreground">
            {t(
              'exercise.calorieLink.loading',
              'Looking for synced workouts...'
            )}
          </p>
        )}
        {isError && (
          <p className="text-sm text-destructive">
            {t(
              'exercise.calorieLink.loadError',
              'Could not load synced workouts.'
            )}
          </p>
        )}

        {data && data.candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t(
              'exercise.calorieLink.none',
              'No synced workouts found for this day.'
            )}
          </p>
        )}

        {data && data.candidates.length > 0 && (
          <div className="space-y-4">
            <RadioGroup value={selectedId} onValueChange={setSelectedId}>
              {data.candidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="flex items-start gap-2 rounded-md border p-2"
                >
                  <RadioGroupItem
                    id={`link-candidate-${candidate.id}`}
                    value={candidate.id}
                    className="mt-1"
                  />
                  <Label
                    htmlFor={`link-candidate-${candidate.id}`}
                    className="flex-1 cursor-pointer space-y-0.5"
                  >
                    <span className="block text-sm font-medium">
                      {candidate.name ||
                        t('exercise.calorieLink.workoutFallback', 'Workout')}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        candidate.source,
                        candidate.start_time,
                        t('exercise.calorieLink.minutes', {
                          value: Math.round(candidate.duration_minutes),
                          defaultValue: '{{value}} min',
                        }),
                        show(candidate.calories_burned),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {candidate.match && (
                      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {candidate.match === 'sets_within'
                          ? t(
                              'exercise.calorieLink.sameSession',
                              'Same session'
                            )
                          : t(
                              'exercise.calorieLink.sameTime',
                              'Overlaps in time'
                            )}
                      </span>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t(
                  'exercise.calorieLink.countHeading',
                  'Count in the daily total'
                )}
              </p>
              <RadioGroup
                value={resolution}
                onValueChange={(value) =>
                  setResolution(value as CalorieLinkResolution)
                }
              >
                {CALORIE_LINK_RESOLUTIONS.map((option) => (
                  <div key={option} className="flex items-center gap-2">
                    <RadioGroupItem
                      id={`link-resolution-${option}`}
                      value={option}
                    />
                    <Label
                      htmlFor={`link-resolution-${option}`}
                      className="cursor-pointer text-sm"
                    >
                      {t(`exercise.calorieLink.${option}`, {
                        value: preview[option],
                        defaultValue: RESOLUTION_DEFAULTS[option],
                      })}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {resolution === 'custom' && (
                <div className="space-y-1.5 pl-6">
                  <Label htmlFor="link-custom-calories" className="text-xs">
                    {t('exercise.calorieLink.customLabel', {
                      unit,
                      defaultValue: 'Total for the session ({{unit}})',
                    })}
                  </Label>
                  <Input
                    id="link-custom-calories"
                    type="number"
                    min={0}
                    value={customInput}
                    onChange={(e) =>
                      setCustomInput(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {data?.link && (
            <Button
              variant="outline"
              onClick={handleUnlink}
              disabled={clearLink.isPending}
            >
              {t('exercise.calorieLink.unlink', 'Unlink')}
            </Button>
          )}
          <Button onClick={handleLink} disabled={!canLink || setLink.isPending}>
            {t('exercise.calorieLink.link', 'Link workouts')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LinkSyncedWorkoutDialog;
