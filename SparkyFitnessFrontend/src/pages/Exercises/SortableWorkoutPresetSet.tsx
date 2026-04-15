import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UnitInput } from '@/components/ui/UnitInput';
import { WorkoutPresetSet } from '@/types/workout';
import { useSortable } from '@dnd-kit/sortable';
import {
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  GripVertical,
  Repeat,
  Dumbbell,
  Hourglass,
  Timer,
  Copy,
  X,
} from 'lucide-react';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';

export const SortableSetItem = ({
  set,
  exerciseIndex,
  setIndex,
  onSetChange,
  onDuplicateSet,
  onRemoveSet,
  weightUnit,
}: {
  set: WorkoutPresetSet;
  exerciseIndex: number;
  setIndex: number;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: keyof WorkoutPresetSet,
    value: WorkoutPresetSet[keyof WorkoutPresetSet]
  ) => void;
  onDuplicateSet: (exerciseIndex: number, setIndex: number) => void;
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void;
  weightUnit: string;
}) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: set.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col space-y-2"
      {...attributes}
    >
      <div className="flex items-center space-x-2">
        <div {...listeners}>
          <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-8 gap-2 grow items-center">
          <div className="md:col-span-1">
            <Label>{t('workoutPresetForm.setLabel', 'Set')}</Label>
            <p className="font-medium p-2">{set.set_number}</p>
          </div>
          <div className="md:col-span-2">
            <Label>{t('workoutPresetForm.typeLabel', 'Type')}</Label>
            <Select
              value={set.set_type || undefined}
              onValueChange={(value) =>
                onSetChange(exerciseIndex, setIndex, 'set_type', value)
              }
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t(
                    'workoutPresetForm.setTypePlaceholder',
                    'Set Type'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Working Set">
                  {t('workoutPresetForm.workingSet', 'Working Set')}
                </SelectItem>
                <SelectItem value="Warm-up">
                  {t('workoutPresetForm.warmUp', 'Warm-up')}
                </SelectItem>
                <SelectItem value="Drop Set">
                  {t('workoutPresetForm.dropSet', 'Drop Set')}
                </SelectItem>
                <SelectItem value="Failure">
                  {t('workoutPresetForm.failure', 'Failure')}
                </SelectItem>
                <SelectItem value="AMRAP">
                  {t('workoutPresetForm.amrap', 'AMRAP')}
                </SelectItem>
                <SelectItem value="Back-off">
                  {t('workoutPresetForm.backOff', 'Back-off')}
                </SelectItem>
                <SelectItem value="Rest-Pause">
                  {t('workoutPresetForm.restPause', 'Rest-Pause')}
                </SelectItem>
                <SelectItem value="Cluster">
                  {t('workoutPresetForm.cluster', 'Cluster')}
                </SelectItem>
                <SelectItem value="Technique">
                  {t('workoutPresetForm.technique', 'Technique')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label
              htmlFor={`reps-${exerciseIndex}-${set.id}`}
              className="flex items-center"
            >
              <Repeat className="h-4 w-4 mr-1" style={{ color: '#3b82f6' }} />{' '}
              {t('workoutPresetForm.repsLabel', 'Reps')}
            </Label>
            <Input
              id={`reps-${exerciseIndex}-${set.id}`}
              type="number"
              value={set.reps ?? ''}
              onChange={(e) =>
                onSetChange(
                  exerciseIndex,
                  setIndex,
                  'reps',
                  Number(e.target.value)
                )
              }
            />
          </div>
          <div className="md:col-span-1">
            <Label
              htmlFor={`weight-${exerciseIndex}-${set.id}`}
              className="flex items-center"
            >
              <Dumbbell className="h-4 w-4 mr-1" style={{ color: '#ef4444' }} />{' '}
              {t('workoutPresetForm.weightLabel', 'Weight')} ({weightUnit})
            </Label>
            <UnitInput
              id={`weight-${exerciseIndex}-${set.id}`}
              type="weight"
              unit={weightUnit}
              value={set.weight ?? 0}
              onChange={(metricValue) =>
                onSetChange(exerciseIndex, setIndex, 'weight', metricValue)
              }
            />
          </div>
          <div className="md:col-span-1">
            <Label
              htmlFor={`duration-${exerciseIndex}-${set.id}`}
              className="flex items-center"
            >
              <Hourglass
                className="h-4 w-4 mr-1"
                style={{ color: '#f97316' }}
              />{' '}
              {t('workoutPresetForm.durationLabel', 'Duration (min)')}
            </Label>{' '}
            <Input
              id={`duration-${exerciseIndex}-${set.id}`}
              type="number"
              value={set.duration ?? ''}
              onChange={(e) =>
                onSetChange(
                  exerciseIndex,
                  setIndex,
                  'duration',
                  Number(e.target.value)
                )
              }
            />
          </div>
          <div className="md:col-span-1">
            <Label
              htmlFor={`rest-${exerciseIndex}-${set.id}`}
              className="flex items-center"
            >
              <Timer className="h-4 w-4 mr-1" style={{ color: '#8b5cf6' }} />{' '}
              {t('workoutPresetForm.restLabel', 'Rest (s)')}
            </Label>
            <Input
              id={`rest-${exerciseIndex}-${set.id}`}
              type="number"
              value={set.rest_time ?? ''}
              onChange={(e) =>
                onSetChange(
                  exerciseIndex,
                  setIndex,
                  'rest_time',
                  Number(e.target.value)
                )
              }
            />
          </div>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDuplicateSet(exerciseIndex, setIndex)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemoveSet(exerciseIndex, setIndex)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="pl-8">
        <Label htmlFor={`notes-${exerciseIndex}-${set.id}`}>
          {t('workoutPresetForm.notesLabel', 'Notes')}
        </Label>
        <Textarea
          id={`notes-${exerciseIndex}-${set.id}`}
          value={set.notes ?? ''}
          onChange={(e) =>
            onSetChange(exerciseIndex, setIndex, 'notes', e.target.value)
          }
        />
      </div>
    </div>
  );
};
