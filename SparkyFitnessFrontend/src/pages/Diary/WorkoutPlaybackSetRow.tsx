import { useTranslation } from 'react-i18next';
import { memo } from 'react';
import type { WeightUnit } from '@/contexts/PreferencesContext';
import { MessageSquare, Timer, Trash2 } from 'lucide-react';
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
  type WorkoutSetPointer,
} from '@/utils/workoutPlayback';

function formatRestChip(seconds: number | null | undefined): string {
  const value = seconds ?? DEFAULT_REST_SECONDS;
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
  reps: number | null | undefined;
  weight: number | null | undefined;
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
    field: 'reps' | 'weight' | 'rest_time' | 'set_type' | 'notes',
    value: number | string | null
  ) => void;
  onOpenRestEditor: (pointer: WorkoutSetPointer) => void;
  onRemoveSet: (pointer: WorkoutSetPointer) => void;
  canRemove: boolean;
  weightUnit: WeightUnit;
}

const WorkoutPlaybackSetRow = ({
  exerciseName,
  exerciseKey,
  exerciseIndex,
  setIndex,
  setNumber,
  setType,
  reps,
  weight,
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
}: WorkoutPlaybackSetRowProps) => {
  const { t } = useTranslation();
  const pointer: WorkoutSetPointer = { exerciseIndex, setIndex };
  const notesKey = `${exerciseKey}-${setIndex}`;

  return (
    <div>
      <div
        className={`w-full rounded-sm border px-2 py-1.5 text-start ${
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
                  'exercise.workoutPlaybackPage.completeSet',
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
                  'exercise.workoutPlaybackPage.selectSet',
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
                'exercise.workoutPlaybackPage.typeSet',
                'Set type for set {{setNumber}}',
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

          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            aria-label={t(
              'exercise.workoutPlaybackPage.repsSet',
              'Repetitions for set {{setNumber}}',
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
              value={weight ?? ''}
              unit={weightUnit}
              type="weight"
              placeholder={t('common.weight', 'Weight')}
              onChange={(value) => onSetFieldChange(pointer, 'weight', value)}
              inputClassName="focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              aria-label={t(
                'exercise.workoutPlaybackPage.weightSet',
                'Weight for set {{setNumber}}',
                { setNumber }
              )}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="col-span-1 w-full min-w-0 justify-center px-2 text-xs tabular-nums sm:col-start-5 sm:col-span-1"
            aria-label={t(
              'exercise.workoutPlaybackPage.editRest',
              'Edit rest for set {{setNumber}}',
              { setNumber }
            )}
            onClick={(event) => {
              event.stopPropagation();
              onOpenRestEditor(pointer);
            }}
          >
            <Timer
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            {formatRestChip(restTime)}
          </Button>

          <div className="col-span-1 flex items-center justify-end gap-1 sm:col-start-6 sm:col-span-1 sm:justify-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-pointer"
              aria-label={t(
                'exercise.workoutPlaybackPage.toggleNotes',
                'Show or hide notes for set {{setNumber}}',
                { setNumber }
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggleNotesVisibility(notesKey);
              }}
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-pointer"
              disabled={!canRemove}
              aria-label={t(
                'exercise.workoutPlaybackPage.removeSet',
                'Remove set {{setNumber}} from {{exerciseName}}',
                { setNumber, exerciseName }
              )}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveSet(pointer);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {isNotesVisible && (
            <Textarea
              aria-label={t(
                'exercise.workoutPlaybackPage.notesSet',
                'Notes for set {{setNumber}}',
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
