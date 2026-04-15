import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { UnitInput } from '@/components/ui/UnitInput';
import {
  GripVertical,
  Repeat,
  Dumbbell,
  Hourglass,
  Timer,
  Copy,
  X,
  MessageSquare,
  Activity,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { excerciseWorkoutSetTypes } from '@/constants/excerciseWorkoutSetTypes';
import { SetFieldKey, SortableSetData } from '@/types/workout';

interface SortableSetItemProps {
  set: SortableSetData;
  exerciseIndex: number;
  setIndex: number;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: SetFieldKey,
    value: string | number | null | undefined
  ) => void;
  onDuplicateSet: (exerciseIndex: number, setIndex: number) => void;
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void;
  weightUnit: string;
}

export const SortableSetItem = React.memo(
  ({
    set,
    exerciseIndex,
    setIndex,
    onSetChange,
    onDuplicateSet,
    onRemoveSet,
    weightUnit,
  }: SortableSetItemProps) => {
    const { t } = useTranslation();
    const [showNotes, setShowNotes] = useState(!!set.notes);
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({
        id: set.id?.toString() || `set-${setIndex}`,
      });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex flex-col space-y-1 py-1"
        {...attributes}
      >
        <div className="flex items-center space-x-2">
          <div {...listeners} className="mt-5">
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-10 gap-2 grow items-end">
            <div className="md:col-span-1 flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">
                {t('workout.set', 'Set')}
              </Label>
              <div className="h-8 flex items-center font-bold text-sm px-1 leading-none">
                {set.set_number}
              </div>
            </div>

            <div className="md:col-span-2 flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">
                {t('workout.type', 'Type')}
              </Label>
              <Select
                value={set.set_type || ''}
                onValueChange={(v) =>
                  onSetChange(exerciseIndex, setIndex, 'set_type', v)
                }
              >
                <SelectTrigger className="h-8 text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {excerciseWorkoutSetTypes.map((type: string) => (
                    <SelectItem key={type} value={type}>
                      {t('workout.setType.' + type, type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-1 flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
                <Repeat className="h-3 w-3 mr-1 text-blue-500" />{' '}
                {t('workout.reps', 'Reps')}
              </Label>
              <Input
                className="h-8 text-sm"
                type="number"
                value={set.reps ?? ''}
                onChange={(e) =>
                  onSetChange(
                    exerciseIndex,
                    setIndex,
                    'reps',
                    e.target.value === '' ? undefined : Number(e.target.value)
                  )
                }
              />
            </div>

            <div className="md:col-span-2 flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
                <Dumbbell className="h-3 w-3 mr-1 text-red-500" /> {weightUnit}
              </Label>
              <UnitInput
                className="h-8 text-sm m-0 p-0"
                value={set.weight ?? 0}
                unit={weightUnit}
                type="weight"
                onChange={(v) =>
                  onSetChange(exerciseIndex, setIndex, 'weight', v)
                }
              />
            </div>

            <div className="md:col-span-1 flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
                <Activity className="h-3 w-3 mr-1 text-emerald-500" />{' '}
                {t('workout.rpe', 'RPE')}
              </Label>
              <Input
                className="h-8 text-sm"
                type="number"
                min="0"
                max="10"
                step="0.5"
                placeholder="1-10"
                value={set.rpe ?? ''}
                onChange={(e) =>
                  onSetChange(
                    exerciseIndex,
                    setIndex,
                    'rpe',
                    e.target.value === '' ? null : Number(e.target.value)
                  )
                }
              />
            </div>

            <div className="md:col-span-1 flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
                <Hourglass className="h-3 w-3 mr-1 text-orange-500" />{' '}
                {t('workout.min', 'Min')}
              </Label>
              <Input
                className="h-8 text-sm"
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

            <div className="md:col-span-1 flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center">
                <Timer className="h-3 w-3 mr-1 text-purple-500" />{' '}
                {t('workout.sec', 'Sec')}
              </Label>
              <Input
                className="h-8 text-sm"
                type="number"
                value={set.rest_time ?? ''}
                onChange={(e) =>
                  onSetChange(
                    exerciseIndex,
                    setIndex,
                    'rest_time',
                    e.target.value === '' ? undefined : Number(e.target.value)
                  )
                }
              />
            </div>

            <div className="md:col-span-1 flex items-center justify-end h-8 gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowNotes(!showNotes)}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onDuplicateSet(exerciseIndex, setIndex)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => onRemoveSet(exerciseIndex, setIndex)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        {showNotes && (
          <div className="pl-6 pt-1">
            <Input
              className="h-8 text-xs bg-muted/50 italic"
              placeholder="Notes..."
              value={set.notes ?? ''}
              onChange={(e) =>
                onSetChange(exerciseIndex, setIndex, 'notes', e.target.value)
              }
            />
          </div>
        )}
      </div>
    );
  }
);
