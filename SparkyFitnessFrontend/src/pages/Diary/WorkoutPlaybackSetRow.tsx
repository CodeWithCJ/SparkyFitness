import { useTranslation } from 'react-i18next';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { WeightUnit } from '@/contexts/PreferencesContext';
import {
  Dumbbell,
  MessageSquare,
  Play,
  Square,
  Timer,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UnitInput } from '@/components/ui/UnitInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { excerciseWorkoutSetTypes } from '@/constants/excerciseWorkoutSetTypes';
import { formatSecondsClock } from '@/utils/timeFormatters';
import {
  DEFAULT_REST_SECONDS,
  WORKOUT_PLAYBACK_SET_GRID_CLASSES,
  type WorkoutSetEditableField,
  type WorkoutSetPointer,
} from '@/utils/workoutPlayback';

function formatRestChip(seconds: number | null | undefined): string {
  const value = seconds ?? DEFAULT_REST_SECONDS;
  if (value < 60) {
    return `${value}s`;
  }

  return formatSecondsClock(value);
}

function parseNullableInteger(raw: string): number | null {
  if (raw.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

interface WorkoutPlaybackSetRowProps {
  exerciseName: string;
  exerciseKey: string;
  exerciseIndex: number;
  setIndex: number;
  setNumber: number;
  setType: string | null | undefined;
  isTimedExercise: boolean;
  reps: number | null | undefined;
  weight: number | null | undefined;
  duration: number | null | undefined;
  /** Epoch ms the set's stopwatch started; null when not running. */
  timerStartedAtMs: number | null;
  restTime: number | null | undefined;
  notes: string | null | undefined;
  completed: boolean;
  isNotesVisible: boolean;
  onToggleNotesVisibility: (setKey: string) => void;
  onSelectSet: (pointer: WorkoutSetPointer) => void;
  onCompleteSet: (pointer: WorkoutSetPointer) => void;
  onUncompleteSet: (pointer: WorkoutSetPointer) => void;
  onSetFieldChange: (
    pointer: WorkoutSetPointer,
    field: WorkoutSetEditableField,
    value: number | string | null
  ) => void;
  onOpenRestEditor: (pointer: WorkoutSetPointer) => void;
  onRemoveSet: (pointer: WorkoutSetPointer) => void;
  canRemove: boolean;
  weightUnit: WeightUnit;
  /** Show the plate calculator action (barbell exercises). */
  canCalculatePlates?: boolean;
  onOpenPlateCalculator?: (pointer: WorkoutSetPointer) => void;
}

const WorkoutPlaybackSetRow = ({
  exerciseName,
  exerciseKey,
  exerciseIndex,
  setIndex,
  setNumber,
  setType,
  isTimedExercise,
  reps,
  weight,
  duration,
  timerStartedAtMs,
  restTime,
  notes,
  completed,
  isNotesVisible,
  onToggleNotesVisibility,
  onSelectSet,
  onCompleteSet,
  onUncompleteSet,
  onSetFieldChange,
  onOpenRestEditor,
  onRemoveSet,
  canRemove,
  weightUnit,
  canCalculatePlates = false,
  onOpenPlateCalculator,
}: WorkoutPlaybackSetRowProps) => {
  const { t } = useTranslation();
  const pointer: WorkoutSetPointer = useMemo(
    () => ({ exerciseIndex, setIndex }),
    [exerciseIndex, setIndex]
  );
  const notesKey = `${exerciseKey}-${setIndex}`;

  // Timed/hold-set stopwatch. The start time lives on the draft (persisted),
  // so it survives re-renders and a reload; only the ticking display is local.
  const stopwatchStartedAt = timerStartedAtMs;
  const [stopwatchNowMs, setStopwatchNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (stopwatchStartedAt == null) return;
    const interval = window.setInterval(
      () => setStopwatchNowMs(Date.now()),
      500
    );
    return () => window.clearInterval(interval);
  }, [stopwatchStartedAt]);
  const stopwatchElapsedSec =
    stopwatchStartedAt != null
      ? Math.max(0, Math.floor((stopwatchNowMs - stopwatchStartedAt) / 1000))
      : 0;

  const handleToggleStopwatch = useCallback(() => {
    if (stopwatchStartedAt == null) {
      setStopwatchNowMs(Date.now());
      onSetFieldChange(pointer, 'timer_started_at_ms', Date.now());
      return;
    }
    const elapsed = Math.max(
      1,
      Math.floor((Date.now() - stopwatchStartedAt) / 1000)
    );
    onSetFieldChange(pointer, 'timer_started_at_ms', null);
    onSetFieldChange(pointer, 'duration', elapsed);
    // Hand the pre-filled cell back so the time can be corrected.
    window.setTimeout(() => {
      document
        .getElementById(`set-duration-${exerciseIndex}-${setIndex}`)
        ?.focus();
    }, 0);
  }, [stopwatchStartedAt, onSetFieldChange, pointer, exerciseIndex, setIndex]);

  return (
    <div>
      <div
        className={`w-full rounded-sm border px-2 py-1.5 text-left ${
          completed
            ? 'border-border/60 bg-muted/40 text-muted-foreground'
            : 'border-border/70 bg-background'
        }`}
      >
        <div className={WORKOUT_PLAYBACK_SET_GRID_CLASSES}>
          <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 sm:col-start-1 sm:col-span-1 sm:justify-start">
            <div className="flex min-w-0 items-center gap-2">
              <Checkbox
                aria-label={t(
                  'diary.workoutPlaybackSetRow.completeSet',
                  'Complete set {{setNumber}}',
                  { setNumber }
                )}
                checked={completed}
                className="data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white"
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    onCompleteSet(pointer);
                  } else {
                    onUncompleteSet(pointer);
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                className="h-auto p-0 text-sm font-medium hover:bg-transparent"
                aria-label={t(
                  'diary.workoutPlaybackSetRow.selectSetFor',
                  'Select set {{setNumber}} for {{exerciseName}}',
                  { setNumber, exerciseName }
                )}
                onClick={() => onSelectSet(pointer)}
              >
                {t(
                  'exercise.workoutPlaybackDialog.setRow',
                  'Set {{setNumber}}',
                  {
                    setNumber,
                  }
                )}
              </Button>
            </div>
          </div>

          <Select
            value={setType ?? 'Working Set'}
            onValueChange={(value) =>
              onSetFieldChange(pointer, 'set_type', value)
            }
          >
            <SelectTrigger
              aria-label={t(
                'diary.workoutPlaybackSetRow.typeSet',
                'Type set {{setNumber}}',
                { setNumber }
              )}
              onClick={(event) => event.stopPropagation()}
              className="col-span-2 border-border/70 bg-transparent shadow-none outline-none ring-0 focus:border-border/70 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:border-border/70 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:border-border/70 data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:shadow-none sm:col-start-2 sm:col-span-1"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {excerciseWorkoutSetTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`workout.setType.${type}`, type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isTimedExercise ? (
            <div className="col-span-2 flex items-center gap-1.5 sm:col-start-3 sm:col-span-2">
              <Input
                id={`set-duration-${exerciseIndex}-${setIndex}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                aria-label={t(
                  'workout.durationSet',
                  'Duration set {{setNumber}}',
                  { setNumber }
                )}
                value={
                  stopwatchStartedAt != null
                    ? stopwatchElapsedSec
                    : (duration ?? '')
                }
                readOnly={stopwatchStartedAt != null}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  onSetFieldChange(
                    pointer,
                    'duration',
                    parseNullableInteger(event.target.value)
                  )
                }
                placeholder={t('workout.durationSecShort', 'Sec')}
                className="w-full focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {!completed && (
                <Button
                  type="button"
                  size="icon"
                  variant={
                    stopwatchStartedAt != null ? 'destructive' : 'outline'
                  }
                  className="h-9 w-9 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStopwatch();
                  }}
                  title={
                    stopwatchStartedAt != null
                      ? t('workout.stopTimer', 'Stop stopwatch')
                      : t('workout.startTimer', 'Start stopwatch')
                  }
                >
                  {stopwatchStartedAt != null ? (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                </Button>
              )}
            </div>
          ) : (
            <>
              <Input
                id={`set-reps-${exerciseIndex}-${setIndex}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                aria-label={t(
                  'diary.workoutPlaybackSetRow.repsSet',
                  'Reps set {{setNumber}}',
                  { setNumber }
                )}
                value={reps ?? ''}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  onSetFieldChange(
                    pointer,
                    'reps',
                    parseNullableInteger(event.target.value)
                  )
                }
                placeholder={t('common.reps', 'reps')}
                className="col-span-1 w-full focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:col-start-3"
              />

              <div
                className="col-span-1 w-full sm:col-start-4"
                onClick={(event) => event.stopPropagation()}
              >
                <UnitInput
                  id={`set-weight-${exerciseIndex}-${setIndex}`}
                  value={weight ?? ''}
                  unit={weightUnit}
                  type="weight"
                  placeholder={t('common.weight', 'Weight')}
                  onChange={(value) =>
                    onSetFieldChange(pointer, 'weight', value)
                  }
                  inputClassName="focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  aria-label={t(
                    'diary.workoutPlaybackSetRow.weightSet',
                    'Weight set {{setNumber}}',
                    { setNumber }
                  )}
                />
              </div>
            </>
          )}

          <Button
            type="button"
            variant="outline"
            className="col-span-1 w-full min-w-0 justify-center px-2 text-xs tabular-nums sm:col-start-5 sm:col-span-1"
            aria-label={t(
              'diary.workoutPlaybackSetRow.editRestForSet',
              'Edit rest for set {{setNumber}}',
              { setNumber }
            )}
            onClick={(event) => {
              event.stopPropagation();
              onOpenRestEditor(pointer);
            }}
          >
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
            {formatRestChip(restTime)}
          </Button>

          <div className="col-span-1 flex items-center justify-end gap-1 sm:col-start-6 sm:col-span-1 sm:justify-center">
            {canCalculatePlates && !isTimedExercise && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="cursor-pointer"
                aria-label={t(
                  'plates.openForSet',
                  'Plate calculator for set {{setNumber}}',
                  { setNumber }
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenPlateCalculator?.(pointer);
                }}
              >
                <Dumbbell className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-pointer"
              aria-label={t(
                'diary.workoutPlaybackSetRow.toggleNotesForSet',
                'Toggle notes for set {{setNumber}}',
                { setNumber }
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggleNotesVisibility(notesKey);
              }}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-pointer"
              disabled={!canRemove}
              aria-label={t(
                'diary.workoutPlaybackSetRow.removeSetFor',
                'Remove set {{setNumber}} for {{exerciseName}}',
                { setNumber, exerciseName }
              )}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveSet(pointer);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {isNotesVisible && (
            <Textarea
              aria-label={t(
                'diary.workoutPlaybackSetRow.setNotes',
                'Set notes {{setNumber}}',
                { setNumber }
              )}
              value={notes ?? ''}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                onSetFieldChange(pointer, 'notes', event.target.value)
              }
              placeholder={t(
                'workout.notesPlaceholder',
                'Add a note for this set...'
              )}
              className="min-h-16 resize-none text-sm focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(WorkoutPlaybackSetRow);
