import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACTIVITY_SPORTS,
  CHALLENGE_FORMATS,
  CHALLENGE_MANUAL_ENTRY_MODES,
  CHALLENGE_METRICS,
  CHALLENGE_PERIODS,
  defaultPointsRules,
  type ActivitySport,
  type ChallengeFormat,
  type ChallengeManualEntryMode,
  type ChallengeMetric,
  type ChallengePeriod,
  type ChallengePointsRules,
  type ChallengeRules,
} from '@workspace/shared';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TimeInput } from '@/components/ui/TimeInput';
import { Toggle } from '@/components/ui/toggle';
import {
  defaultDailyCap,
  formatLabel,
  manualEntriesLabel,
  metricLabel,
  periodLabel,
  sportLabel,
  targetFromInput,
  targetToInput,
  targetUnitLabel,
  weekdayLabel,
  type MetricUnits,
} from './challengeCopy';
import { pointsWithoutDailyGoal } from './challengePeriods';

interface ChallengeRulesEditorProps {
  rules: ChallengeRules;
  onChange: (rules: ChallengeRules) => void;
  units: MetricUnits;
  /** Once a challenge has started its period cannot change. */
  periodLocked?: boolean;
  disabled?: boolean;
}

/** A number field; an empty or invalid entry is reported as null. */
const NumberField = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
}) => {
  const id = useId();
  // What is typed while the field has focus, so an entry the rules refuse
  // (empty, or 0 on the way to 0.5) can still be edited.
  const [text, setText] = useState<string | null>(null);
  const { t } = useTranslation();
  // A typed number the rules refused (out of range): say so, rather than
  // show a value that is not the one saved. Shown values may be rounded
  // (miles, kJ), so only a real difference counts.
  // "0" and "0." are on their way to "0.5": not refused yet.
  const partial = text === '0' || (text?.endsWith('.') ?? false);
  const typed = text === null || text === '' || partial ? null : Number(text);
  const refused =
    typed !== null &&
    Number.isFinite(typed) &&
    (value === null ||
      (min !== undefined && typed < min) ||
      (max !== undefined && typed > max) ||
      Math.abs(typed - value) > 0.5);
  const hintId = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={text ?? value ?? ''}
        min={min}
        max={max}
        step={step ?? 'any'}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = Number(raw);
          onChange(raw === '' || !Number.isFinite(n) ? null : n);
        }}
        onBlur={() => setText(null)}
        aria-invalid={refused || undefined}
        aria-describedby={refused ? hintId : undefined}
        className={refused ? 'border-destructive' : undefined}
      />
      {refused && (
        <p id={hintId} className="text-xs text-destructive">
          {value === null
            ? t(
                'challenges.create.rulesInvalid',
                'A rule setting is empty or out of range.'
              )
            : t(
                'challenges.editor.notAllowed',
                'Not allowed here. It stays {{value}}.',
                {
                  value,
                }
              )}
        </p>
      )}
    </div>
  );
};

/** A part of the rules that can be turned off (null) or on (its defaults). */
const OptionalPart = ({
  label,
  on,
  onToggle,
  disabled,
  note,
  children,
}: {
  label: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
  /** Why the switch is off and cannot be turned on, shown under it. */
  note?: string;
  children?: ReactNode;
}) => {
  const id = useId();
  const noteId = useId();
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <Switch
          id={id}
          checked={on}
          disabled={disabled}
          onCheckedChange={onToggle}
          aria-describedby={note ? noteId : undefined}
        />
      </div>
      {note ? (
        <p id={noteId} className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
      {on && children ? (
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      ) : null}
    </div>
  );
};

const SelectField = <T extends string>({
  label,
  value,
  options,
  optionLabel,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly T[];
  optionLabel: (value: T) => string;
  onChange: (value: T) => void;
  disabled?: boolean;
}) => {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as T)}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {optionLabel(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

/**
 * Every host setting of the shared rules schema. The parent holds the rules;
 * a turned-off part is stored as null, and turning it back on restores the
 * shared defaults for that part.
 */
const ChallengeRulesEditor = ({
  rules,
  onChange,
  units,
  periodLocked = false,
  disabled = false,
}: ChallengeRulesEditorProps) => {
  const { t } = useTranslation();
  const set = (patch: Partial<ChallengeRules>) =>
    onChange({ ...rules, ...patch });
  const defaults = defaultPointsRules();
  const points = rules.points;
  const setPoints = (patch: Partial<ChallengePointsRules>) =>
    points && set({ points: { ...points, ...patch } });
  const activities = rules.activities;
  const setActivities = (patch: Partial<ChallengeRules['activities']>) =>
    set({ activities: { ...activities, ...patch } });
  const unit = targetUnitLabel(t, rules.metric, units);
  const windowStartId = useId();
  const windowEndId = useId();

  // The weekly goal needs a period of a week or longer (the rules refuse it
  // on a daily one), so a daily period turns it off.
  const changeMetric = (metric: ChallengeMetric) =>
    set({
      metric,
      // Points needs its builder; other metrics ignore it. Targets and caps
      // are in the metric's unit, so they do not carry over.
      points:
        metric === 'points'
          ? pointsWithoutDailyGoal(points ?? defaultPointsRules(), rules.period)
          : null,
      target: null,
      dailyCap: null,
    });

  const toggleDay = (day: number, on: boolean) => {
    const days = on
      ? [...rules.days, day].sort((a, b) => a - b)
      : rules.days.filter((d) => d !== day);
    if (days.length) set({ days });
  };

  const toggleSport = (
    field: 'includeSports' | 'excludeSports',
    sport: ActivitySport,
    on: boolean
  ) => {
    const current = activities[field] ?? [];
    const next = on ? [...current, sport] : current.filter((s) => s !== sport);
    setActivities(
      field === 'includeSports'
        ? { includeSports: next.length ? next : null }
        : { excludeSports: next }
    );
  };

  return (
    <Accordion
      type="multiple"
      defaultValue={['scoring']}
      className="w-full"
      data-testid="challenge-rules-editor"
    >
      <AccordionItem value="scoring">
        <AccordionTrigger>
          {t('challenges.editor.scoring', 'What counts and who wins')}
        </AccordionTrigger>
        <AccordionContent className="space-y-3 px-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField<ChallengeMetric>
              label={t('challenges.editor.metric', 'What counts')}
              value={rules.metric}
              options={CHALLENGE_METRICS}
              optionLabel={(m) => metricLabel(t, m)}
              onChange={changeMetric}
              disabled={disabled}
            />
            <SelectField<ChallengeFormat>
              label={t('challenges.editor.format', 'Format')}
              value={rules.format}
              options={CHALLENGE_FORMATS}
              optionLabel={(f) => formatLabel(t, f)}
              onChange={(format) =>
                set({
                  format,
                  target: format === 'leaderboard' ? null : rules.target,
                })
              }
              disabled={disabled}
            />
            <SelectField<ChallengePeriod>
              label={t('challenges.editor.period', 'Scored')}
              value={rules.period}
              options={CHALLENGE_PERIODS}
              optionLabel={(p) => periodLabel(t, p)}
              onChange={(period) =>
                set({ period, points: pointsWithoutDailyGoal(points, period) })
              }
              disabled={disabled || periodLocked}
            />
            {rules.format !== 'leaderboard' && (
              <NumberField
                label={t('challenges.editor.target', 'Target ({{unit}})', {
                  unit,
                })}
                value={
                  rules.target === null
                    ? null
                    : targetToInput(rules.metric, rules.target, units)
                }
                min={0}
                onChange={(v) =>
                  set({
                    target:
                      v === null || v <= 0
                        ? null
                        : targetFromInput(rules.metric, v, units),
                  })
                }
                disabled={disabled}
              />
            )}
            {rules.format === 'hit_goal' && (
              <SelectField<'day' | 'period'>
                label={t('challenges.editor.targetPer', 'Goal applies to')}
                value={rules.targetPer}
                options={['day', 'period']}
                optionLabel={(v) =>
                  v === 'day'
                    ? t('challenges.editor.targetPerDay', 'Each day')
                    : t('challenges.editor.targetPerPeriod', 'The period total')
                }
                onChange={(targetPer) => set({ targetPer })}
                disabled={disabled}
              />
            )}
          </div>
          {periodLocked && (
            <p className="text-xs text-muted-foreground">
              {t(
                'challenges.editor.periodLocked',
                'The period cannot change once the challenge has started.'
              )}
            </p>
          )}
          {rules.format !== 'leaderboard' && rules.target === null && (
            <p className="text-sm text-destructive" role="alert">
              {t(
                'challenges.editor.targetRequired',
                'This format needs a target.'
              )}
            </p>
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="time">
        <AccordionTrigger>
          {t('challenges.editor.time', 'Days and times')}
        </AccordionTrigger>
        <AccordionContent className="space-y-3 px-1">
          <div>
            <p className="mb-1 text-sm">
              {t('challenges.editor.days', 'Days that count')}
            </p>
            <div className="flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <Toggle
                  key={day}
                  variant="outline"
                  size="sm"
                  pressed={rules.days.includes(day)}
                  onPressedChange={(on) => toggleDay(day, on)}
                  disabled={disabled}
                  aria-label={weekdayLabel(t, day)}
                >
                  {weekdayLabel(t, day)}
                </Toggle>
              ))}
            </div>
          </div>
          <OptionalPart
            label={t(
              'challenges.editor.timeWindow',
              'Only workouts that start in a time window'
            )}
            on={rules.timeWindow !== null}
            onToggle={(on) =>
              set({ timeWindow: on ? { start: '05:00', end: '09:00' } : null })
            }
            disabled={disabled}
          >
            {rules.timeWindow && (
              <>
                <div className="space-y-1">
                  <span id={windowStartId} className="text-sm">
                    {t('challenges.editor.windowStart', 'From')}
                  </span>
                  <TimeInput
                    aria-labelledby={windowStartId}
                    value={rules.timeWindow.start}
                    disabled={disabled}
                    onChange={(start) =>
                      rules.timeWindow &&
                      start &&
                      set({ timeWindow: { ...rules.timeWindow, start } })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <span id={windowEndId} className="text-sm">
                    {t('challenges.editor.windowEnd', 'To')}
                  </span>
                  <TimeInput
                    aria-labelledby={windowEndId}
                    value={rules.timeWindow.end}
                    disabled={disabled}
                    onChange={(end) =>
                      rules.timeWindow &&
                      end &&
                      set({ timeWindow: { ...rules.timeWindow, end } })
                    }
                  />
                </div>
              </>
            )}
          </OptionalPart>
          <OptionalPart
            label={t(
              'challenges.editor.bestDays',
              'Only the best days of each week count'
            )}
            on={rules.bestDaysPerWeek !== null}
            onToggle={(on) => set({ bestDaysPerWeek: on ? 5 : null })}
            disabled={disabled}
          >
            <NumberField
              label={t('challenges.editor.bestDaysCount', 'Best days a week')}
              value={rules.bestDaysPerWeek}
              min={1}
              max={7}
              step={1}
              onChange={(v) =>
                v !== null &&
                v >= 1 &&
                v <= 7 &&
                set({ bestDaysPerWeek: Math.round(v) })
              }
              disabled={disabled}
            />
          </OptionalPart>
          <OptionalPart
            label={t('challenges.editor.dailyCap', 'Cap what one day can add')}
            on={rules.dailyCap !== null}
            onToggle={(on) =>
              set({
                dailyCap: on ? defaultDailyCap(rules.metric) : null,
              })
            }
            disabled={disabled}
          >
            <NumberField
              label={t(
                'challenges.editor.dailyCapValue',
                'Daily cap ({{unit}})',
                {
                  unit,
                }
              )}
              value={
                rules.dailyCap === null
                  ? null
                  : targetToInput(rules.metric, rules.dailyCap, units)
              }
              min={0}
              onChange={(v) =>
                v !== null &&
                v > 0 &&
                set({ dailyCap: targetFromInput(rules.metric, v, units) })
              }
              disabled={disabled}
            />
          </OptionalPart>
          {rules.metric === 'hr_zone_minutes' && (
            <NumberField
              label={t(
                'challenges.editor.zoneFrom',
                'Count minutes from heart-rate zone'
              )}
              value={rules.zoneMinutesFromZone}
              min={1}
              max={5}
              step={1}
              onChange={(v) =>
                v !== null &&
                v >= 1 &&
                v <= 5 &&
                set({ zoneMinutesFromZone: Math.round(v) })
              }
              disabled={disabled}
            />
          )}
        </AccordionContent>
      </AccordionItem>

      {rules.metric === 'points' && points && (
        <AccordionItem value="points">
          <AccordionTrigger>
            {t('challenges.editor.points', 'Points builder')}
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-1">
            <div>
              <p className="mb-1 text-sm">
                {t(
                  'challenges.editor.zoneRates',
                  'Points a minute in heart-rate zones 1 to 5'
                )}
              </p>
              <div className="grid grid-cols-5 gap-2">
                {points.zoneRates.map((rate, i) => (
                  <NumberField
                    key={i}
                    label={t('challenges.editor.zoneN', 'Zone {{zone}}', {
                      zone: i + 1,
                    })}
                    value={rate}
                    min={0}
                    max={100}
                    onChange={(v) => {
                      if (v === null || v < 0) return;
                      const zoneRates = [
                        ...points.zoneRates,
                      ] as ChallengePointsRules['zoneRates'];
                      zoneRates[i] = v;
                      setPoints({ zoneRates });
                    }}
                    disabled={disabled}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                label={t(
                  'challenges.editor.belowZoneRate',
                  'Below zone 1 (a minute)'
                )}
                value={points.belowZoneRate}
                min={0}
                onChange={(v) =>
                  v !== null && v >= 0 && setPoints({ belowZoneRate: v })
                }
                disabled={disabled}
              />
              <NumberField
                label={t(
                  'challenges.editor.noHrRate',
                  'No heart rate (a minute)'
                )}
                value={points.noHrRate}
                min={0}
                onChange={(v) =>
                  v !== null && v >= 0 && setPoints({ noHrRate: v })
                }
                disabled={disabled}
              />
            </div>
            <OptionalPart
              label={t('challenges.editor.strengthFloor', 'Lifting floor')}
              on={points.strengthFloor !== null}
              onToggle={(on) =>
                setPoints({
                  strengthFloor: on ? (defaults.strengthFloor ?? 1.5) : null,
                })
              }
              disabled={disabled}
            >
              <NumberField
                label={t(
                  'challenges.editor.strengthFloorValue',
                  'At least (a minute)'
                )}
                value={points.strengthFloor}
                min={0}
                onChange={(v) =>
                  v !== null && v >= 0 && setPoints({ strengthFloor: v })
                }
                disabled={disabled}
              />
            </OptionalPart>
            <OptionalPart
              label={t('challenges.editor.minuteTiers', 'Daily minute tiers')}
              on={points.minuteTiers !== null}
              onToggle={(on) =>
                setPoints({ minuteTiers: on ? defaults.minuteTiers : null })
              }
              disabled={disabled}
            >
              {points.minuteTiers && (
                <>
                  <NumberField
                    label={t(
                      'challenges.editor.tierFull',
                      'Minutes counted in full'
                    )}
                    value={points.minuteTiers.full}
                    min={0}
                    step={1}
                    onChange={(v) =>
                      v !== null &&
                      v >= 0 &&
                      points.minuteTiers &&
                      setPoints({
                        minuteTiers: {
                          ...points.minuteTiers,
                          full: Math.round(v),
                        },
                      })
                    }
                    disabled={disabled}
                  />
                  <NumberField
                    label={t(
                      'challenges.editor.tierHalf',
                      'Then minutes at the lower rate'
                    )}
                    value={points.minuteTiers.half}
                    min={0}
                    step={1}
                    onChange={(v) =>
                      v !== null &&
                      v >= 0 &&
                      points.minuteTiers &&
                      setPoints({
                        minuteTiers: {
                          ...points.minuteTiers,
                          half: Math.round(v),
                        },
                      })
                    }
                    disabled={disabled}
                  />
                  <NumberField
                    label={t('challenges.editor.tierRate', 'Lower rate (%)')}
                    value={Math.round(points.minuteTiers.halfRate * 100)}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) =>
                      v !== null &&
                      v >= 0 &&
                      v <= 100 &&
                      points.minuteTiers &&
                      setPoints({
                        minuteTiers: {
                          ...points.minuteTiers,
                          halfRate: v / 100,
                        },
                      })
                    }
                    disabled={disabled}
                  />
                </>
              )}
            </OptionalPart>
            <OptionalPart
              label={t('challenges.editor.steps', 'Points for steps')}
              on={points.steps !== null}
              onToggle={(on) =>
                setPoints({ steps: on ? defaults.steps : null })
              }
              disabled={disabled}
            >
              {points.steps && (
                <>
                  <NumberField
                    label={t(
                      'challenges.editor.stepsPerPoint',
                      'Steps for 1 point'
                    )}
                    value={points.steps.stepsPerPoint}
                    min={1}
                    step={1}
                    onChange={(v) =>
                      v !== null &&
                      v >= 1 &&
                      points.steps &&
                      setPoints({
                        steps: {
                          ...points.steps,
                          stepsPerPoint: Math.round(v),
                        },
                      })
                    }
                    disabled={disabled}
                  />
                  <NumberField
                    label={t(
                      'challenges.editor.stepsCap',
                      'Most step points a day'
                    )}
                    value={points.steps.dailyCap}
                    min={0}
                    onChange={(v) =>
                      v !== null &&
                      v >= 0 &&
                      points.steps &&
                      setPoints({ steps: { ...points.steps, dailyCap: v } })
                    }
                    disabled={disabled}
                  />
                </>
              )}
            </OptionalPart>
            <OptionalPart
              label={t('challenges.editor.pr', 'Personal record bonus')}
              on={points.pr !== null}
              onToggle={(on) => setPoints({ pr: on ? defaults.pr : null })}
              disabled={disabled}
            >
              {points.pr && (
                <>
                  <NumberField
                    label={t('challenges.editor.prBonus', 'Points per record')}
                    value={points.pr.bonus}
                    min={0}
                    onChange={(v) =>
                      v !== null &&
                      v >= 0 &&
                      points.pr &&
                      setPoints({ pr: { ...points.pr, bonus: v } })
                    }
                    disabled={disabled}
                  />
                  <NumberField
                    label={t('challenges.editor.prMax', 'Most records a day')}
                    value={points.pr.dailyMax}
                    min={0}
                    max={20}
                    step={1}
                    onChange={(v) =>
                      v !== null &&
                      v >= 0 &&
                      points.pr &&
                      setPoints({
                        pr: { ...points.pr, dailyMax: Math.round(v) },
                      })
                    }
                    disabled={disabled}
                  />
                </>
              )}
            </OptionalPart>
            <OptionalPart
              label={t('challenges.editor.streak', 'Streak bonus')}
              on={points.streak !== null}
              onToggle={(on) =>
                setPoints({ streak: on ? defaults.streak : null })
              }
              disabled={disabled}
            >
              {points.streak && (
                <>
                  <NumberField
                    label={t('challenges.editor.streakFrom', 'From day')}
                    value={points.streak.fromDay}
                    min={1}
                    step={1}
                    onChange={(v) =>
                      v !== null &&
                      v >= 1 &&
                      points.streak &&
                      setPoints({
                        streak: { ...points.streak, fromDay: Math.round(v) },
                      })
                    }
                    disabled={disabled}
                  />
                  <NumberField
                    label={t('challenges.editor.streakBonus', 'Points a day')}
                    value={points.streak.bonus}
                    min={0}
                    onChange={(v) =>
                      v !== null &&
                      v >= 0 &&
                      points.streak &&
                      setPoints({ streak: { ...points.streak, bonus: v } })
                    }
                    disabled={disabled}
                  />
                </>
              )}
            </OptionalPart>
            <OptionalPart
              label={t(
                'challenges.editor.beatAverage',
                'Beat-your-average bonus'
              )}
              on={points.beatAverage !== null}
              onToggle={(on) =>
                setPoints({ beatAverage: on ? defaults.beatAverage : null })
              }
              disabled={disabled}
            >
              {points.beatAverage && (
                <NumberField
                  label={t('challenges.editor.beatAverageBonus', 'Points')}
                  value={points.beatAverage.bonus}
                  min={0}
                  onChange={(v) =>
                    v !== null &&
                    v >= 0 &&
                    points.beatAverage &&
                    setPoints({
                      beatAverage: { ...points.beatAverage, bonus: v },
                    })
                  }
                  disabled={disabled}
                />
              )}
            </OptionalPart>
            <OptionalPart
              label={t(
                'challenges.editor.goal',
                'Self-adjusting weekly goal bonus'
              )}
              on={points.goal !== null}
              onToggle={(on) => setPoints({ goal: on ? defaults.goal : null })}
              disabled={disabled || rules.period === 'day'}
              note={
                rules.period === 'day'
                  ? t(
                      'challenges.editor.goalNeedsWeek',
                      'The weekly goal needs a challenge scored by the week or longer.'
                    )
                  : undefined
              }
            >
              {points.goal && (
                <>
                  <NumberField
                    label={t('challenges.editor.goalMax', 'Most points')}
                    value={points.goal.maxBonus}
                    min={0}
                    onChange={(v) =>
                      v !== null &&
                      v >= 0 &&
                      points.goal &&
                      setPoints({ goal: { ...points.goal, maxBonus: v } })
                    }
                    disabled={disabled}
                  />
                  <NumberField
                    label={t(
                      'challenges.editor.goalStretch',
                      'Above own average (%)'
                    )}
                    value={points.goal.stretchPct}
                    min={0}
                    max={100}
                    onChange={(v) =>
                      v !== null &&
                      v >= 0 &&
                      v <= 100 &&
                      points.goal &&
                      setPoints({ goal: { ...points.goal, stretchPct: v } })
                    }
                    disabled={disabled}
                  />
                </>
              )}
            </OptionalPart>
          </AccordionContent>
        </AccordionItem>
      )}

      <AccordionItem value="activities">
        <AccordionTrigger>
          {t('challenges.editor.activities', 'Which workouts count')}
        </AccordionTrigger>
        <AccordionContent className="space-y-3 px-1">
          <div>
            <p className="mb-1 text-sm">
              {t(
                'challenges.editor.includeSports',
                'Only these sports (none ticked: every sport)'
              )}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACTIVITY_SPORTS.map((sport) => (
                <label key={sport} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={activities.includeSports?.includes(sport) ?? false}
                    onCheckedChange={(c) =>
                      toggleSport('includeSports', sport, c === true)
                    }
                    disabled={disabled}
                  />
                  {sportLabel(t, sport)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm">
              {t('challenges.editor.excludeSports', 'Leave out these sports')}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACTIVITY_SPORTS.map((sport) => (
                <label key={sport} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={activities.excludeSports.includes(sport)}
                    onCheckedChange={(c) =>
                      toggleSport('excludeSports', sport, c === true)
                    }
                    disabled={disabled}
                  />
                  {sportLabel(t, sport)}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label={t(
                'challenges.editor.minMinutes',
                'Shortest workout that counts (minutes)'
              )}
              value={activities.minMinutes}
              min={0}
              onChange={(v) =>
                v !== null && v >= 0 && setActivities({ minMinutes: v })
              }
              disabled={disabled}
            />
            <SelectField<ChallengeManualEntryMode>
              label={t(
                'challenges.editor.manualEntries',
                'Workouts logged by hand'
              )}
              value={activities.manualEntries}
              options={CHALLENGE_MANUAL_ENTRY_MODES}
              optionLabel={(m) => manualEntriesLabel(t, m)}
              onChange={(manualEntries) => setActivities({ manualEntries })}
              disabled={disabled}
            />
            {activities.manualEntries === 'cap' && (
              <NumberField
                label={t(
                  'challenges.editor.manualCap',
                  'Most hand-logged minutes a day'
                )}
                value={activities.manualMinutesCap}
                min={0}
                onChange={(v) =>
                  v !== null && v >= 0 && setActivities({ manualMinutesCap: v })
                }
                disabled={disabled}
              />
            )}
          </div>
          <OptionalPart
            label={t(
              'challenges.editor.mergeDuplicates',
              'Count a workout synced from two sources once'
            )}
            on={activities.mergeDuplicates}
            onToggle={(mergeDuplicates) => setActivities({ mergeDuplicates })}
            disabled={disabled}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default ChallengeRulesEditor;
