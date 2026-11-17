import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CALORIE_CYCLING_MAX_OFFSET,
  cycleWeekTargets,
  trainingRestFromOffsets,
  trainingRestOffsets,
  type CalorieCyclingMode,
} from '@workspace/shared';
import { Minus, Plus } from 'lucide-react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/NumericInput';
import { CalorieCyclingChart } from '@/components/CalorieCyclingChart';
import { cn } from '@/lib/utils';
import {
  changeColorClass,
  isCalorieCyclingPatternUseful,
  signedAmount,
} from '@/utils/calorieCycling';

const WEEKDAYS = [
  { key: 'sunday', name: 'Sunday' },
  { key: 'monday', name: 'Monday' },
  { key: 'tuesday', name: 'Tuesday' },
  { key: 'wednesday', name: 'Wednesday' },
  { key: 'thursday', name: 'Thursday' },
  { key: 'friday', name: 'Friday' },
  { key: 'saturday', name: 'Saturday' },
] as const;

/** Mon, Wed and Fri at +15%: a starting point when training vs rest is first picked. */
const DEFAULT_TRAINING_DAYS = [1, 3, 5];
const DEFAULT_TRAINING_PERCENT = 15;

const CYCLING_MODE_OPTIONS: {
  mode: CalorieCyclingMode;
  key: string;
  label: string;
}[] = [
  { mode: 'off', key: 'settings.calorieCycling.modeOffShort', label: 'Off' },
  {
    mode: 'training_rest',
    key: 'settings.calorieCycling.modeTrainingRestShort',
    label: 'Training / rest',
  },
  {
    mode: 'custom',
    key: 'settings.calorieCycling.modeCustomShort',
    label: 'Custom',
  },
];

/** A whole-percent value with − and + buttons and a box to type it. */
const PercentStepper = ({
  id,
  label,
  value,
  min,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    <Label htmlFor={id} className="text-sm font-semibold">
      {label}
    </Label>
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <div className="w-20">
        <NumericInput
          id={id}
          value={value}
          decimals={0}
          onValueChange={(next) =>
            onChange(
              Math.max(min, Math.min(CALORIE_CYCLING_MAX_OFFSET, next ?? 0))
            )
          }
        />
      </div>
      <span className="text-sm text-muted-foreground">%</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        aria-label={increaseLabel}
        disabled={value >= CALORIE_CYCLING_MAX_OFFSET}
        onClick={() =>
          onChange(Math.min(CALORIE_CYCLING_MAX_OFFSET, value + 1))
        }
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

const isCyclingMode = (value: string): value is CalorieCyclingMode =>
  value === 'off' || value === 'training_rest' || value === 'custom';

interface CalorieCyclingSettingsProps {
  mode: CalorieCyclingMode;
  offsets: number[];
  onChange: (next: { mode: CalorieCyclingMode; offsets: number[] }) => void;
  /** False while exercise calories are added back to the goal. */
  available: boolean;
  /** A weekly goal plan sets today's goal, so cycling is paused on its days. */
  pausedByWeeklyPlan: boolean;
  /** Today's target before cycling, in kcal. */
  baseTarget: number;
  /** The safety floor the server will respect, in kcal, or null when disabled. */
  floor: number | null;
  firstDayOfWeek: number;
  /** Today's weekday in the user's zone, 0 = Sunday. */
  todayWeekday: number;
  /** The day the chart, the day card and the Live Preview show. */
  selectedDay: number;
  onSelectDay: (day: number) => void;
  convertEnergy: (
    value: number,
    from: 'kcal' | 'kJ',
    to: 'kcal' | 'kJ'
  ) => number;
  energyUnit: 'kcal' | 'kJ';
  energyUnitString: string;
}

export const CalorieCyclingSettings = ({
  mode,
  offsets,
  onChange,
  available,
  pausedByWeeklyPlan,
  baseTarget,
  floor,
  firstDayOfWeek,
  todayWeekday,
  selectedDay,
  onSelectDay,
  convertEnergy,
  energyUnit,
  energyUnitString,
}: CalorieCyclingSettingsProps) => {
  const { t, i18n } = useTranslation();
  // A stored first day outside 0-6 would drop a weekday from the chart.
  const weekStart =
    Number.isInteger(firstDayOfWeek) &&
    firstDayOfWeek >= 0 &&
    firstDayOfWeek <= 6
      ? firstDayOfWeek
      : 0;
  const weekOrder = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
  const dayName = (day: number, width: 'long' | 'short' = 'long') => {
    const weekday = WEEKDAYS[day] ?? WEEKDAYS[0];
    if (width === 'short') {
      // 2023-01-01 was a Sunday, so day 0..6 maps onto Sunday..Saturday.
      return new Date(2023, 0, 1 + day).toLocaleDateString(i18n.language, {
        weekday: 'short',
      });
    }
    return t(`common.${weekday.key}`, weekday.name);
  };
  const shown = (kcal: number) =>
    Math.round(convertEnergy(kcal, 'kcal', energyUnit)).toLocaleString();

  const { trainingDays, percent } = trainingRestFromOffsets(offsets);
  const selectedIsTrainingDay = trainingDays.includes(selectedDay);
  const [lastCustomOffsets, setLastCustomOffsets] = useState<number[] | null>(
    null
  );
  const useful = isCalorieCyclingPatternUseful(mode, offsets);
  const week = cycleWeekTargets({
    baseTarget,
    offsets: mode === 'off' ? null : offsets,
    floor,
  });
  const weekTotal = week.reduce((sum, day) => sum + day.target, 0);
  // Cycling never lowers a day below the floor, so a target already at it
  // leaves every day the same; say so instead of showing a flat week.
  const atOrBelowFloor =
    floor !== null && baseTarget > 0 && baseTarget <= floor;
  const showResults =
    available && mode !== 'off' && useful && baseTarget > 0 && !atOrBelowFloor;
  // The chart stays up whenever a pattern is being edited, even when it
  // changes nothing yet (no training days) or the target sits on the floor,
  // so the days can still be switched and the flat week explains itself.
  const showChart = available && mode !== 'off' && baseTarget > 0;
  const selectedCycled = week[selectedDay];
  const selectedIsTraining =
    mode === 'training_rest'
      ? trainingDays.includes(selectedDay)
      : (selectedCycled?.delta ?? 0) > 0;

  const changeMode = (value: string) => {
    if (!isCyclingMode(value) || value === mode) return;
    // Leaving Custom (for Off too, since Training / rest may follow) keeps
    // the latest custom pattern so switching back restores it.
    if (mode === 'custom') setLastCustomOffsets(offsets);
    if (value === 'training_rest') {
      const days = trainingDays.length ? trainingDays : DEFAULT_TRAINING_DAYS;
      const pct = percent > 0 ? percent : DEFAULT_TRAINING_PERCENT;
      onChange({ mode: value, offsets: trainingRestOffsets(days, pct) });
      return;
    }
    if (value === 'custom' && lastCustomOffsets) {
      onChange({ mode: value, offsets: lastCustomOffsets });
      return;
    }
    if (value === 'custom' && offsets.every((offset) => offset === 0)) {
      onChange({
        mode: value,
        offsets: trainingRestOffsets(
          DEFAULT_TRAINING_DAYS,
          DEFAULT_TRAINING_PERCENT
        ),
      });
      return;
    }
    onChange({ mode: value, offsets });
  };

  const toggleTrainingDay = (day: number) => {
    const days = trainingDays.includes(day)
      ? trainingDays.filter((d) => d !== day)
      : [...trainingDays, day];
    onChange({
      mode,
      offsets: trainingRestOffsets(days, percent || DEFAULT_TRAINING_PERCENT),
    });
  };

  // At least 1%: a zero boost would store seven zeros and lose the days.
  const setTrainingPercent = (value: number) =>
    onChange({
      mode,
      offsets: trainingRestOffsets(
        trainingDays,
        Math.max(1, Math.min(CALORIE_CYCLING_MAX_OFFSET, Math.round(value)))
      ),
    });

  const setDayOffset = (day: number, value: number) => {
    const clamped = Math.max(
      -CALORIE_CYCLING_MAX_OFFSET,
      Math.min(CALORIE_CYCLING_MAX_OFFSET, Math.round(value))
    );
    onChange({
      mode,
      offsets: offsets.map((offset, index) =>
        index === day ? clamped : offset
      ),
    });
  };

  return (
    <div className="space-y-4" data-testid="calorie-cycling-settings">
      <div className="space-y-1">
        <Label className="text-base font-semibold">
          {t('settings.calorieCycling.title', 'Calorie cycling')}
        </Label>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.calorieCycling.description',
            'Eat more on training days and less on rest days. Your weekly total stays the same: your daily target x 7.'
          )}
        </p>
      </div>

      {!available && (
        <p className="text-sm rounded-md border border-border bg-muted/50 p-3">
          {t(
            'settings.calorieCycling.unavailable',
            'Not available while exercise calories are added back to your goal: your target already rises on the days you log a workout. Choose Adaptive or Fixed, or use full-day adaptive targets, to cycle calories.'
          )}
        </p>
      )}
      {available && pausedByWeeklyPlan && mode !== 'off' && (
        <p className="text-sm rounded-md border border-border bg-muted/50 p-3">
          {t(
            'settings.calorieCycling.pausedByWeeklyPlan',
            'A weekly goal plan is active, so calorie cycling is paused on the days the plan sets.'
          )}
        </p>
      )}

      <RadioGroupPrimitive.Root
        value={mode}
        onValueChange={changeMode}
        disabled={!available}
        aria-label={t('settings.calorieCycling.title', 'Calorie cycling')}
        className="inline-grid grid-cols-3 rounded-full bg-muted p-1 text-sm"
      >
        {CYCLING_MODE_OPTIONS.map((option) => (
          <RadioGroupPrimitive.Item
            key={option.mode}
            value={option.mode}
            className={cn(
              'whitespace-nowrap rounded-full px-4 py-1.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              mode === option.mode
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(option.key, option.label)}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      <p className="text-sm text-muted-foreground">
        {mode === 'off'
          ? t(
              'settings.calorieCycling.modeOff',
              'Off: the same target every day'
            )
          : mode === 'training_rest'
            ? t(
                'settings.calorieCycling.modeTrainingRest',
                'Training vs rest: more on the days you train'
              )
            : t(
                'settings.calorieCycling.modeCustom',
                'Custom: a percentage for each day'
              )}
      </p>

      {showChart && (
        <CalorieCyclingChart
          mode={mode}
          week={week}
          offsets={offsets}
          trainingDays={trainingDays}
          weekOrder={weekOrder}
          baseTarget={baseTarget}
          floor={floor}
          selectedDay={selectedDay}
          todayWeekday={todayWeekday}
          onSelectDay={onSelectDay}
          onToggleTraining={toggleTrainingDay}
          onSetOffset={setDayOffset}
          dayName={dayName}
          shown={shown}
        />
      )}

      {showChart && selectedCycled && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          <div className="space-y-4 rounded-xl border border-border bg-muted/50 p-4 dark:bg-muted/30">
            {mode === 'custom' ? (
              <PercentStepper
                id="calorie-cycling-day-percent"
                label={t(
                  'settings.calorieCycling.dayPercent',
                  '{{day}}: percentage before balancing the week',
                  { day: dayName(selectedDay) }
                )}
                value={offsets[selectedDay] ?? 0}
                min={-CALORIE_CYCLING_MAX_OFFSET}
                onChange={(value) => setDayOffset(selectedDay, value)}
                decreaseLabel={t(
                  'settings.calorieCycling.decrease',
                  'Lower by 1%'
                )}
                increaseLabel={t(
                  'settings.calorieCycling.increase',
                  'Raise by 1%'
                )}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {dayName(selectedDay)}
                  </span>
                  <RadioGroupPrimitive.Root
                    value={selectedIsTrainingDay ? 'training' : 'rest'}
                    onValueChange={(value) => {
                      if ((value === 'training') !== selectedIsTrainingDay) {
                        toggleTrainingDay(selectedDay);
                      }
                    }}
                    aria-label={dayName(selectedDay)}
                    className="inline-grid grid-cols-2 rounded-full bg-background p-1 text-xs"
                  >
                    {[true, false].map((training) => {
                      const checked = selectedIsTrainingDay === training;
                      return (
                        <RadioGroupPrimitive.Item
                          key={String(training)}
                          value={training ? 'training' : 'rest'}
                          className={cn(
                            'rounded-full px-3 py-1 font-semibold',
                            checked
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {training
                            ? t(
                                'settings.calorieCycling.trainingDay',
                                'Training'
                              )
                            : t('settings.calorieCycling.restDay', 'Rest')}
                        </RadioGroupPrimitive.Item>
                      );
                    })}
                  </RadioGroupPrimitive.Root>
                </div>
                <div className="space-y-2">
                  <PercentStepper
                    id="calorie-cycling-percent"
                    label={t(
                      'settings.calorieCycling.trainingPercent',
                      'Extra on training days (before balancing the week)'
                    )}
                    value={percent}
                    min={1}
                    onChange={setTrainingPercent}
                    decreaseLabel={t(
                      'settings.calorieCycling.decrease',
                      'Lower by 1%'
                    )}
                    increaseLabel={t(
                      'settings.calorieCycling.increase',
                      'Raise by 1%'
                    )}
                  />
                  <Slider
                    min={1}
                    max={CALORIE_CYCLING_MAX_OFFSET}
                    step={1}
                    value={[Math.max(1, percent)]}
                    onValueChange={([value]) => setTrainingPercent(value ?? 1)}
                    aria-label={t(
                      'settings.calorieCycling.trainingPercent',
                      'Extra on training days (before balancing the week)'
                    )}
                  />
                </div>
              </>
            )}
          </div>

          <div
            className="rounded-xl border border-border bg-muted/50 p-4 dark:bg-muted/30"
            data-testid="calorie-cycling-day-card"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {selectedDay === todayWeekday
                ? t('settings.calorieCycling.today', 'Today')
                : dayName(selectedDay)}
              {' · '}
              {selectedIsTraining
                ? t('settings.calorieCycling.trainingDay', 'Training')
                : t('settings.calorieCycling.restDay', 'Rest')}
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-primary">
              {shown(selectedCycled.target)}{' '}
              <span className="text-base font-medium text-muted-foreground">
                {energyUnitString}
              </span>
            </p>
            <p
              className={cn('text-sm', changeColorClass(selectedCycled.delta))}
            >
              {t(
                'settings.calorieCycling.vsTarget',
                '{{change}} {{unit}} ({{percent}}) vs your daily target',
                {
                  change: signedAmount(
                    selectedCycled.delta,
                    shown(Math.abs(selectedCycled.delta))
                  ),
                  unit: energyUnitString,
                  percent: signedAmount(
                    selectedCycled.delta,
                    `${Math.round(
                      (Math.abs(selectedCycled.delta) / baseTarget) * 100
                    )}%`
                  ),
                }
              )}
            </p>
            {selectedCycled.clampedToFloor && (
              <Badge variant="secondary" className="mt-2">
                {t('settings.calorieCycling.atFloor', 'Safety floor')}
              </Badge>
            )}
          </div>
        </div>
      )}

      {available && mode !== 'off' && !useful && (
        <p className="text-sm text-destructive" role="alert">
          {mode === 'training_rest'
            ? t(
                'settings.calorieCycling.needTrainingDays',
                'Choose between 1 and 6 training days and a percentage above 0, or every day stays the same.'
              )
            : t(
                'settings.calorieCycling.needDifferentDays',
                'Give at least two days different percentages, or every day stays the same.'
              )}
        </p>
      )}

      {available && mode !== 'off' && useful && atOrBelowFloor && (
        <p
          className="text-sm rounded-md border border-border bg-muted/50 p-3"
          data-testid="calorie-cycling-at-floor"
        >
          {t(
            'settings.calorieCycling.baseAtFloor',
            'Your daily target ({{target}} {{unit}}) is at or below your safety floor ({{floor}} {{unit}}), so no day can go lower and every day stays the same. Cycling starts working once your target is above the floor, or with a lower custom floor.',
            {
              target: shown(baseTarget),
              floor: shown(floor ?? 0),
              unit: energyUnitString,
            }
          )}
        </p>
      )}

      {showResults && (
        <div className="space-y-1">
          <p className="text-sm" data-testid="calorie-cycling-week-total">
            {t(
              'settings.calorieCycling.weekTotalWithBase',
              'Week: {{total}} of {{budget}} {{unit}} (your daily target {{target}} × 7)',
              {
                total: shown(weekTotal),
                budget: shown(baseTarget * 7),
                target: shown(baseTarget),
                unit: energyUnitString,
              }
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              'settings.calorieCycling.previewNote',
              "Based on today's target. When your target changes, for example as adaptive expenditure updates, each day follows it. Carbs take the change and protein stays the same."
            )}
          </p>
        </div>
      )}
    </div>
  );
};
