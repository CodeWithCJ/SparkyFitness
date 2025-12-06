import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Dumbbell, Edit, Trash2, Settings, Play, XCircle, ChevronDown, ChevronUp } from "lucide-react"; // Added ChevronDown, ChevronUp
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import EditExerciseEntryDialog from "./EditExerciseEntryDialog";
import ExercisePlaybackModal from "./ExercisePlaybackModal"; // Import the new modal
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { debug, info, warn, error } from "@/utils/logging"; // Import logging utility
import { parseISO, addDays } from "date-fns"; // Import parseISO and addDays
import { toast } from "@/hooks/use-toast"; // Import toast
import {
  fetchExerciseEntries,
  deleteExerciseEntry,
  deleteExercisePresetEntry, // Import the new function
  ExerciseEntry,
  logWorkoutPreset, // Import the new function
  GroupedExerciseEntry, // Import GroupedExerciseEntry
} from "@/services/exerciseEntryService";
import {
  getSuggestedExercises,
  loadExercises,
  createExercise,
  updateExercise, // Import updateExercise
  Exercise,
} from "@/services/exerciseService";
import { WorkoutPresetSet, WorkoutPreset, PresetExercise } from "@/types/workout"; // Import PresetExercise
import { getExerciseById } from "@/services/exerciseService"; // Import getExerciseById

// New imports for refactored components
import ExerciseEntryDisplay from "./ExerciseEntryDisplay";
import ExercisePresetEntryDisplay from "./ExercisePresetEntryDisplay";
import EditExerciseDatabaseDialog from "./EditExerciseDatabaseDialog"; // New import


// Extend Exercise with optional logging fields for pre-population
export interface ExerciseToLog extends Exercise { // Export the interface
  sets?: WorkoutPresetSet[];
  reps?: number;
  weight?: number;
  duration?: number; // Duration in minutes (optional) - Changed from duration_minutes
  notes?: string;
  image_url?: string;
  exercise_name?: string; // Added to match PresetExercise
  distance?: number; // New field
  avg_heart_rate?: number; // New field
}

// New interface for exercises coming from presets, where sets, reps, and weight are guaranteed
interface PresetExerciseToLog extends Exercise {
  sets: WorkoutPresetSet[];
  reps: number;
  weight: number;
  exercise_name: string;
}
import ExerciseSearch from "./ExerciseSearch"; // New import for ExerciseSearch
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"; // New import for tabs
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import AddExerciseDialog from "./AddExerciseDialog"; // Import AddExerciseDialog

import LogExerciseEntryDialog from "./LogExerciseEntryDialog"; // Import LogExerciseEntryDialog

interface ExerciseCardProps {
  selectedDate: string;
  onExerciseChange: () => void;
  initialExercisesToLog?: PresetExercise[]; // Change type to PresetExercise[]
  onExercisesLogged: () => void; // New prop to signal that exercises have been logged
}

const ExerciseCard = ({
  selectedDate,
  onExerciseChange,
  initialExercisesToLog, // Destructure new prop
  onExercisesLogged, // Destructure new prop
}: ExerciseCardProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { loggingLevel, itemDisplayLimit, weightUnit, convertWeight, energyUnit, convertEnergy, getEnergyUnitString } = usePreferences(); // Get logging level, energyUnit, convertEnergy
  debug(
    loggingLevel,
    "ExerciseCard component rendered for date:",
    selectedDate,
  );
  const [exerciseEntries, setExerciseEntries] = useState<GroupedExerciseEntry[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const addDialogRef = useRef<HTMLDivElement>(null); // Declare addDialogRef
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    null,
  );
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null,
  ); // New state for selected exercise object
  const [duration, setDuration] = useState<number>(30);
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<ExerciseEntry | null>(null); // Use ExerciseEntry from service
  const [searchTerm, setSearchTerm] = useState(""); // Keep for internal search
  const [searchLoading, setSearchLoading] = useState(false); // Keep for internal search
  const [filterType, setFilterType] = useState<string>("all"); // Keep for internal search
  const [searchMode, setSearchMode] = useState<
    "internal" | "external" | "custom"
  >("internal"); // New state for search mode
  const [recentExercises, setRecentExercises] = useState<Exercise[]>([]);
  const [topExercises, setTopExercises] = useState<Exercise[]>([]);
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseCategory, setNewExerciseCategory] = useState("general");
  const [newExerciseCalories, setNewExerciseCalories] = useState(300);
  const [newExerciseDescription, setNewExerciseDescription] = useState("");
  const [showDurationDialog, setShowDurationDialog] = useState(false);
  const [isPlaybackModalOpen, setIsPlaybackModalOpen] = useState(false); // State for playback modal
  const [exerciseToPlay, setExerciseToPlay] = useState<Exercise | null>(null); // State for exercise to play
  const [isLogExerciseDialogOpen, setIsLogExerciseDialogOpen] = useState(false); // State for LogExerciseEntryDialog
  const [exercisesToLogQueue, setExercisesToLogQueue] = useState<ExerciseToLog[]>([]); // Queue for multiple exercises
  const [currentExerciseToLog, setCurrentExerciseToLog] = useState<ExerciseToLog | null>(null); // Current exercise being logged
  const [exerciseEntriesRefreshTrigger, setExerciseEntriesRefreshTrigger] = useState(0); // New state for refreshing exercise entries
  const [isEditExerciseDatabaseDialogOpen, setIsEditExerciseDatabaseDialogOpen] = useState(false);
  const [exerciseToEditInDatabase, setExerciseToEditInDatabase] = useState<Exercise | null>(null);
  // const [expandedPresets, setExpandedPresets] = useState<Set<string>>(new Set()); // State to manage expanded presets - moved to ExercisePresetEntryDisplay


  const currentUserId = activeUserId || user?.id;
  debug(loggingLevel, "Current user ID:", currentUserId);



  const _fetchExerciseEntries = useCallback(async () => {
    debug(loggingLevel, "Fetching exercise entries for date:", selectedDate);
    setLoading(true);
    try {
      const data: GroupedExerciseEntry[] = await fetchExerciseEntries(selectedDate); // Use imported fetchExerciseEntries
      info(loggingLevel, "Exercise entries fetched successfully:", data);
      setExerciseEntries(data || []);
      debug(loggingLevel, "ExerciseCard: exerciseEntries state updated to:", data);
    } catch (err) {
      error(loggingLevel, "Error fetching exercise entries:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, selectedDate, loggingLevel, exerciseEntriesRefreshTrigger]); // Add refresh trigger to dependencies

  useEffect(() => {
    debug(loggingLevel, "currentUserId, selectedDate, or exerciseEntriesRefreshTrigger useEffect triggered.", {
      currentUserId,
      selectedDate,
      exerciseEntriesRefreshTrigger,
    });
    if (currentUserId) {
      _fetchExerciseEntries();
    }
  }, [currentUserId, selectedDate, _fetchExerciseEntries, exerciseEntriesRefreshTrigger]); // Add refresh trigger to dependencies

  // Effect to handle initialExercisesToLog prop
  useEffect(() => {
    const processInitialExercises = async () => {
      if (initialExercisesToLog && initialExercisesToLog.length > 0) {
        debug(loggingLevel, "ExerciseCard: Received initial exercises to log:", initialExercisesToLog);

        const fetchedExercises = await Promise.all(initialExercisesToLog.map(async (presetEx) => {
          try {
            const fullExercise = await getExerciseById(presetEx.exercise_id);
            // Create WorkoutPresetSet array based on presetEx.sets, reps, and weight
            const sets: WorkoutPresetSet[] = Array.from({ length: presetEx.sets }, (_, i) => ({
              set_number: i + 1,
              reps: presetEx.reps,
              weight: presetEx.weight,
              set_type: 'Working Set', // Default set type
            }));

            return {
              ...fullExercise,
              sets: sets,
              reps: presetEx.reps,
              weight: presetEx.weight,
              exercise_name: presetEx.exercise_name,
            } as PresetExerciseToLog; // Cast to the new interface
          } catch (err) {
            error(loggingLevel, `Failed to fetch full exercise details for ID ${presetEx.exercise_id}:`, err);
            return null; // Return null for failed fetches
          }
        }));

        const validExercisesToLog: PresetExerciseToLog[] = fetchedExercises.filter((ex): ex is PresetExerciseToLog => ex !== null);

        if (validExercisesToLog.length > 0) {
          setExercisesToLogQueue(validExercisesToLog);
          setCurrentExerciseToLog(validExercisesToLog[0]);
          setIsLogExerciseDialogOpen(true);
          setIsAddDialogOpen(false); // Close the add dialog if it's open
        } else {
          warn(loggingLevel, "No valid exercises to log from initialExercisesToLog.");
        }
      }
    };

    processInitialExercises();
  }, [initialExercisesToLog, loggingLevel]);

  useEffect(() => {
    const performInternalSearch = async () => {
      if (!currentUserId) return;

      setSearchLoading(true);
      try {
        const { exercises } = await loadExercises(
          currentUserId,
          searchTerm,
          filterType,
        );
        setSearchResults(exercises);
        info(loggingLevel, "Internal exercise search results:", exercises);
      } catch (err) {
        error(loggingLevel, "Error during internal exercise search:", err);
      } finally {
        setSearchLoading(false);
      }
    };

    const fetchSuggested = async () => {
      if (currentUserId) {
        debug(
          loggingLevel,
          "Fetching suggested exercises with limit:",
          itemDisplayLimit,
        );
        const { recentExercises, topExercises } =
          await getSuggestedExercises(itemDisplayLimit);
        info(loggingLevel, "Suggested exercises data:", {
          recentExercises,
          topExercises,
        });
        setRecentExercises(recentExercises);
        setTopExercises(topExercises);
      }
    };

    if (isAddDialogOpen && searchMode === "internal") {
      if (searchTerm.trim() === "") {
        fetchSuggested();
        setSearchResults([]);
      } else {
        const delayDebounceFn = setTimeout(() => {
          performInternalSearch();
        }, 300); // Debounce search to avoid excessive API calls
        return () => clearTimeout(delayDebounceFn);
      }
    }
  }, [
    searchTerm,
    filterType,
    currentUserId,
    loggingLevel,
    searchMode,
    isAddDialogOpen,
    itemDisplayLimit,
  ]);

  const handleOpenAddDialog = () => {
    debug(loggingLevel, "Opening add exercise dialog.");
    setIsAddDialogOpen(true);
    setSelectedExerciseId(null); // Reset selected exercise
    setSelectedExercise(null); // Reset selected exercise object
    setDuration(30);
    setNotes("");
  };

  const handleCloseAddDialog = useCallback(() => {
    debug(loggingLevel, "Closing add exercise dialog.");
    setIsAddDialogOpen(false);
    setSelectedExerciseId(null);
    setSelectedExercise(null);
    setDuration(30);
    setNotes("");
  }, [loggingLevel]);

  const handleExerciseSelect = (exercise?: Exercise, sourceMode?: 'internal' | 'external' | 'custom' | 'preset') => {
    // If no exercise is provided, it's a general refresh signal
    if (!exercise) {
      debug(loggingLevel, "General refresh triggered (no specific exercise selected).");
      handleDataChange(); // Trigger a full data refresh for the card
      return;
    }

    debug(loggingLevel, `Exercise selected in search from ${sourceMode}:`, exercise.id);
    // When selecting from search, it's a single exercise, so clear queue and set current
    setExercisesToLogQueue([{ ...exercise, duration: 0, sets: [], reps: 0, weight: 0 }]); // Create a new ExerciseToLog from Exercise, add default duration and empty sets
    setCurrentExerciseToLog({ ...exercise, duration: 0, sets: [], reps: 0, weight: 0 });
    setIsLogExerciseDialogOpen(true);
    setIsAddDialogOpen(false);
  };

  const handleDataChange = useCallback(() => {
    debug(
      loggingLevel,
      "Handling data change, incrementing refresh trigger.",
    );
    setExerciseEntriesRefreshTrigger(prev => prev + 1); // Increment trigger to force refresh
    onExerciseChange(); // Still call parent's onExerciseChange for broader diary refresh if needed
    handleCloseAddDialog(); // Close the add exercise dialog
  }, [loggingLevel, onExerciseChange, handleCloseAddDialog]);

  const handleWorkoutPresetSelected = useCallback(async (preset: WorkoutPreset) => {
    debug(loggingLevel, "Workout preset selected in ExerciseCard:", preset);
    try {
      await logWorkoutPreset(preset.id, selectedDate);
      toast({
        title: "Success",
        description: `Workout preset "${preset.name}" logged successfully.`,
      });
      handleDataChange(); // Refresh exercise entries
      onExercisesLogged(); // Signal to parent that exercises have been logged
    } catch (err) {
      error(loggingLevel, `Error logging workout preset "${preset.name}":`, err);
      toast({
        title: "Error",
        description: `Failed to log workout preset "${preset.name}".`,
        variant: "destructive",
      });
    } finally {
      setIsAddDialogOpen(false); // Close the add dialog
    }
  }, [loggingLevel, selectedDate, handleDataChange, onExercisesLogged]);

  const handleAddCustomExercise = async (sourceMode: 'custom') => {
    if (!user) return;
    try {
      const newExercise = {
        name: newExerciseName,
        category: newExerciseCategory,
        calories_per_hour: newExerciseCalories,
        description: newExerciseDescription,
        user_id: user.id,
        is_custom: true,
      };
      const createdExercise = await createExercise(newExercise);
      toast({
        title: "Success",
        description: "Exercise added successfully",
      });
      // When adding custom, it's a single exercise, so clear queue and set current
      setExercisesToLogQueue([{ ...createdExercise, duration: 0, sets: [], reps: 0, weight: 0 }]); // Add default duration and empty sets
      setCurrentExerciseToLog({ ...createdExercise, duration: 0, sets: [], reps: 0, weight: 0 });
      setIsLogExerciseDialogOpen(true);
      setIsAddDialogOpen(false);
      setNewExerciseName("");
      setNewExerciseCategory("general");
      setNewExerciseCalories(300);
      setNewExerciseDescription("");
    } catch (error) {
      console.error("Error adding exercise:", error);
      toast({
        title: "Error",
        description: "Failed to add exercise",
        variant: "destructive",
      });
    }
  };

  const handleAddToDiary = async () => {
    debug(loggingLevel, "Handling add to diary.");
    if (!selectedExerciseId || !selectedExercise) {
      // Check for selectedExercise object
      warn(loggingLevel, "Submit called with no exercise selected.");
      toast({
        title: "Error",
        description: "Please select an exercise.",
        variant: "destructive",
      });
      return;
    }

    const caloriesPerHour = selectedExercise.calories_per_hour || 300;
    const caloriesBurned = Math.round((caloriesPerHour / 60) * duration); // Calculated in kcal
    debug(loggingLevel, "Calculated calories burned:", caloriesBurned);

    try {
      // This function is no longer used directly, as LogExerciseEntryDialog handles creation
      // await addExerciseEntry({
      //   exercise_id: selectedExerciseId,
      //   duration_minutes: duration,
      //   calories_burned: caloriesBurned,
      //   entry_date: selectedDate,
      //   notes: notes,
      // });
      info(loggingLevel, "Exercise entry added successfully.");
      toast({
        title: "Success",
        description: "Exercise entry added successfully.",
      });
      _fetchExerciseEntries(); // Call the memoized local function
      onExerciseChange();
      setShowDurationDialog(false);
      handleCloseAddDialog();
    } catch (err) {
      error(loggingLevel, "Error adding exercise entry:", err);
      toast({
        title: "Error",
        description: "Failed to add exercise entry.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteExerciseEntry = async (entryId: string) => {
    debug(loggingLevel, "Handling delete individual exercise entry:", entryId);
    try {
      await deleteExerciseEntry(entryId);
      info(loggingLevel, "Individual exercise entry deleted successfully:", entryId);
      toast({
        title: "Success",
        description: "Exercise entry deleted successfully.",
      });
      _fetchExerciseEntries(); // Call the memoized local function
      onExerciseChange();
    } catch (err) {
      error(loggingLevel, "Error deleting individual exercise entry:", err);
      toast({
        title: "Error",
        description: "Failed to delete exercise entry.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteExercisePresetEntry = async (presetEntryId: string) => {
    debug(loggingLevel, "Handling delete exercise preset entry:", presetEntryId);
    try {
      await deleteExercisePresetEntry(presetEntryId);
      info(loggingLevel, "Exercise preset entry deleted successfully:", presetEntryId);
      toast({
        title: "Success",
        description: "Exercise preset entry deleted successfully.",
      });
      _fetchExerciseEntries(); // Call the memoized local function
      onExerciseChange();
    } catch (err) {
      error(loggingLevel, "Error deleting exercise preset entry:", err);
      toast({
        title: "Error",
        description: "Failed to delete exercise preset entry.",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (entry: ExerciseEntry) => { // Changed type to ExerciseEntry
    debug(loggingLevel, "Handling edit exercise entry:", entry.id);
    setEditingEntry(entry);
  };

  const handleEditComplete = () => {
    debug(loggingLevel, "Handling edit exercise entry complete.");
    setEditingEntry(null);
    _fetchExerciseEntries(); // Call the memoized local function
    onExerciseChange();
    info(loggingLevel, "Exercise entry edit complete and refresh triggered.");
  };



  const handleLogSuccess = () => {
    debug(loggingLevel, "Exercise logged successfully. Processing queue.");
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
    handleDataChange(); // Refresh exercise entries
  };

  const handleEditExerciseDatabase = useCallback(async (exerciseId: string) => {
    debug(loggingLevel, "Attempting to edit exercise in database:", exerciseId);
    try {
      const exercise = await getExerciseById(exerciseId);
      setExerciseToEditInDatabase(exercise);
      setIsEditExerciseDatabaseDialogOpen(true);
    } catch (err) {
      error(loggingLevel, "Failed to fetch exercise for editing:", err);
      toast({
        title: "Error",
        description: "Failed to load exercise details for editing.",
        variant: "destructive",
      });
    }
  }, [loggingLevel]);

  const handleSaveExerciseDatabaseEdit = useCallback(() => {
    debug(loggingLevel, "Exercise database edit saved. Refreshing entries.");
    setIsEditExerciseDatabaseDialogOpen(false);
    setExerciseToEditInDatabase(null);
    _fetchExerciseEntries(); // Refresh the exercise entries in the card
    onExerciseChange(); // Notify parent of change
  }, [loggingLevel, _fetchExerciseEntries, onExerciseChange]);

  if (loading) {
    debug(loggingLevel, "ExerciseCard is loading.");
    return <div>Loading exercises...</div>;
  }
  debug(loggingLevel, "ExerciseCard finished loading.");

  const totalExerciseCaloriesBurned = exerciseEntries.reduce((sum, groupedEntry) => { // This value is in kcal
    if (groupedEntry.type === 'individual') {
      const calories = parseFloat(groupedEntry.calories_burned as any);
      return sum + (isNaN(calories) ? 0 : calories);
    } else if (groupedEntry.type === 'preset' && groupedEntry.exercises) {
      return sum + groupedEntry.exercises.reduce((presetSum, entry) => {
        const calories = parseFloat(entry.calories_burned as any);
        return presetSum + (isNaN(calories) ? 0 : calories);
      }, 0);
    }
    return sum;
  }, 0);

  const totalDurationMinutes = exerciseEntries.reduce((sum, groupedEntry) => {
    let entryDuration = 0;
    if (groupedEntry.type === 'individual' && groupedEntry.sets) {
      entryDuration = groupedEntry.sets.reduce((setSum, set) => setSum + (set.duration || 0), 0);
    } else if (groupedEntry.type === 'preset' && groupedEntry.exercises) {
      entryDuration = groupedEntry.exercises.reduce((presetSum, entry) => {
        return presetSum + (entry.sets ? entry.sets.reduce((setSum, set) => setSum + (set.duration || 0), 0) : 0);
      }, 0);
    }
    return sum + entryDuration;
  }, 0);

  const totalSets = exerciseEntries.reduce((sum, groupedEntry) => {
    if (groupedEntry.type === 'individual' && groupedEntry.sets) {
      return sum + groupedEntry.sets.length;
    } else if (groupedEntry.type === 'preset' && groupedEntry.exercises) {
      return sum + groupedEntry.exercises.reduce((presetSum, entry) => {
        return presetSum + (entry.sets ? entry.sets.length : 0);
      }, 0);
    }
    return sum;
  }, 0);

  const totalHeartRates = exerciseEntries.reduce((acc, groupedEntry) => {
    if (groupedEntry.type === 'individual' && groupedEntry.avg_heart_rate) {
      acc.sum += groupedEntry.avg_heart_rate;
      acc.count++;
    } else if (groupedEntry.type === 'preset' && groupedEntry.exercises) {
      groupedEntry.exercises.forEach(entry => {
        if (entry.avg_heart_rate) {
          acc.sum += entry.avg_heart_rate;
          acc.count++;
        }
      });
    }
    return acc;
  }, { sum: 0, count: 0 });

  const averageHeartRate = totalHeartRates.count > 0 ? totalHeartRates.sum / totalHeartRates.count : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="dark:text-slate-300">{t("exerciseCard.title", "Exercise")}</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="default" onClick={handleOpenAddDialog}>
                  <Dumbbell className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("exerciseCard.addExercise", "Add Exercise")}</p>
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
            {t("exerciseCard.noEntries", "No exercise entries for this day.")}
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
              <span className="font-semibold">{t("exerciseCard.exerciseTotal", "Exercise Total")}:</span>
              <div className="grid grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {totalSets}
                  </div>
                  <div className="text-xs text-gray-500">{t("common.totalSets", "Total Sets")}</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {totalDurationMinutes.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">{t("common.minutesUnit", "Min")}</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {averageHeartRate > 0 ? Math.round(averageHeartRate) : 0}
                  </div>
                  <div className="text-xs text-gray-500">{t("common.avgHrUnit", "Avg HR")}</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {Math.round(convertEnergy(totalExerciseCaloriesBurned, 'kcal', energyUnit))}
                  </div>
                  <div className="text-xs text-gray-500">{t("common.caloriesUnit", getEnergyUnitString(energyUnit))}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Exercise Entry Dialog */}
        {editingEntry && (
          <EditExerciseEntryDialog
            entry={editingEntry as ExerciseEntry}
            open={!!editingEntry}
            onOpenChange={(open) => {
              debug(
                loggingLevel,
                "Edit exercise entry dialog open state changed:",
                open,
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
        // initialReps, initialWeight, etc. are not valid props for LogExerciseEntryDialog
        // The dialog should handle these internally based on the 'exercise' prop.
        />

      </CardContent>

      {/* Edit Exercise Database Dialog */}
      <EditExerciseDatabaseDialog
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
