import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Dumbbell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import EditExerciseEntryDialog from './EditExerciseEntryDialog';
import ExercisePlaybackModal from '@/pages/Diary/ExercisePlaybackModal';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, error } from '@/utils/logging';
import type {
  WorkoutPresetSet,
  WorkoutPreset,
  PresetExercise,
  ExerciseToLog,
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
  useLogWorkoutPresetMutation,
} from '@/hooks/Exercises/useExerciseEntries';
import { useQueryClient } from '@tanstack/react-query';
import { exerciseByIdOptions } from '@/hooks/Exercises/useExercises';
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
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { loggingLevel, energyUnit, convertEnergy, getEnergyUnitString } =
    usePreferences();
  debug(
    loggingLevel,
    'ExerciseCard component rendered for date:',
    selectedDate
  );
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
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

  const currentUserId = activeUserId || user?.id;
  debug(loggingLevel, 'Current user ID:', currentUserId);

  const queryClient = useQueryClient();
  const { mutateAsync: deleteExerciseEntry } = useDeleteExerciseEntryMutation();
  const { mutateAsync: deleteExercisePresetEntry } =
    useDeleteExercisePresetEntryMutation();
  const { mutateAsync: logWorkoutPreset } = useLogWorkoutPresetMutation();

  const { data: exerciseEntries, isLoading: loading } =
    useExerciseEntries(selectedDate);

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
          setCurrentExerciseToLog(validExercisesToLog[0]);
          setIsLogExerciseDialogOpen(true);
          setIsAddDialogOpen(false); // Close the add dialog if it's open
        }
      }
    };

    processInitialExercises();
  }, [initialExercisesToLog, loggingLevel, queryClient]);

  const handleOpenAddDialog = () => {
    debug(loggingLevel, 'Opening add exercise dialog.');
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

  const handleWorkoutPresetSelected = async (preset: WorkoutPreset) => {
    debug(loggingLevel, 'Workout preset selected in ExerciseCard:', preset);
    try {
      await logWorkoutPreset({ presetId: preset.id, date: selectedDate });
      handleCloseAddDialog(); // Close the add exercise dialog
      onExercisesLogged(); // Signal to parent that exercises have been logged
    } catch (err) {
      error(
        loggingLevel,
        `Error logging workout preset "${preset.name}":`,
        err
      );
    } finally {
      setIsAddDialogOpen(false); // Close the add dialog
    }
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
      setCurrentExerciseToLog(updatedQueue[0]);
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
    let calories = 0;
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

    exerciseEntries.forEach((groupedEntry) => {
      const isPreset = groupedEntry.type === 'preset' && groupedEntry.exercises;
      const items = isPreset ? groupedEntry.exercises! : [groupedEntry];

      items.forEach((entry: ExerciseEntry | GroupedExerciseEntry) => {
        // Calories
        const cal = entry.calories_burned;
        if (!isNaN(cal)) calories += cal;

        // Duration & Sets
        if (entry.sets) {
          setsCount += entry.sets.length;
          duration += entry.sets.reduce(
            (sum: number, set: WorkoutPresetSet) => sum + (set.duration || 0),
            0
          );
        }

        // Heart Rate
        if (entry.avg_heart_rate) {
          hrSum += entry.avg_heart_rate;
          hrCount++;
        }
      });
    });

    return {
      totalCalories: calories,
      totalDuration: duration,
      totalSets: setsCount,
      averageHeartRate: hrCount > 0 ? hrSum / hrCount : 0,
    };
  }, [exerciseEntries]);

  if (loading) {
    return <div>Loading exercises...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="dark:text-slate-300">
            {t('exerciseCard.title', 'Exercise')}
          </CardTitle>
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
          {/* Render the AddExerciseDialog directly. It manages its own Dialog/Content and headers. */}
          <AddExerciseDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            onExerciseAdded={handleExerciseSelect}
            onWorkoutPresetSelected={handleWorkoutPresetSelected}
            mode="diary"
          />
        </div>
      </CardHeader>
      <CardContent>
        {exerciseEntries.length === 0 ? (
          <p className="dark:text-slate-300">
            {t('exerciseCard.noEntries', 'No exercise entries for this day.')}
          </p>
        ) : (
          <div className="space-y-4">
            {exerciseEntries.map((entry) => {
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
                    exerciseEntry={entry as ExerciseEntry} // Cast to ExerciseEntry
                    currentUserId={currentUserId}
                    handleEdit={handleEdit}
                    handleDelete={handleDeleteExerciseEntry} // Pass the handler for individual entries
                    handleEditExerciseDatabase={handleEditExerciseDatabase}
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
                {t('exerciseCard.exerciseTotal', 'Exercise Total')}:
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

        {/* Edit Exercise Entry Dialog */}
        {editingEntry && (
          <EditExerciseEntryDialog
            key={editingEntry ? 'open' : 'close'}
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
