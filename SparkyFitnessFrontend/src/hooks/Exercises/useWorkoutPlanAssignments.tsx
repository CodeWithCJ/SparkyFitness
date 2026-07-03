// hooks/Exercises/useWorkoutPlanAssignments.ts
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/use-toast';
import { debug } from '@/utils/logging';
import { generateClientId } from '@/utils/generateClientId';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import type {
  WorkoutPlanTemplate,
  WorkoutPlanAssignment,
  WorkoutPreset,
  WorkoutPresetSet,
} from '@/types/workout';
import type { Exercise } from '@/types/exercises';
import { useWorkoutPresets } from '@/hooks/Exercises/useWorkoutPresets';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/hooks/useAuth';

export function useWorkoutPlanAssignments(
  initialData?: WorkoutPlanTemplate | null
) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { weightUnit, loggingLevel, convertWeight } = usePreferences();

  const { data: presetData } = useWorkoutPresets(user?.id);
  const workoutPresets = useMemo(
    () => presetData?.pages.flatMap((page) => page.presets) ?? [],
    [presetData]
  );

  const [assignments, setAssignments] = useState<WorkoutPlanAssignment[]>(
    () =>
      initialData?.assignments?.map((a) => ({
        ...a,
        id: a.id ? String(a.id) : generateClientId(),
        sets:
          a.sets?.map((s) => ({
            ...s,
            id: s.id ? String(s.id) : generateClientId(),
            weight: parseFloat(
              convertWeight(s.weight ?? 0, 'kg', weightUnit).toFixed(1)
            ),
          })) || [],
      })) || []
  );

  const [copiedAssignment, setCopiedAssignment] =
    useState<WorkoutPlanAssignment | null>(null);

  const [isAddExerciseDialogOpen, setIsAddExerciseDialogOpen] = useState(false);
  const [selectedDayForAssignment, setSelectedDayForAssignment] = useState<
    number | null
  >(null);

  const handleRemoveAssignment = useCallback((index: number) => {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSetChangeInPlan = useCallback(
    (
      assignmentIndex: number,
      setIndex: number,
      field: keyof WorkoutPresetSet,
      value: WorkoutPresetSet[keyof WorkoutPresetSet]
    ) => {
      debug(
        loggingLevel,
        `[useWorkoutPlanAssignments] handleSetChangeInPlan: assignmentIndex=${assignmentIndex}, setIndex=${setIndex}, field=${field}, value=${value}`
      );
      setAssignments((prev) =>
        prev.map((assignment, aIndex) => {
          if (aIndex !== assignmentIndex || !assignment.sets) return assignment;
          return {
            ...assignment,
            sets: assignment.sets.map((set, sIndex) =>
              sIndex !== setIndex ? set : { ...set, [field]: value }
            ),
          };
        })
      );
    },
    [loggingLevel]
  );

  const handleAddSetInPlan = useCallback((assignmentIndex: number) => {
    setAssignments((prev) =>
      prev.map((assignment, aIndex) => {
        if (aIndex !== assignmentIndex || !assignment.sets?.length)
          return assignment;
        const lastSet = assignment.sets[assignment.sets.length - 1];
        if (!lastSet) return assignment;
        return {
          ...assignment,
          sets: [
            ...assignment.sets,
            {
              ...lastSet,
              id: generateClientId(),
              set_number: assignment.sets.length + 1,
            },
          ],
        };
      })
    );
  }, []);

  const handleDuplicateSetInPlan = useCallback(
    (assignmentIndex: number, setIndex: number) => {
      setAssignments((prev) =>
        prev.map((assignment, aIndex) => {
          if (aIndex !== assignmentIndex || !assignment.sets) return assignment;
          const setToDuplicate = assignment.sets[setIndex];
          if (!setToDuplicate) return assignment;
          const newSets = [
            ...assignment.sets.slice(0, setIndex + 1),
            { ...setToDuplicate, id: generateClientId() },
            ...assignment.sets.slice(setIndex + 1),
          ].map((s, i) => ({ ...s, set_number: i + 1 }));
          return { ...assignment, sets: newSets };
        })
      );
    },
    []
  );

  const handleRemoveSetInPlan = useCallback(
    (assignmentIndex: number, setIndex: number) => {
      setAssignments((prev) =>
        prev
          .map((assignment, aIndex) => {
            if (aIndex !== assignmentIndex || !assignment.sets)
              return assignment;
            return {
              ...assignment,
              sets: assignment.sets
                .filter((_, sIndex) => sIndex !== setIndex)
                .map((s, i) => ({ ...s, set_number: i + 1 })),
            };
          })
          .filter(
            (assignment) =>
              !assignment.exercise_id ||
              (assignment.sets && assignment.sets.length > 0)
          )
      );
    },
    []
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      // Assignment reordering
      const activeAssignmentIdx = assignments.findIndex(
        (a) => String(a.id) === activeId
      );
      if (activeAssignmentIdx !== -1) {
        const overAssignmentIdx = assignments.findIndex(
          (a) => String(a.id) === overId
        );
        if (overAssignmentIdx !== -1) {
          const activeAssignment = assignments[activeAssignmentIdx];
          const overAssignment = assignments[overAssignmentIdx];

          if (activeAssignment?.day_of_week !== overAssignment?.day_of_week) {
            setAssignments((prev) => {
              const sourceItem = prev[activeAssignmentIdx];
              if (!sourceItem) return prev;
              const newItems = [...prev];
              const item: WorkoutPlanAssignment = {
                ...sourceItem,
                day_of_week:
                  overAssignment?.day_of_week ?? sourceItem.day_of_week,
                template_id: sourceItem.template_id ?? '',
              };
              newItems.splice(activeAssignmentIdx, 1);
              const newOverIdx = newItems.findIndex(
                (a) => String(a.id) === overId
              );
              newItems.splice(newOverIdx, 0, item);
              return newItems;
            });
          } else {
            setAssignments((items) =>
              arrayMove(items, activeAssignmentIdx, overAssignmentIdx)
            );
          }
          return;
        }
      }

      // Set reordering within an assignment
      const setParentIdx = assignments.findIndex((a) =>
        a.sets?.some((s) => String(s.id) === activeId)
      );
      if (setParentIdx !== -1) {
        const overSetAssignmentIdx = assignments.findIndex((a) =>
          a.sets?.some((s) => String(s.id) === overId)
        );
        if (setParentIdx === overSetAssignmentIdx) {
          setAssignments((prev) =>
            prev.map((a, idx) => {
              if (idx !== setParentIdx) return a;
              const oldIndex = a.sets.findIndex(
                (s) => String(s.id) === activeId
              );
              const newIndex = a.sets.findIndex((s) => String(s.id) === overId);
              if (oldIndex === -1 || newIndex === -1) return a;
              return {
                ...a,
                sets: arrayMove(a.sets, oldIndex, newIndex).map((s, i) => ({
                  ...s,
                  set_number: i + 1,
                })),
              };
            })
          );
        }
      }
    },
    [assignments]
  );

  const handleAddExerciseOrPreset = useCallback(
    (
      item: Exercise | WorkoutPreset,
      sourceMode: 'internal' | 'external' | 'custom' | 'preset'
    ) => {
      if (selectedDayForAssignment === null) return;

      if (sourceMode === 'preset') {
        const preset = item as WorkoutPreset;
        setAssignments((prev) => [
          ...prev,
          {
            id: generateClientId(),
            day_of_week: selectedDayForAssignment,
            template_id: '',
            workout_preset_id: preset.id as string,
            exercise_id: undefined,
            sets: [],
          },
        ]);
      } else {
        const exercise = item as Exercise;
        setAssignments((prev) => [
          ...prev,
          {
            id: generateClientId(),
            day_of_week: selectedDayForAssignment,
            template_id: '',
            workout_preset_id: undefined,
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            sets: [
              {
                id: generateClientId(),
                set_number: 1,
                set_type: 'Working Set',
                reps: 10,
                weight: 0,
              },
            ],
          },
        ]);
      }
      setIsAddExerciseDialogOpen(false);
      setSelectedDayForAssignment(null);
    },
    [selectedDayForAssignment]
  );

  const handleCopyAssignment = useCallback(
    (assignment: WorkoutPlanAssignment) => {
      setCopiedAssignment({ ...assignment });
      toast({
        title: t('addWorkoutPlanDialog.copiedToastTitle', 'Copied!'),
        description: t('addWorkoutPlanDialog.copiedToastDescription', {
          itemName:
            assignment.exercise_name ||
            `${t('addWorkoutPlanDialog.presetLabel', 'Preset:')} ${
              workoutPresets.find((p) => p.id === assignment.workout_preset_id)
                ?.name
            }`,
        }),
      });
    },
    [t, workoutPresets]
  );

  const handlePasteAssignment = useCallback(
    (dayOfWeek: number) => {
      if (!copiedAssignment) return;
      const newAssignment: WorkoutPlanAssignment = {
        ...copiedAssignment,
        id: generateClientId(),
        day_of_week: dayOfWeek,
        template_id: '',
        sets:
          copiedAssignment.sets?.map((s) => ({
            ...s,
            id: generateClientId(),
          })) || [],
      };
      setAssignments((prev) => [...prev, newAssignment]);
      toast({
        title: t('addWorkoutPlanDialog.pastedToastTitle', 'Pasted!'),
        description: t('addWorkoutPlanDialog.pastedToastDescription', {
          itemName:
            newAssignment.exercise_name ||
            `${t('addWorkoutPlanDialog.presetLabel', 'Preset:')} ${
              workoutPresets.find(
                (p) => p.id === newAssignment.workout_preset_id
              )?.name
            }`,
        }),
      });
    },
    [copiedAssignment, t, workoutPresets]
  );

  const buildAssignmentsForSave = useCallback(
    () =>
      assignments
        .filter((a) => a.workout_preset_id || a.exercise_id)
        .map((a) => {
          const dayAssignments = assignments.filter(
            (da) => da.day_of_week === a.day_of_week
          );
          return {
            ...a,
            sort_order: dayAssignments.indexOf(a),
            sets:
              a.sets?.map((s) => ({
                ...s,
                weight: s.weight
                  ? convertWeight(s.weight, weightUnit, 'kg')
                  : 0,
              })) || [],
          };
        }),
    [assignments, convertWeight, weightUnit]
  );

  return {
    assignments,
    copiedAssignment,
    workoutPresets,
    isAddExerciseDialogOpen,
    setIsAddExerciseDialogOpen,
    selectedDayForAssignment,
    setSelectedDayForAssignment,
    handleRemoveAssignment,
    handleSetChangeInPlan,
    handleAddSetInPlan,
    handleDuplicateSetInPlan,
    handleRemoveSetInPlan,
    handleDragEnd,
    handleAddExerciseOrPreset,
    handleCopyAssignment,
    handlePasteAssignment,
    buildAssignmentsForSave,
  };
}
