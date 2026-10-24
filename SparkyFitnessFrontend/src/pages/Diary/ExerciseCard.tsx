import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dumbbell,
  Play,
  Repeat,
  ChevronDown,
  CalendarDays,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import EditExerciseEntryDialog from './EditExerciseEntryDialog';
import LinkSyncedWorkoutDialog from './LinkSyncedWorkoutDialog';
import ExercisePlaybackModal from '@/pages/Diary/ExercisePlaybackModal';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, error } from '@/utils/logging';
import type {
  WorkoutPresetSet,
  WorkoutPreset,
  WorkoutPresetExercise,
  PresetExercise,
  ExerciseToLog,
  WorkoutPlanAssignment,
  WorkoutPlanTemplate,
} from '@/types/workout';
import { formatMinutesToHHMM } from '@/utils/timeFormatters';
import ExerciseEntryDisplay from './ExerciseEntryDisplay';
import ExercisePresetEntryDisplay from './ExercisePresetEntryDisplay';
import EditExerciseDatabaseDialog from './EditExerciseDatabaseDialog';
import AddExerciseDialog from '@/pages/Exercises/AddExerciseDialog';
import LogExerciseEntryDialog from '@/pages/Diary/LogExerciseEntryDialog';
import {
  useDeleteExerciseEntryMutation,
  useDeleteExercisePresetEntryMutation,
  useExerciseEntries,
} from '@/hooks/Exercises/useExerciseEntries';
import { useActiveWorkoutPlans } from '@/hooks/Exercises/useWorkoutPlans';
import RunProgramBanner from './RunProgramBanner';
import {
  useWorkoutPresets,
  workoutPresetByIdOptions,
} from '@/hooks/Exercises/useWorkoutPresets';
import {
  entryCaloriesCounted,
  isCardioModality,
  resolveExerciseCalories,
  resolveExerciseModality,
  setsDurationMinutes,
} from '@workspace/shared';
import { defaultSetForModality } from '@/constants/exercises';
import { generateClientId } from '@/utils/generateClientId';
import { useQueryClient } from '@tanstack/react-query';
import { exerciseByIdOptions } from '@/hooks/Exercises/useExercises';
import {
  createWorkoutPlaybackRouteState,
  createWorkoutPlaybackRouteStateFromExercise,
} from '@/utils/workoutPlayback';
import {
  Exercise,
  ExerciseEntry,
  GroupedExerciseEntry,
} from '@/types/exercises';

// New interface for exercises coming from presets, where sets, reps, and weight are guaranteed
interface PresetExerciseToLog extends Exercise {
  sets: WorkoutPresetSet[];
  reps: number;
  weight: number;
  exercise_name: string;
}

interface ExerciseCardProps {
  selectedDate: string;
  initialExercisesToLog?: PresetExercise[];
  onExercisesLogged: () => void;
}

const ExerciseCard = ({
  selectedDate,
  initialExercisesToLog,
  onExercisesLogged,
}: ExerciseCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeUserId, hasWritePermission } = useActiveUser();
  const canLinkWorkouts = hasWritePermission('diary');
  const { loggingLevel, energyUnit, convertEnergy, getEnergyUnitString } =
    usePreferences();
  debug(
    loggingLevel,
    'ExerciseCard component rendered for date:',
    selectedDate
  );
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addDialogInitialTab, setAddDialogInitialTab] = useState<
    'my-exercises' | 'workout-preset'
  >('my-exercises');
  const [addDialogIntent, setAddDialogIntent] = useState<'log' | 'playback'>(
    'log'
  );
  const [linkEntryId, setLinkEntryId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<ExerciseEntry | null>(null); // Use ExerciseEntry from service
  const [isPlaybackModalOpen, setIsPlaybackModalOpen] = useState(false); // State for playback modal
  const [exerciseToPlay, setExerciseToPlay] = useState<Exercise | null>(null); // State for exercise to play
  const [isLogExerciseDialogOpen, setIsLogExerciseDialogOpen] = useState(false); // State for LogExerciseEntryDialog
  const [exercisesToLogQueue, setExercisesToLogQueue] = useState<
    ExerciseToLog[]
  >([]);
  const [currentExerciseToLog, setCurrentExerciseToLog] =
    useState<ExerciseToLog | null>(null);
  const [
    isEditExerciseDatabaseDialogOpen,
    setIsEditExerciseDatabaseDialogOpen,
  ] = useState(false);
  const [exerciseToEditInDatabase, setExerciseToEditInDatabase] =
    useState<Exercise | null>(null);
  const [selectedSessionMap, setSelectedSessionMap] = useState<
    Record<string | number, string | number>
  >({});

  const currentUserId = activeUserId || user?.id;
  debug(loggingLevel, 'Current user ID:', currentUserId);

  const queryClient = useQueryClient();
  const { mutateAsync: deleteExerciseEntry } = useDeleteExerciseEntryMutation();
  const { mutateAsync: deleteExercisePresetEntry } =
    useDeleteExercisePresetEntryMutation();
  const { data: activePlans = [] } = useActiveWorkoutPlans(
    selectedDate,
    currentUserId
  );

  const { data: presetData } = useWorkoutPresets(currentUserId);
  const workoutPresets = useMemo(() => presetData?.presets ?? [], [presetData]);

  const { data: exerciseEntries, isLoading: loading } = useExerciseEntries(
    selectedDate,
    currentUserId
  );

  const handleStartPlanSession = async (
    targetPlan: WorkoutPlanTemplate,
    assignment: WorkoutPlanAssignment
  ) => {
    if (!targetPlan) return;

    // Collect all assignments in this session
    const isSequential = targetPlan.schedule_type === 'sequential';
    const sessionAssignments = isSequential
      ? targetPlan.assignments?.filter(
          (a: WorkoutPlanAssignment) =>
            (a.session_index ?? 1) === (assignment.session_index ?? 1)
        ) || [assignment]
      : targetPlan.assignments?.filter(
          (a: WorkoutPlanAssignment) => a.day_of_week === assignment.day_of_week
        ) || [assignment];

    const combinedExercises: WorkoutPresetExercise[] = [];

    for (const a of sessionAssignments) {
      if (a.workout_preset_id) {
        let preset = workoutPresets.find(
          (p) => String(p.id) === String(a.workout_preset_id)
        );
        if (!preset) {
          try {
            preset = await queryClient.fetchQuery(
              workoutPresetByIdOptions(a.workout_preset_id)
            );
          } catch (err) {
            error(
              loggingLevel,
              `Failed to fetch preset for session: ${a.workout_preset_id}`,
              err
            );
          }
        }
        if (preset && preset.exercises && preset.exercises.length > 0) {
          combinedExercises.push(
            ...preset.exercises.map((ex) => ({
              ...ex,
              workout_plan_assignment_id: a.id ?? null,
            }))
          );
        }
      } else if (a.exercise_id) {
        try {
          const fullExercise = await queryClient.fetchQuery(
            exerciseByIdOptions(a.exercise_id)
          );
          const modality = resolveExerciseModality(
            fullExercise.modality,
            fullExercise.category
          );
          combinedExercises.push({
            id: String(a.id || generateClientId()),
            exercise_id: fullExercise.id,
            exercise_name: fullExercise.name,
            exercise: fullExercise,
            category: fullExercise.category ?? undefined,
            modality,
            superset_group: null,
            workout_plan_assignment_id: a.id ?? null,
            sets:
              a.sets && a.sets.length > 0
                ? a.sets.map((set: WorkoutPresetSet, sIdx: number) => ({
                    set_number: sIdx + 1,
                    set_type: set.set_type ?? 'normal',
                    reps: set.reps ?? null,
                    weight: set.weight ?? null,
                    duration: set.duration ?? null,
                    distance: isCardioModality(modality)
                      ? (set.distance ?? null)
                      : null,
                    rest_time: isCardioModality(modality)
                      ? 0
                      : (set.rest_time ?? null),
                    notes: set.notes ?? null,
                    rpe: null,
                    completed_at: null,
                  }))
                : [defaultSetForModality(modality)],
          });
        } catch (err) {
          error(
            loggingLevel,
            `Failed to fetch exercise for session: ${a.exercise_id}`,
            err
          );
        }
      }
    }

    if (combinedExercises.length === 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'exerciseCard.noExercisesInPlanSession',
          'No exercises found in this session.'
        ),
        variant: 'destructive',
      });
      return;
    }

    const sessionName =
      assignment.session_name ||
      targetPlan.sequence_position?.session_name ||
      assignment.workout_preset_name ||
      assignment.exercise_name ||
      targetPlan.plan_name;

    const sessionPreset: WorkoutPreset = {
      id: `plan-${targetPlan.id}-session-${assignment.session_index ?? assignment.day_of_week ?? 1}`,
      user_id: currentUserId || '',
      name: sessionName,
      description:
        targetPlan.description ||
        t('diary.exerciseCard.session', '{{plan_name}} session', {
          plan_name: targetPlan.plan_name,
        }),
      exercises: combinedExercises,
    };

    const routeState = createWorkoutPlaybackRouteState(
      sessionPreset,
      selectedDate,
      `${window.location.pathname}${window.location.search}`
    );

    navigate(`/workout-playback?date=${selectedDate}`, {
      state: routeState,
    });
  };

  // Effect to handle initialExercisesToLog prop
  useEffect(() => {
    const processInitialExercises = async () => {
      if (initialExercisesToLog && initialExercisesToLog.length > 0) {
        const fetchedExercises = await Promise.all(
          initialExercisesToLog.map(async (presetEx) => {
            try {
              const fullExercise = await queryClient.fetchQuery(
                exerciseByIdOptions(presetEx.exercise_id)
              );
              // Create WorkoutPresetSet array based on presetEx.sets, reps, and weight
              const sets: WorkoutPresetSet[] = Array.from(
                { length: presetEx.sets },
                (_, i) => ({
                  set_number: i + 1,
                  reps: presetEx.reps,
                  weight: presetEx.weight,
                  set_type: 'Working Set', // Default set type
                })
              );

              return {
                ...fullExercise,
                sets: sets,
                reps: presetEx.reps,
                weight: presetEx.weight,
                exercise_name: presetEx.exercise_name,
              } as PresetExerciseToLog; // Cast to the new interface
            } catch (err) {
              error(
                loggingLevel,
                `Failed to fetch full exercise details for ID ${presetEx.exercise_id}:`,
                err
              );
              return null; // Return null for failed fetches
            }
          })
        );

        const validExercisesToLog: PresetExerciseToLog[] =
          fetchedExercises.filter(
            (ex): ex is PresetExerciseToLog => ex !== null
          );

        if (validExercisesToLog.length > 0) {
          setExercisesToLogQueue(validExercisesToLog);
          const currentExercise = validExercisesToLog[0];
          if (currentExercise) {
            setCurrentExerciseToLog(currentExercise);
          }
          setIsLogExerciseDialogOpen(true);
          setIsAddDialogOpen(false); // Close the add dialog if it's open
        }
      }
    };

    processInitialExercises();
  }, [initialExercisesToLog, loggingLevel, queryClient]);

  const handleOpenAddDialog = () => {
    debug(loggingLevel, 'Opening add exercise dialog.');
    setAddDialogInitialTab('my-exercises');
    setAddDialogIntent('log');
    setIsAddDialogOpen(true);
  };

  const handleStartWorkoutPlayback = () => {
    debug(loggingLevel, 'Opening workout preset selector.');
    setAddDialogInitialTab('workout-preset');
    setAddDialogIntent('playback');
    setIsAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    debug(loggingLevel, 'Closing add exercise dialog.');
    setIsAddDialogOpen(false);
  };

  const handleExerciseSelect = (
    exercise?: Exercise,
    sourceMode?: 'internal' | 'external' | 'custom' | 'preset'
  ) => {
    // If no exercise is provided, it's a general refresh signal
    if (!exercise) {
      debug(
        loggingLevel,
        'General refresh triggered (no specific exercise selected).'
      );
      handleCloseAddDialog(); // Close the add exercise dialog
      return;
    }

    if (addDialogIntent === 'playback') {
      debug(
        loggingLevel,
        `Exercise selected for workout playback from ${sourceMode}:`,
        exercise.id
      );
      const routeState = createWorkoutPlaybackRouteStateFromExercise(
        exercise,
        selectedDate,
        `${window.location.pathname}${window.location.search}`
      );

      handleCloseAddDialog();
      navigate(`/workout-playback?date=${selectedDate}`, {
        state: routeState,
      });
      return;
    }

    debug(
      loggingLevel,
      `Exercise selected in search from ${sourceMode}:`,
      exercise.id
    );
    // When selecting from search, it's a single exercise, so clear queue and set current
    setExercisesToLogQueue([
      { ...exercise, duration: 0, sets: [], reps: 0, weight: 0 },
    ]); // Create a new ExerciseToLog from Exercise, add default duration and empty sets
    setCurrentExerciseToLog({
      ...exercise,
      duration: 0,
      sets: [],
      reps: 0,
      weight: 0,
    });
    setIsLogExerciseDialogOpen(true);
    setIsAddDialogOpen(false);
  };

  const handleWorkoutPresetSelected = (preset: WorkoutPreset) => {
    debug(loggingLevel, 'Workout preset selected in ExerciseCard:', preset);
    const routeState = createWorkoutPlaybackRouteState(
      preset,
      selectedDate,
      `${window.location.pathname}${window.location.search}`
    );

    handleCloseAddDialog();
    navigate(`/workout-playback?date=${selectedDate}`, {
      state: routeState,
    });
  };

  const handleDeleteExerciseEntry = async (entryId: string) => {
    debug(loggingLevel, 'Handling delete individual exercise entry:', entryId);
    try {
      await deleteExerciseEntry(entryId);
      info(
        loggingLevel,
        'Individual exercise entry deleted successfully:',
        entryId
      );
    } catch (err) {
      error(loggingLevel, 'Error deleting individual exercise entry:', err);
    }
  };

  const handleDeleteExercisePresetEntry = async (presetEntryId: string) => {
    debug(
      loggingLevel,
      'Handling delete exercise preset entry:',
      presetEntryId
    );
    try {
      await deleteExercisePresetEntry(presetEntryId);
      info(
        loggingLevel,
        'Exercise preset entry deleted successfully:',
        presetEntryId
      );
    } catch (err) {
      error(loggingLevel, 'Error deleting exercise preset entry:', err);
    }
  };

  const handleEdit = (entry: ExerciseEntry) => {
    // Changed type to ExerciseEntry
    debug(loggingLevel, 'Handling edit exercise entry:', entry.id);
    setEditingEntry(entry);
  };

  const handleEditComplete = () => {
    debug(loggingLevel, 'Handling edit exercise entry complete.');
    setEditingEntry(null);
    info(loggingLevel, 'Exercise entry edit complete and refresh triggered.');
  };

  const handleLogSuccess = () => {
    debug(loggingLevel, 'Exercise logged successfully. Processing queue.');
    // Remove the current exercise from the queue
    const updatedQueue = exercisesToLogQueue.slice(1);
    setExercisesToLogQueue(updatedQueue);

    if (updatedQueue.length > 0) {
      // Open the dialog for the next exercise in the queue
      const currentExercise = updatedQueue[0];
      if (currentExercise) {
        setCurrentExerciseToLog(currentExercise);
      }
      setIsLogExerciseDialogOpen(true);
    } else {
      // All exercises logged, close the dialog
      setCurrentExerciseToLog(null);
      setIsLogExerciseDialogOpen(false);
      onExercisesLogged(); // Signal to parent that exercises have been logged
    }
    handleCloseAddDialog(); // Close the add exercise dialog
  };

  const handleEditExerciseDatabase = useCallback(
    async (exerciseId: string) => {
      debug(
        loggingLevel,
        'Attempting to edit exercise in database:',
        exerciseId
      );
      try {
        const exercise = await queryClient.fetchQuery(
          exerciseByIdOptions(exerciseId)
        );
        setExerciseToEditInDatabase(exercise);
        setIsEditExerciseDatabaseDialogOpen(true);
      } catch (err) {
        error(loggingLevel, 'Failed to fetch exercise for editing:', err);
      }
    },
    [loggingLevel, queryClient]
  );

  const handleSaveExerciseDatabaseEdit = () => {
    debug(loggingLevel, 'Exercise database edit saved. Refreshing entries.');
    setIsEditExerciseDatabaseDialogOpen(false);
    setExerciseToEditInDatabase(null);
  };

  const stats = useMemo(() => {
    let activeCalories = 0;
    let otherCalories = 0;
    let duration = 0;
    let setsCount = 0;
    let hrSum = 0;
    let hrCount = 0;
    if (!exerciseEntries || !Array.isArray(exerciseEntries)) {
      return {
        totalCalories: 0,
        totalDuration: 0,
        totalSets: 0,
        averageHeartRate: 0,
      };
    }

    exerciseEntries.forEach((groupedEntry: GroupedExerciseEntry) => {
      // If it's a preset, we want to iterate over its exercises for the stats
      // If it's an individual entry, we just use it directly
      const items: ExerciseEntry[] =
        groupedEntry.type === 'preset'
          ? groupedEntry.exercises
          : [groupedEntry];

      items.forEach((entry: ExerciseEntry) => {
        // Calories — keep the device-wide "Active Calories" summary separate
        // from logged workouts so the total can be deduped, not summed (the
        // summary already includes the workouts it overlaps with).
        const cal = entryCaloriesCounted(entry);
        if (cal && !isNaN(cal)) {
          if (entry.exercise_snapshot?.name === 'Active Calories') {
            activeCalories += cal;
          } else {
            otherCalories += cal;
          }
        }

        // Duration & Sets
        if (entry.sets && entry.sets.length > 0) {
          setsCount += entry.sets.length;
          const setsDuration = setsDurationMinutes(entry.sets);
          // Fall back to the entry-level duration when the sets carry no
          // per-set timers (e.g. rep-based sets synced from Hevy).
          duration +=
            setsDuration > 0 ? setsDuration : entry.duration_minutes || 0;
        } else if (entry.duration_minutes) {
          duration += entry.duration_minutes;
        }

        // Heart Rate
        if (entry.avg_heart_rate) {
          hrSum += entry.avg_heart_rate;
          hrCount++;
        }
      });
    });

    // "Active Calories" is a device-wide summary that already includes logged
    // workouts, so take the larger of the two instead of adding both. Steps are
    // intentionally excluded here so the total matches the listed rows.
    const { calories: totalCalories } = resolveExerciseCalories(
      otherCalories,
      activeCalories,
      0
    );

    return {
      totalCalories,
      totalDuration: duration,
      totalSets: setsCount,
      averageHeartRate: hrCount > 0 ? hrSum / hrCount : 0,
    };
  }, [exerciseEntries]);

  const loggedAssignmentIds = useMemo(() => {
    const ids = new Set<string>();
    if (!exerciseEntries || !Array.isArray(exerciseEntries)) return ids;
    for (const groupedEntry of exerciseEntries) {
      if (groupedEntry.workout_plan_assignment_id != null) {
        ids.add(String(groupedEntry.workout_plan_assignment_id));
      }
      if (
        groupedEntry.type === 'preset' &&
        Array.isArray(groupedEntry.exercises)
      ) {
        for (const item of groupedEntry.exercises) {
          if (item.workout_plan_assignment_id != null) {
            ids.add(String(item.workout_plan_assignment_id));
          }
        }
      }
    }
    return ids;
  }, [exerciseEntries]);

  const uncompletedActivePlans = useMemo(() => {
    return (activePlans as WorkoutPlanTemplate[]).filter(
      (plan: WorkoutPlanTemplate) => {
        if (!plan.next_assignment) return false;
        const planAssignmentIds = (plan.assignments || []).map(
          (a: WorkoutPlanAssignment) => String(a.id)
        );
        const isPlanCompletedToday = planAssignmentIds.some((id: string) =>
          loggedAssignmentIds.has(id)
        );
        return !isPlanCompletedToday;
      }
    );
  }, [activePlans, loggedAssignmentIds]);

  const getDistinctSessionsForPlan = (plan: WorkoutPlanTemplate) => {
    if (!plan.assignments || plan.assignments.length === 0) return [];
    const map = new Map<
      number | string,
      {
        assignment: WorkoutPlanAssignment;
        sessionIndex: number;
        name: string;
        exerciseCount: number;
        isSuggested: boolean;
      }
    >();

    for (const a of plan.assignments) {
      const key =
        plan.schedule_type === 'sequential'
          ? (a.session_index ?? 0)
          : (a.day_of_week ?? 0);
      const isSuggested =
        plan.schedule_type === 'sequential'
          ? (a.session_index ?? 0) ===
            (plan.next_assignment?.session_index ?? 0)
          : a.id === plan.next_assignment?.id;

      const existing = map.get(key);
      if (existing) {
        existing.exerciseCount += 1;
        if (isSuggested) existing.isSuggested = true;
      } else {
        const name =
          a.session_name ||
          a.workout_preset_name ||
          a.exercise_name ||
          (plan.schedule_type === 'sequential'
            ? t('exerciseCard.sessionNumber', {
                num: a.session_index ?? 1,
                defaultValue: `Session ${a.session_index ?? 1}`,
              })
            : t('exerciseCard.dayNumber', {
                num: (a.day_of_week ?? 0) + 1,
                defaultValue: `Day ${(a.day_of_week ?? 0) + 1}`,
              }));
        map.set(key, {
          assignment: a,
          sessionIndex: a.session_index ?? 1,
          name,
          exerciseCount: 1,
          isSuggested,
        });
      }
    }
    return Array.from(map.values());
  };

  if (loading) {
    return (
      <div>
        {t('diary.exerciseCard.loadingExercises', 'Loading exercises...')}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="dark:text-slate-300">
            {t('exerciseCard.title', 'Exercise')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="default"
                    variant="outline"
                    onClick={handleStartWorkoutPlayback}
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('exerciseCard.startWorkout', 'Start Workout')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="default" onClick={handleOpenAddDialog}>
                    <Dumbbell className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('exerciseCard.addExercise', 'Add Exercise')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {/* Render the AddExerciseDialog directly. It manages its own Dialog/Content and headers. */}
          <AddExerciseDialog
            key={`add-dialog-${addDialogInitialTab}-${isAddDialogOpen ? 'open' : 'closed'}`}
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            onExerciseAdded={handleExerciseSelect}
            onWorkoutPresetSelected={handleWorkoutPresetSelected}
            mode="diary"
            initialTab={addDialogInitialTab}
          />
        </div>
      </CardHeader>
      <CardContent>
        <RunProgramBanner date={selectedDate} />
        {uncompletedActivePlans.map((plan: WorkoutPlanTemplate) => {
          const distinctSessions = getDistinctSessionsForPlan(plan);
          const currentAssignmentId =
            selectedSessionMap[plan.id] ||
            (plan.next_assignment?.id ? String(plan.next_assignment.id) : '');
          const currentSessionItem =
            distinctSessions.find(
              (s) => String(s.assignment.id) === String(currentAssignmentId)
            ) ||
            distinctSessions.find(
              (s) =>
                String(s.assignment.id) === String(plan.next_assignment?.id)
            ) ||
            distinctSessions[0];
          const currentAssignment =
            currentSessionItem?.assignment || plan.next_assignment;
          if (!currentAssignment) return null;

          const sessionName =
            currentAssignment.session_name ||
            currentAssignment.workout_preset_name ||
            currentAssignment.exercise_name ||
            t('exerciseCard.scheduledWorkout', 'Workout Session');

          const sessionIndex =
            currentAssignment.session_index ??
            (plan.sequence_position?.current || 1);
          const totalSessions =
            plan.sequence_position?.total ?? distinctSessions.length ?? 1;

          return (
            <div
              key={plan.id}
              className="mb-3 p-3.5 rounded-lg border bg-muted/40 hover:bg-muted/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="text-xs font-semibold gap-1"
                  >
                    {plan.schedule_type === 'sequential' ? (
                      <>
                        <Repeat className="h-3 w-3 text-primary" />
                        {t('exerciseCard.upNextInPlanBadge', 'Plan Up Next')}
                      </>
                    ) : (
                      <>
                        <CalendarDays className="h-3 w-3 text-primary" />
                        {t(
                          'exerciseCard.scheduledTodayBadge',
                          'Scheduled Today'
                        )}
                      </>
                    )}
                  </Badge>
                  {distinctSessions.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 font-semibold text-sm gap-1 hover:bg-muted/80 text-foreground"
                        >
                          <span>{sessionName}</span>
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          {t(
                            'exerciseCard.switchSessionLabel',
                            'Switch / Pick Session:'
                          )}
                        </div>
                        {distinctSessions.map((sessionItem, index: number) => (
                          <DropdownMenuItem
                            key={sessionItem.assignment.id || index}
                            onClick={() =>
                              setSelectedSessionMap((prev) => ({
                                ...prev,
                                [plan.id]: sessionItem.assignment.id ?? '',
                              }))
                            }
                            className="flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="truncate">
                              {index + 1}. {sessionItem.name}
                            </span>
                            {sessionItem.isSuggested && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 shrink-0"
                              >
                                {t('exerciseCard.suggestedBadge', 'Suggested')}
                              </Badge>
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="font-semibold text-sm">{sessionName}</span>
                  )}
                  {plan.schedule_type === 'sequential' && (
                    <span className="text-xs text-muted-foreground font-medium">
                      {t(
                        'diary.exerciseCard.of',
                        '({{sessionIndex}} of {{totalSessions}})',
                        { sessionIndex, totalSessions }
                      )}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {plan.schedule_type === 'sequential'
                    ? t(
                        'exerciseCard.activePlanHint',
                        'Sequential plan: {{name}}',
                        { name: plan.plan_name }
                      )
                    : t(
                        'exerciseCard.activeWeeklyPlanHint',
                        'Active plan: {{name}}',
                        { name: plan.plan_name }
                      )}
                </p>
              </div>
              <div className="flex items-center shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() =>
                    handleStartPlanSession(plan, currentAssignment)
                  }
                >
                  <Play className="w-3.5 h-3.5 mr-1" />
                  {t('exerciseCard.startWorkoutButton', 'Start Workout')}
                </Button>
              </div>
            </div>
          );
        })}

        {exerciseEntries?.length === 0 ? (
          <p className="dark:text-slate-300">
            {t('exerciseCard.noEntries', 'No exercise entries for this day.')}
          </p>
        ) : (
          <div className="space-y-4">
            {exerciseEntries?.map((entry: GroupedExerciseEntry) => {
              if (entry.type === 'preset') {
                return (
                  <ExercisePresetEntryDisplay
                    key={entry.id}
                    presetEntry={entry}
                    currentUserId={currentUserId}
                    handleDelete={handleDeleteExercisePresetEntry} // Pass the new handler for presets
                    handleDeleteExerciseEntry={handleDeleteExerciseEntry} // Pass the individual exercise entry delete handler
                    handleEdit={handleEdit}
                    handleEditExerciseDatabase={handleEditExerciseDatabase}
                    onLink={canLinkWorkouts ? setLinkEntryId : undefined}
                    setExerciseToPlay={setExerciseToPlay}
                    setIsPlaybackModalOpen={setIsPlaybackModalOpen}
                    energyUnit={energyUnit}
                    convertEnergy={convertEnergy}
                    getEnergyUnitString={getEnergyUnitString}
                  />
                );
              } else {
                // Render individual exercise entry
                return (
                  <ExerciseEntryDisplay
                    key={entry.id}
                    exerciseEntry={entry} // Removed cast
                    currentUserId={currentUserId}
                    handleEdit={handleEdit}
                    handleDelete={handleDeleteExerciseEntry} // Pass the handler for individual entries
                    handleEditExerciseDatabase={handleEditExerciseDatabase}
                    onLink={canLinkWorkouts ? setLinkEntryId : undefined}
                    setExerciseToPlay={setExerciseToPlay}
                    setIsPlaybackModalOpen={setIsPlaybackModalOpen}
                    energyUnit={energyUnit}
                    convertEnergy={convertEnergy}
                    getEnergyUnitString={getEnergyUnitString}
                  />
                );
              }
            })}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 gap-4">
              <span className="font-semibold">
                {t('exerciseCard.exerciseTotal2', 'Exercise Total:')}
              </span>
              <div className="grid grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {stats.totalSets}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t('common.totalSets', 'Total Sets')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {formatMinutesToHHMM(stats.totalDuration)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t('common.minutesUnit', 'Min')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {stats.averageHeartRate > 0
                      ? Math.round(stats.averageHeartRate)
                      : 0}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t('common.avgHrUnit', 'Avg HR')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {Math.round(
                      convertEnergy(stats.totalCalories, 'kcal', energyUnit)
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t('common.caloriesUnit', getEnergyUnitString(energyUnit))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {linkEntryId && (
          <LinkSyncedWorkoutDialog
            key={linkEntryId}
            entryId={linkEntryId}
            open
            onOpenChange={(open) => {
              if (!open) setLinkEntryId(null);
            }}
            energyUnit={energyUnit}
            convertEnergy={convertEnergy}
            getEnergyUnitString={getEnergyUnitString}
          />
        )}

        {/* Edit Exercise Entry Dialog */}
        {editingEntry && (
          <EditExerciseEntryDialog
            key={editingEntry.id}
            entry={editingEntry as ExerciseEntry}
            open={!!editingEntry}
            onOpenChange={(open) => {
              debug(
                loggingLevel,
                'Edit exercise entry dialog open state changed:',
                open
              );
              if (!open) {
                setEditingEntry(null);
              }
            }}
            onSave={handleEditComplete}
          />
        )}

        {/* Exercise Playback Modal */}
        <ExercisePlaybackModal
          isOpen={isPlaybackModalOpen}
          onClose={() => setIsPlaybackModalOpen(false)}
          exercise={exerciseToPlay}
        />

        {/* Log Exercise Entry Dialog */}
        <LogExerciseEntryDialog
          key={
            isLogExerciseDialogOpen
              ? `open-${currentExerciseToLog?.id}`
              : 'close'
          }
          isOpen={isLogExerciseDialogOpen}
          onClose={() => {
            setIsLogExerciseDialogOpen(false);
            setCurrentExerciseToLog(null); // Clear current exercise if dialog is closed manually
            setExercisesToLogQueue([]); // Clear the queue as well
          }}
          exercise={currentExerciseToLog}
          selectedDate={selectedDate}
          onSaveSuccess={handleLogSuccess} // Use the new handler
          initialSets={currentExerciseToLog?.sets || []}
          energyUnit={energyUnit}
          convertEnergy={convertEnergy}
          getEnergyUnitString={getEnergyUnitString}
        />
      </CardContent>

      {/* Edit Exercise Database Dialog */}
      <EditExerciseDatabaseDialog
        key={isEditExerciseDatabaseDialogOpen ? 'open' : 'close'}
        open={isEditExerciseDatabaseDialogOpen}
        onOpenChange={setIsEditExerciseDatabaseDialogOpen}
        exerciseToEdit={exerciseToEditInDatabase}
        onSaveSuccess={handleSaveExerciseDatabaseEdit}
        energyUnit={energyUnit}
        convertEnergy={convertEnergy}
        getEnergyUnitString={getEnergyUnitString}
      />
    </Card>
  );
};

export default ExerciseCard;
