import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Dumbbell, Edit, Trash2, Settings, Play } from "lucide-react";
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
  ExerciseEntry,
  logWorkoutPreset, // Import the new function
} from "@/services/exerciseEntryService";
import {
  getSuggestedExercises,
  loadExercises,
  createExercise,
  Exercise,
} from "@/services/exerciseService";
import { WorkoutPresetSet, WorkoutPreset } from "@/types/workout";

// Extend Exercise with optional logging fields for pre-population
interface ExerciseToLog extends Exercise {
  sets?: WorkoutPresetSet[];
  reps?: number;
  weight?: number;
  duration?: number; // Duration in minutes (optional) - Changed from duration_minutes
  notes?: string;
  image_url?: string;
  exercise_name?: string; // Added to match PresetExercise
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
  initialExercisesToLog?: ExerciseToLog[];
  onExercisesLogged: () => void; // New prop to signal that exercises have been logged
}

// Extend ExerciseEntry to include sets, reps, weight
interface ExpandedExerciseEntry extends ExerciseEntry {
  exercise_name?: string;
  reps?: number;
  weight?: number;
}

const ExerciseCard = ({
  selectedDate,
  onExerciseChange,
  initialExercisesToLog, // Destructure new prop
  onExercisesLogged, // Destructure new prop
}: ExerciseCardProps) => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { loggingLevel, itemDisplayLimit } = usePreferences(); // Get logging level
  debug(
    loggingLevel,
    "ExerciseCard component rendered for date:",
    selectedDate,
  );
  const [exerciseEntries, setExerciseEntries] = useState<ExpandedExerciseEntry[]>([]);
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
  const [editingEntry, setEditingEntry] = useState<ExpandedExerciseEntry | null>(null);
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

  const currentUserId = activeUserId || user?.id;
  debug(loggingLevel, "Current user ID:", currentUserId);

  const _fetchExerciseEntries = useCallback(async () => {
    debug(loggingLevel, "Fetching exercise entries for date:", selectedDate);
    setLoading(true);
    try {
      const data = await fetchExerciseEntries(selectedDate); // Use imported fetchExerciseEntries
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
    if (initialExercisesToLog && initialExercisesToLog.length > 0) {
      debug(loggingLevel, "ExerciseCard: Received initial exercises to log:", initialExercisesToLog);
      // Map PresetExercise to ExerciseToLog, ensuring all fields are present
      const mappedExercises: ExerciseToLog[] = initialExercisesToLog.map(presetEx => {
        const { exercise_id, exercise_name, ...rest } = presetEx as any; // Use 'as any' to bypass strict type checking for this mapping
        return {
          id: exercise_id,
          name: exercise_name || '',
          category: '',
          calories_per_hour: 0,
          ...rest,
        };
      });
      setExercisesToLogQueue(mappedExercises);
      setCurrentExerciseToLog(mappedExercises[0]);
      setIsLogExerciseDialogOpen(true);
      setIsAddDialogOpen(false); // Close the add dialog if it's open
    }
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

  const handleExerciseSelect = (exercise: Exercise, sourceMode: 'internal' | 'external' | 'custom' | 'preset') => {
    debug(loggingLevel, `Exercise selected in search from ${sourceMode}:`, exercise.id);
    // When selecting from search, it's a single exercise, so clear queue and set current
    setExercisesToLogQueue([{ ...exercise, duration: 0 }]); // Create a new ExerciseToLog from Exercise, add default duration
    setCurrentExerciseToLog({ ...exercise, duration: 0 });
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
      setExercisesToLogQueue([{ ...createdExercise, duration: 0 }]); // Add default duration
      setCurrentExerciseToLog({ ...createdExercise, duration: 0 });
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
    const caloriesBurned = Math.round((caloriesPerHour / 60) * duration);
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

  const handleDelete = async (entryId: string) => {
    debug(loggingLevel, "Handling delete exercise entry:", entryId);
    try {
      await deleteExerciseEntry(entryId);
      info(loggingLevel, "Exercise entry deleted successfully:", entryId);
      toast({
        title: "Success",
        description: "Exercise entry deleted successfully.",
      });
      _fetchExerciseEntries(); // Call the memoized local function
      onExerciseChange();
    } catch (err) {
      error(loggingLevel, "Error deleting exercise entry:", err);
      toast({
        title: "Error",
        description: "Failed to delete exercise entry.",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (entry: ExpandedExerciseEntry) => {
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

  const handleEditExerciseDatabase = (exerciseId: string) => {
    debug(loggingLevel, "Handling edit exercise database for ID:", exerciseId);
    // TODO: Implement navigation or dialog for editing exercise database entry
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

  if (loading) {
    debug(loggingLevel, "ExerciseCard is loading.");
    return <div>Loading exercises...</div>;
  }
  debug(loggingLevel, "ExerciseCard finished loading.");

  const totalExerciseCaloriesBurned = exerciseEntries.reduce(
    (sum, entry) => sum + Number(entry.calories_burned),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="dark:text-slate-300">Exercise</CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="default" onClick={handleOpenAddDialog}>
                <Plus className="w-4 h-4 mr-1" />
                <Dumbbell className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[625px] overflow-y-auto max-h-[90vh]">
              <AddExerciseDialog
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                onExerciseAdded={handleExerciseSelect} // Use handleExerciseSelect for single exercises
                onWorkoutPresetSelected={handleWorkoutPresetSelected} // Handle preset selection
                mode="diary" // Indicate that it's opened from the diary
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {exerciseEntries.length === 0 ? (
          <p className="dark:text-slate-300">
            No exercise entries for this day.
          </p>
        ) : (
          <div className="space-y-4">
            {exerciseEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-4 bg-gray-100 rounded-md dark:bg-gray-800"
              >
                <div className="flex items-center">
                  <Dumbbell className="w-5 h-5 mr-2" />
                  <div>
                    <span className="font-medium flex items-center gap-2">
                      {entry.exercises?.name || "Unknown Exercise"}
                      {entry.exercises?.source === 'wger' && (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                          Wger
                        </span>
                      )}
                      {entry.exercises?.source === 'free-exercise-db' && (
                        <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800">
                          Free Exercise DB
                        </span>
                      )}
                      {entry.exercises?.source === 'nutritionix' && (
                        <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                          Nutritionix
                        </span>
                      )}
                      {entry.exercises?.is_custom && !entry.exercises?.source && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                          Custom
                        </span>
                      )}
                    </span>
                    <div className="text-sm text-gray-500">
                      {entry.exercises?.name === "Active Calories"
                        ? `${Math.round(entry.calories_burned)} active calories`
                        : `${entry.duration_minutes} minutes • ${Math.round(entry.calories_burned)} calories`}
                      {entry.sets && Array.isArray(entry.sets) && ` • Sets: ${entry.sets.length}`}
                      {entry.reps && ` • Reps: ${entry.reps}`}
                      {entry.weight && ` • Weight: ${entry.weight}`}
                      {entry.exercises?.level && ` • Level: ${entry.exercises.level}`}
                      {entry.exercises?.force && ` • Force: ${entry.exercises.force}`}
                      {entry.exercises?.mechanic && ` • Mechanic: ${entry.exercises.mechanic}`}
                    </div>
                    {entry.exercises?.equipment && Array.isArray(entry.exercises.equipment) && entry.exercises.equipment.length > 0 && (
                      <div className="text-xs text-gray-400">Equipment: {entry.exercises.equipment.join(', ')}</div>
                    )}
                    {entry.exercises?.primary_muscles && Array.isArray(entry.exercises.primary_muscles) && entry.exercises.primary_muscles.length > 0 && (
                      <div className="text-xs text-gray-400">Primary Muscles: {entry.exercises.primary_muscles.join(', ')}</div>
                    )}
                    {entry.exercises?.secondary_muscles && Array.isArray(entry.exercises.secondary_muscles) && entry.exercises.secondary_muscles.length > 0 && (
                      <div className="text-xs text-gray-400">Secondary Muscles: {entry.exercises.secondary_muscles.join(', ')}</div>
                    )}
                    {entry.notes && (
                      <div className="text-xs text-gray-400">{entry.notes}</div>
                    )}
                    {entry.image_url && (
                      <img
                        src={entry.image_url}
                        alt={entry.exercises.name}
                        className="w-16 h-16 object-cover mt-2 rounded"
                      />
                    )}
                    {entry.exercises?.images && entry.exercises.images.length > 0 && (
                      <img
                        src={entry.exercises.source ? `/uploads/exercises/${entry.exercises.images[0]}` : entry.exercises.images[0]}
                        alt={entry.exercises.name}
                        className="w-16 h-16 object-contain mt-2"
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  {entry.exercises?.instructions && entry.exercises.instructions.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setExerciseToPlay(entry.exercises);
                        setIsPlaybackModalOpen(true);
                      }}
                      className="h-8 w-8"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(entry)}
                    className="h-8 w-8"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  {entry.exercises?.user_id === currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        handleEditExerciseDatabase(entry.exercise_id)
                      }
                      className="h-8 w-8"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(entry.id)}
                    className="h-8 w-8 hover:bg-gray-200 dark:hover:bg-gray-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 gap-4">
              <span className="font-semibold">Exercise Total:</span>
              <div className="grid grid-cols-1 gap-2 sm:gap-4 text-xs sm:text-sm">
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {Math.round(totalExerciseCaloriesBurned)}
                  </div>
                  <div className="text-xs text-gray-500">cal</div>
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
        {currentExerciseToLog && (
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
            initialSets={currentExerciseToLog.sets}
            // initialReps, initialWeight, etc. are not valid props for LogExerciseEntryDialog
            // The dialog should handle these internally based on the 'exercise' prop.
          />
        )}

      </CardContent>
    </Card>
  );
};

export default ExerciseCard;
