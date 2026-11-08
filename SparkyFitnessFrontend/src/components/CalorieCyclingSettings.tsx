import { useTranslation } from 'react-i18next';
import {
  CALORIE_CYCLING_MAX_OFFSET,
  cycleWeekTargets,
  trainingRestFromOffsets,
  trainingRestOffsets,
  type CalorieCyclingMode,
} from '@workspace/shared';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/NumericInput';
import { isCalorieCyclingPatternUseful } from '@/utils/calorieCycling';

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
  convertEnergy,
  energyUnit,
  energyUnitString,
}: CalorieCyclingSettingsProps) => {
  const { t } = useTranslation();
  const weekOrder = Array.from(
    { length: 7 },
    (_, i) => (firstDayOfWeek + i) % 7
  );
  const dayName = (day: number) => {
    const weekday = WEEKDAYS[day] ?? WEEKDAYS[0];
    return t(`common.${weekday.key}`, weekday.name);
  };
  const shown = (kcal: number) =>
    Math.round(convertEnergy(kcal, 'kcal', energyUnit)).toLocaleString();

  const { trainingDays, percent } = trainingRestFromOffsets(offsets);
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

  /** A day's cycled target and change, shown beside the control that sets it. */
  const dayResult = (day: number, align: 'start' | 'end') => {
    const cycled = week[day];
    if (!showResults || !cycled) return null;
    const sign = cycled.delta > 0 ? '+' : cycled.delta < 0 ? '−' : '±';
    // What the day actually gets against the base, after balancing the week.
    const effectivePercent = Math.round(
      (Math.abs(cycled.delta) / baseTarget) * 100
    );
    return (
      <span
        className={`flex flex-col text-sm leading-tight ${
          align === 'end' ? 'items-end' : 'items-center'
        }`}
        data-testid={`calorie-cycling-result-${day}`}
      >
        <span className="font-medium tabular-nums">
          {shown(cycled.target)} {energyUnitString}
        </span>
        <span
          className={`text-xs tabular-nums ${
            cycled.delta > 0
              ? 'text-green-600 dark:text-green-400'
              : cycled.delta < 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground'
          }`}
        >
          {t(
            'settings.calorieCycling.dayChange',
            '{{sign}}{{amount}} {{unit}} ({{sign}}{{percent}}%)',
            {
              sign,
              amount: shown(Math.abs(cycled.delta)),
              unit: energyUnitString,
              percent: effectivePercent,
            }
          )}
          {cycled.clampedToFloor && (
            <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">
              {t('settings.calorieCycling.atFloor', 'Safety floor')}
            </Badge>
          )}
        </span>
      </span>
    );
  };

  const changeMode = (value: string) => {
    if (!isCyclingMode(value)) return;
    if (value === 'training_rest') {
      const days = trainingDays.length ? trainingDays : DEFAULT_TRAINING_DAYS;
      const pct = percent > 0 ? percent : DEFAULT_TRAINING_PERCENT;
      onChange({ mode: value, offsets: trainingRestOffsets(days, pct) });
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

  const setTrainingPercent = (value: number) =>
    onChange({ mode, offsets: trainingRestOffsets(trainingDays, value) });

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

      <RadioGroup
        value={mode}
        onValueChange={changeMode}
        disabled={!available}
        className="flex flex-col space-y-2"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="off" id="calorie-cycling-off" />
          <Label htmlFor="calorie-cycling-off" className="cursor-pointer">
            {t(
              'settings.calorieCycling.modeOff',
              'Off: the same target every day'
            )}
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="training_rest" id="calorie-cycling-training" />
          <Label htmlFor="calorie-cycling-training" className="cursor-pointer">
            {t(
              'settings.calorieCycling.modeTrainingRest',
              'Training vs rest: more on the days you train'
            )}
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="custom" id="calorie-cycling-custom" />
          <Label htmlFor="calorie-cycling-custom" className="cursor-pointer">
            {t(
              'settings.calorieCycling.modeCustom',
              'Custom: a percentage for each day'
            )}
          </Label>
        </div>
      </RadioGroup>

      {showResults && (
        <p className="text-sm" data-testid="calorie-cycling-base">
          {t(
            'settings.calorieCycling.baseLine',
            "Today's target before cycling: {{target}} {{unit}}. Your percentages are balanced against each other, so a day only gets more if it is above the week's average and less if it is below it. The amount and % beside each day are what that day actually gets.",
            { target: shown(baseTarget), unit: energyUnitString }
          )}
        </p>
      )}

      {available && mode === 'training_rest' && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {t('settings.calorieCycling.trainingDays', 'Training days')}
          </p>
          <div className="flex flex-wrap gap-2">
            {weekOrder.map((day) => (
              <div key={day} className="flex flex-col items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={trainingDays.includes(day) ? 'default' : 'outline'}
                  aria-pressed={trainingDays.includes(day)}
                  onClick={() => toggleTrainingDay(day)}
                >
                  {dayName(day)}
                </Button>
                {dayResult(day, 'start')}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="calorie-cycling-percent">
              {t(
                'settings.calorieCycling.trainingPercent',
                'Extra on training days (before balancing the week)'
              )}
            </Label>
            <div className="flex items-center gap-3">
              <Slider
                min={0}
                max={CALORIE_CYCLING_MAX_OFFSET}
                step={1}
                value={[percent]}
                onValueChange={([value]) => setTrainingPercent(value ?? 0)}
                className="max-w-xs"
                aria-label={t(
                  'settings.calorieCycling.trainingPercent',
                  'Extra on training days (before balancing the week)'
                )}
              />
              <div className="w-24 shrink-0">
                <NumericInput
                  id="calorie-cycling-percent"
                  value={percent}
                  decimals={0}
                  onValueChange={(value) => setTrainingPercent(value ?? 0)}
                />
              </div>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      )}

      {available && mode === 'custom' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t(
              'settings.calorieCycling.customHint',
              'Set each day from -40% to +40%.'
            )}
          </p>
          {weekOrder.map((day) => (
            <div key={day} className="flex items-center gap-3">
              <span className="w-28 text-sm">{dayName(day)}</span>
              <Slider
                min={-CALORIE_CYCLING_MAX_OFFSET}
                max={CALORIE_CYCLING_MAX_OFFSET}
                step={1}
                value={[offsets[day] ?? 0]}
                onValueChange={([value]) => setDayOffset(day, value ?? 0)}
                className="max-w-xs"
                aria-label={dayName(day)}
              />
              <div className="w-24 shrink-0">
                <NumericInput
                  value={offsets[day] ?? 0}
                  decimals={0}
                  aria-label={dayName(day)}
                  onValueChange={(value) => setDayOffset(day, value ?? 0)}
                />
              </div>
              <span className="text-sm text-muted-foreground">%</span>
              <div className="w-32 shrink-0">{dayResult(day, 'end')}</div>
            </div>
          ))}
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
              "Based on today's target. When your target changes, for example as adaptive expenditure updates, each day follows it. Carbs take the change; protein and fat stay the same."
            )}
          </p>
        </div>
      )}
    </div>
  );
};
