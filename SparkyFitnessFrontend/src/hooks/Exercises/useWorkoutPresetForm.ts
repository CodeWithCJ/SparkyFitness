import { useState, useCallback } from 'react';

import type {
  WorkoutPreset,
  WorkoutPresetExercise,
  WorkoutPresetSet,
} from '@/types/workout';
import { generateClientId } from '@/utils/generateClientId';
import { debug } from '@/utils/logging';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';

import { Exercise } from '@/types/exercises';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '../use-toast';
import { useTranslation } from 'react-i18next';
import { resolveExerciseModality } from '@workspace/shared';
import { defaultSetForModality } from '@/constants/exercises';

interface WorkoutPresetFormProps {
  onSave: (
    preset: Omit<WorkoutPreset, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ) => void;
  initialPreset?: WorkoutPreset | null;
}

export function useWorkoutPresetForm({
  initialPreset,
  onSave,
}: WorkoutPresetFormProps) {
  const { loggingLevel } = usePreferences();
  const { t } = useTranslation();
  const [name, setName] = useState(initialPreset?.name || '');
  const [description, setDescription] = useState(
    initialPreset?.description || ''
  );
  const [isPublic, setIsPublic] = useState(initialPreset?.is_public ?? false);
  const [exercises, setExercises] = useState<WorkoutPresetExercise[]>(() => {
    return (
      initialPreset?.exercises.map((ex) => ({
        ...ex,
        id: ex.id ? String(ex.id) : generateClientId(),
        sets: ex.sets.map((set) => ({
          ...set,
          id: set.id ? String(set.id) : generateClientId(),
          // Keep metric (kg); null means no weight (e.g. a time-only set).
          weight: set.weight != null ? Number(set.weight) : null,
        })),
      })) || []
    );
  });
  const [isAddExerciseDialogOpen, setIsAddExerciseDialogOpen] = useState(false);
  // While set, the next AddExerciseDialog selection swaps this entry's
  // exercise identity in place instead of appending a new one. Cleared on
  // every plain "Add Exercise" open so a cancelled replace can't misroute a
  // later add; overwritten (not accumulated) by opening Replace on another row.
  const [replaceTargetIndex, setReplaceTargetIndex] = useState<number | null>(
    null
  );

  const handleAddExercise = (exercise: Exercise | undefined) => {
    if (exercise) {
      const modality = resolveExerciseModality(
        exercise.modality,
        exercise.category
      );
      const imageUrl =
        exercise.images && exercise.images.length > 0 ? exercise.images[0] : '';
      if (replaceTargetIndex !== null) {
        // Swap the exercise identity in place, keeping the entry's already
        // configured sets — the whole point of replace over remove-then-add.
        // Only safe when the modality is unchanged, but a duration-only
        // set carries `reps: null`, and a weight_reps set carries a
        // `duration`/no `reps` default, reusing those fields across a
        // modality change would either show a blank reps column instead of
        // the default, or silently keep a stale field the new modality's UI
        // hides, but the server still persists. On a modality change, reset
        // to a fresh default set for the new modality instead.
        setExercises((prev) =>
          prev.map((ex, index) => {
            if (index !== replaceTargetIndex) {
              return ex;
            }
            const modalityChanged = modality !== ex.modality;
            return {
              ...ex,
              exercise_id: exercise.id,
              exercise_name: exercise.name,
              image_url: imageUrl,
              exercise,
              category: exercise.category ?? '',
              modality,
              sets: modalityChanged
                ? [
                    {
                      ...defaultSetForModality(modality),
                      id: generateClientId(),
                    },
                  ]
                : ex.sets,
            };
          })
        );
      } else {
        const newExercise: WorkoutPresetExercise = {
          id: generateClientId(), // Stable ID for DND
          exercise_id: exercise.id,
          exercise_name: exercise.name,
          image_url: imageUrl,
          exercise: exercise,
          sets: [
            { ...defaultSetForModality(modality), id: generateClientId() },
          ],
          category: exercise.category ?? '',
          modality,
        };
        setExercises((prev) => [...prev, newExercise]);
      }
    }
    setReplaceTargetIndex(null);
    setIsAddExerciseDialogOpen(false);
  };

  const handleOpenAddExercise = () => {
    setReplaceTargetIndex(null);
    setIsAddExerciseDialogOpen(true);
  };

  const handleOpenReplaceExercise = (exerciseIndex: number) => {
    setReplaceTargetIndex(exerciseIndex);
    setIsAddExerciseDialogOpen(true);
  };

  const handleRemoveExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDuplicateExercise = useCallback((exerciseIndex: number) => {
    setExercises((prev) => {
      const exerciseToDuplicate = prev[exerciseIndex];
      if (!exerciseToDuplicate) {
        return prev;
      }
      const duplicate: WorkoutPresetExercise = {
        ...exerciseToDuplicate,
        id: generateClientId(),
        // The web editor has no superset UI, so silently carrying the
        // original's superset_group forward would join the copy to the same
        // superset with no way for the user to see or intend that (mobile
        // clears it for the same reason, inserting the copy after the whole
        // run instead).
        superset_group: null,
        sets: exerciseToDuplicate.sets.map((set) => ({
          ...set,
          id: generateClientId(),
          completed_at: null,
          is_pr: false,
        })),
      };
      return [
        ...prev.slice(0, exerciseIndex + 1),
        duplicate,
        ...prev.slice(exerciseIndex + 1),
      ];
    });
  }, []);

  const handleSetChange = useCallback(
    (
      exerciseIndex: number,
      setIndex: number,
      field: keyof WorkoutPresetSet,
      value: WorkoutPresetSet[keyof WorkoutPresetSet]
    ) => {
      setExercises((prev) =>
        prev.map((exercise, eIndex) => {
          if (eIndex !== exerciseIndex) {
            return exercise;
          }
          return {
            ...exercise,
            sets: exercise.sets.map((set, sIndex) => {
              if (sIndex !== setIndex) {
                return set;
              }
              return { ...set, [field]: value };
            }),
          };
        })
      );
    },
    []
  );

  const handleAddSet = useCallback((exerciseIndex: number) => {
    setExercises((prev) =>
      prev.map((exercise, eIndex) => {
        if (eIndex !== exerciseIndex) {
          return exercise;
        }
        const lastSet = exercise.sets[exercise.sets.length - 1];
        if (!lastSet) {
          return exercise;
        }
        const newSet: WorkoutPresetSet = {
          ...lastSet,
          id: generateClientId(),
          set_number: exercise.sets.length + 1,
        };
        return {
          ...exercise,
          sets: [...exercise.sets, newSet],
        };
      })
    );
  }, []);

  const handleDuplicateSet = useCallback(
    (exerciseIndex: number, setIndex: number) => {
      setExercises((prev) =>
        prev.map((exercise, eIndex) => {
          if (eIndex !== exerciseIndex) {
            return exercise;
          }
          const sets = exercise.sets;
          const setToDuplicate = sets[setIndex];
          if (!setToDuplicate) {
            return exercise;
          }
          const newSets = [
            ...sets.slice(0, setIndex + 1),
            { ...setToDuplicate, id: generateClientId() },
            ...sets.slice(setIndex + 1),
          ].map((s, i) => ({ ...s, set_number: i + 1 }));
          return { ...exercise, sets: newSets };
        })
      );
    },
    []
  );

  const handleRemoveSet = useCallback(
    (exerciseIndex: number, setIndex: number) => {
      setExercises((prev) => {
        const newState = prev.map((exercise, eIndex) => {
          if (eIndex === exerciseIndex) {
            const newSets = exercise.sets
              .filter((_, sIndex) => sIndex !== setIndex)
              .map((s, i) => ({ ...s, set_number: i + 1 }));
            return { ...exercise, sets: newSets };
          }
          return exercise;
        });
        return newState.filter((exercise) => exercise.sets.length > 0);
      });
    },
    []
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    setExercises((prevExercises) => {
      const newExercises = [...prevExercises];

      // Try reordering exercises first
      const activeExerciseIdx = newExercises.findIndex(
        (ex) => String(ex.id) === activeId
      );
      const overExerciseIdx = newExercises.findIndex(
        (ex) => String(ex.id) === overId
      );

      if (activeExerciseIdx !== -1 && overExerciseIdx !== -1) {
        return arrayMove(newExercises, activeExerciseIdx, overExerciseIdx).map(
          (ex, index) => ({
            ...ex,
            sort_order: index,
          })
        );
      }

      // If not exercises, check if it's a set reorder within the same exercise
      const activeSetParentIdx = newExercises.findIndex((ex) =>
        ex.sets.some((s) => String(s.id) === activeId)
      );
      const overSetParentIdx = newExercises.findIndex((ex) =>
        ex.sets.some((s) => String(s.id) === overId)
      );

      if (
        activeSetParentIdx !== -1 &&
        overSetParentIdx !== -1 &&
        activeSetParentIdx === overSetParentIdx
      ) {
        const exercise = newExercises[activeSetParentIdx];
        if (!exercise) {
          return prevExercises;
        }
        const oldSetIdx = exercise.sets.findIndex(
          (s) => String(s.id) === activeId
        );
        const newSetIdx = exercise.sets.findIndex(
          (s) => String(s.id) === overId
        );

        if (oldSetIdx !== -1 && newSetIdx !== -1) {
          const reorderedSets = arrayMove(exercise.sets, oldSetIdx, newSetIdx);
          newExercises[activeSetParentIdx] = {
            ...exercise,
            sets: reorderedSets.map((set, index) => ({
              ...set,
              set_number: index + 1,
            })),
          };
        }
      }

      return newExercises;
    });
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        title: t('workoutPresetForm.validationErrorTitle', 'Validation Error'),
        description: t(
          'workoutPresetForm.nameRequiredError',
          'Preset Name is required.'
        ),
        variant: 'destructive',
      });
      return;
    }
    debug(loggingLevel, 'WorkoutPresetForm: Submitting preset with data:', {
      name,
      description,
      isPublic,
      exercises,
    });
    onSave({
      name,
      description,
      is_public: isPublic,
      exercises: exercises.map((ex, index) => ({
        ...ex,
        sort_order: index,
        sets: ex.sets.map((set) => ({
          ...set,
          weight: set.weight ?? null, // already metric (kg) from UnitInput
        })),
      })),
    });
  };

  const handleReorderSets = (
    exerciseIndex: number,
    oldIndex: number,
    newIndex: number
  ) => {
    setExercises((prev) => {
      const newExercises = [...prev];
      const exercise = {
        ...newExercises[exerciseIndex],
      } as (typeof newExercises)[0];

      if (exercise.sets) {
        exercise.sets = arrayMove(exercise.sets, oldIndex, newIndex).map(
          (set, i) => ({
            ...set,
            set_number: i + 1,
          })
        );
      }

      newExercises[exerciseIndex] = exercise;
      return newExercises;
    });
  };

  return {
    name,
    description,
    isPublic,
    exercises,
    isAddExerciseDialogOpen,
    sensors,
    setName,
    setDescription,
    setIsPublic,
    setExercises,
    setIsAddExerciseDialogOpen,
    handleAddExercise,
    handleOpenAddExercise,
    handleOpenReplaceExercise,
    handleRemoveExercise,
    handleDuplicateExercise,
    handleSetChange,
    handleAddSet,
    handleDuplicateSet,
    handleRemoveSet,
    handleDragEnd,
    handleSubmit,
    handleReorderSets,
  };
}
