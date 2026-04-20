import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { UnitInput } from '@/components/ui/UnitInput';
import { GripVertical, Copy, Trash2, MessageSquare } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { excerciseWorkoutSetTypes } from '@/constants/excerciseWorkoutSetTypes';
import { SetFieldKey, SortableSetData } from '@/types/workout';
import { SET_TYPE_STYLES } from '@/constants/exercises';

interface SortableSetItemProps {
  id: string;
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
    id,
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
        id,
      });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const hasNotes = !!set.notes;
    const typeBadgeClass =
      SET_TYPE_STYLES[set.set_type ?? ''] ?? 'bg-muted text-muted-foreground';

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="group flex flex-col"
        {...attributes}
      >
        <div className="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-muted/50 transition-colors">
          {/* Drag handle */}
          <div {...listeners} className="cursor-grab shrink-0">
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          </div>

          <div className="grid grid-cols-[20px_140px_1fr_1fr_1fr_1fr_1fr_72px] gap-1.5 grow">
            {/* Set number badge */}
            <div className="h-8 flex items-center justify-center rounded-md border border-border/50 bg-muted text-xs font-semibold text-muted-foreground">
              {set.set_number}
            </div>

            {/* Type select with colored badge */}
            <Select
              value={set.set_type || ''}
              onValueChange={(v) =>
                onSetChange(exerciseIndex, setIndex, 'set_type', v)
              }
            >
              <SelectTrigger className="h-8 text-xs font-medium px-2">
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-[11px] font-medium truncate',
                    typeBadgeClass
                  )}
                >
                  {set.set_type || <SelectValue />}
                </span>
              </SelectTrigger>
              <SelectContent>
                {excerciseWorkoutSetTypes.map((type: string) => (
                  <SelectItem key={type} value={type}>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded-full text-[11px] font-medium',
                        SET_TYPE_STYLES[type] ??
                          'bg-muted text-muted-foreground'
                      )}
                    >
                      {t('workout.setType.' + type, type)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Reps / Hold */}
            <Input
              className="h-8 text-sm"
              type="number"
              placeholder="—"
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

            {/* Weight */}
            <UnitInput
              value={set.weight ?? ''}
              inputClassName="h-8"
              unit={weightUnit}
              type="weight"
              placeholder="—"
              onChange={(v) =>
                onSetChange(exerciseIndex, setIndex, 'weight', v)
              }
            />

            {/* RPE */}
            <Input
              className="h-8 text-sm"
              type="number"
              min="0"
              max="10"
              step="0.5"
              placeholder="—"
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

            {/* Duration */}
            <Input
              className="h-8 text-sm"
              type="number"
              placeholder="—"
              value={set.duration ?? ''}
              onChange={(e) =>
                onSetChange(
                  exerciseIndex,
                  setIndex,
                  'duration',
                  e.target.value === '' ? undefined : Number(e.target.value)
                )
              }
            />

            {/* Rest */}
            <Input
              className="h-8 text-sm"
              type="number"
              placeholder="—"
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

            {/* Actions — hidden until row hover */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7',
                  (hasNotes || showNotes) && 'text-blue-500'
                )}
                onClick={() => setShowNotes(!showNotes)}
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDuplicateSet(exerciseIndex, setIndex)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive/60 hover:text-destructive"
                onClick={() => onRemoveSet(exerciseIndex, setIndex)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Notes */}
        {showNotes && (
          <div className="pl-9 pr-1 pb-1">
            <Input
              className="h-7 text-xs bg-muted/50 italic placeholder:not-italic"
              placeholder={t(
                'workout.notesPlaceholder',
                'Add a note for this set...'
              )}
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
