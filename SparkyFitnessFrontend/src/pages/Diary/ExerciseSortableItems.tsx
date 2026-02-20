import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { WorkoutPresetSet } from '@/types/workout';
import { excerciseWorkoutSetTypes } from '@/constants/excerciseWorkoutSetTypes';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Copy,
  X,
  Repeat,
  Dumbbell,
  Timer,
  Activity,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SortableSetItemProps {
  set: WorkoutPresetSet;
  setIndex: number;
  handleSetChange: (
    index: number,
    field: keyof WorkoutPresetSet,
    value: string | number | undefined
  ) => void;
  handleDuplicateSet: (index: number) => void;
  handleRemoveSet: (index: number) => void;
  weightUnit: string;
}

export const SortableSetItem = React.memo(
  ({
    set,
    setIndex,
    handleSetChange,
    handleDuplicateSet,
    handleRemoveSet,
    weightUnit,
  }: SortableSetItemProps) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: `set-${setIndex}` });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex flex-col space-y-1"
        {...attributes}
      >
        <div className="flex items-center space-x-2">
          <div {...listeners}>
            <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-9 gap-2 flex-grow items-center">
            <div className="md:col-span-1">
              <Label>
                {t('exercise.editExerciseEntryDialog.setLabel', 'Set')}
              </Label>
              <p className="font-medium p-2">{set.set_number}</p>
            </div>
            <div className="md:col-span-2">
              <Label>
                {t('exercise.editExerciseEntryDialog.typeLabel', 'Type')}
              </Label>
              <Select
                value={set.set_type}
                onValueChange={(value) =>
                  handleSetChange(setIndex, 'set_type', value)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      'exercise.editExerciseEntryDialog.setTypePlaceholder',
                      'Set Type'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {excerciseWorkoutSetTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-1">
              <Label htmlFor={`reps-${setIndex}`} className="flex items-center">
                <Repeat className="h-4 w-4 mr-1" style={{ color: '#3b82f6' }} />{' '}
                {t('exercise.editExerciseEntryDialog.repsLabel', 'Reps')}
              </Label>
              <Input
                id={`reps-${setIndex}`}
                type="number"
                value={set.reps ?? ''}
                onChange={(e) =>
                  handleSetChange(setIndex, 'reps', Number(e.target.value))
                }
              />
            </div>
            <div className="md:col-span-1">
              <Label
                htmlFor={`weight-${setIndex}`}
                className="flex items-center"
              >
                <Dumbbell
                  className="h-4 w-4 mr-1"
                  style={{ color: '#ef4444' }}
                />{' '}
                {t('exercise.editExerciseEntryDialog.weightLabel', 'Weight')} (
                {weightUnit})
              </Label>
              <Input
                id={`weight-${setIndex}`}
                type="number"
                value={set.weight ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const newValue = val === '' ? null : Number(val);
                  handleSetChange(setIndex, 'weight', newValue);
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleSetChange(setIndex, 'weight', 0);
                  }
                }}
              />
            </div>
            <div className="md:col-span-1">
              <Label htmlFor={`rpe-${setIndex}`} className="flex items-center">
                <Activity
                  className="h-4 w-4 mr-1"
                  style={{ color: '#10b981' }}
                />{' '}
                {t('exercise.editExerciseEntryDialog.rpeLabel', 'RPE')}
              </Label>
              <Input
                id={`rpe-${setIndex}`}
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={set.rpe ?? ''}
                onChange={(e) => {
                  const val =
                    e.target.value === '' ? undefined : Number(e.target.value);
                  handleSetChange(setIndex, 'rpe', val);
                }}
                placeholder="1-10"
              />
            </div>
            <div className="md:col-span-1">
              <Label
                htmlFor={`duration-${setIndex}`}
                className="flex items-center"
              >
                <Timer className="h-4 w-4 mr-1" style={{ color: '#f97316' }} />{' '}
                {t(
                  'exercise.editExerciseEntryDialog.durationLabel',
                  'Duration (min)'
                )}
              </Label>
              <Input
                id={`duration-${setIndex}`}
                type="number"
                value={set.duration ?? ''}
                onChange={(e) =>
                  handleSetChange(setIndex, 'duration', Number(e.target.value))
                }
              />
            </div>
            <div className="md:col-span-1">
              <Label htmlFor={`rest-${setIndex}`} className="flex items-center">
                <Timer className="h-4 w-4 mr-1" style={{ color: '#8b5cf6' }} />{' '}
                {t('exercise.editExerciseEntryDialog.restLabel', 'Rest (s)')}
              </Label>
              <Input
                id={`rest-${setIndex}`}
                type="number"
                value={set.rest_time ?? ''}
                onChange={(e) =>
                  handleSetChange(setIndex, 'rest_time', Number(e.target.value))
                }
              />
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDuplicateSet(setIndex)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveSet(setIndex)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className="pl-8">
          <Label htmlFor={`notes-${setIndex}`}>
            {t('exercise.editExerciseEntryDialog.notesLabel', 'Notes')}
          </Label>
          <Textarea
            id={`notes-${setIndex}`}
            value={set.notes ?? ''}
            onChange={(e) => handleSetChange(setIndex, 'notes', e.target.value)}
            className="h-16"
          />
        </div>
      </div>
    );
  }
);
