import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { Plus, Dumbbell, Edit, Trash2, Settings, Play, XCircle } from "lucide-react";
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
  updateExercise, // Import updateExercise
  Exercise,
} from "@/services/exerciseService";
import { WorkoutPresetSet, WorkoutPreset, PresetExercise } from "@/types/workout"; // Import PresetExercise
import { getExerciseById } from "@/services/exerciseService"; // Import getExerciseById

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
  const { loggingLevel, itemDisplayLimit, weightUnit, convertWeight } = usePreferences(); // Get logging level
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

  // State for editing exercise database entry
  const [isEditExerciseDatabaseDialogOpen, setIsEditExerciseDatabaseDialogOpen] = useState(false);
  const [exerciseToEditInDatabase, setExerciseToEditInDatabase] = useState<Exercise | null>(null);
  const [editExerciseName, setEditExerciseName] = useState("");
  const [editExerciseCategory, setEditExerciseCategory] = useState("general");
  const [editExerciseCalories, setEditExerciseCalories] = useState(300);
  const [editExerciseDescription, setEditExerciseDescription] = useState("");
  const [editExerciseLevel, setEditExerciseLevel] = useState("");
  const [editExerciseForce, setEditExerciseForce] = useState("");
  const [editExerciseMechanic, setEditExerciseMechanic] = useState("");
  const [editExerciseEquipment, setEditExerciseEquipment] = useState<string[]>([]);
  const [editExercisePrimaryMuscles, setEditExercisePrimaryMuscles] = useState<string[]>([]);
  const [editExerciseSecondaryMuscles, setEditExerciseSecondaryMuscles] = useState<string[]>([]);
  const [editExerciseInstructions, setEditExerciseInstructions] = useState<string[]>([]);
  const [editExerciseImages, setEditExerciseImages] = useState<string[]>([]);
  const [newExerciseImageFiles, setNewExerciseImageFiles] = useState<File[]>([]);
  const [newExerciseImageUrls, setNewExerciseImageUrls] = useState<string[]>([]);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);

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

  const handleExerciseSelect = (exercise: Exercise, sourceMode: 'internal' | 'external' | 'custom' | 'preset') => {
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

  const handleEditExerciseDatabase = async (exerciseId: string) => {
    debug(loggingLevel, "Handling edit exercise database for ID:", exerciseId);
    try {
      // Find the exercise in the current entries
      const exerciseToEdit = exerciseEntries.find(entry => entry.exercise_id === exerciseId)?.exercises;

      if (exerciseToEdit) {
        setExerciseToEditInDatabase(exerciseToEdit);
        setEditExerciseName(exerciseToEdit.name);
        setEditExerciseCategory(exerciseToEdit.category);
        setEditExerciseCalories(exerciseToEdit.calories_per_hour);
        setEditExerciseDescription(exerciseToEdit.description || "");
        setEditExerciseLevel(exerciseToEdit.level?.toLowerCase() || "");
        setEditExerciseForce(exerciseToEdit.force?.toLowerCase() || "");
        setEditExerciseMechanic(exerciseToEdit.mechanic?.toLowerCase() || "");
        setEditExerciseEquipment(Array.isArray(exerciseToEdit.equipment) ? exerciseToEdit.equipment : []);
        setEditExercisePrimaryMuscles(Array.isArray(exerciseToEdit.primary_muscles) ? exerciseToEdit.primary_muscles : []);
        setEditExerciseSecondaryMuscles(Array.isArray(exerciseToEdit.secondary_muscles) ? exerciseToEdit.secondary_muscles : []);
        setEditExerciseInstructions(Array.isArray(exerciseToEdit.instructions) ? exerciseToEdit.instructions : []);
        setEditExerciseImages(Array.isArray(exerciseToEdit.images) ? exerciseToEdit.images : []);
        setNewExerciseImageFiles([]);
        setNewExerciseImageUrls([]);
        setIsEditExerciseDatabaseDialogOpen(true);
      } else {
        warn(loggingLevel, "Exercise not found in current entries for editing:", exerciseId);
        toast({
          title: "Error",
          description: "Exercise details not found for editing.",
          variant: "destructive",
        });
      }
    } catch (err) {
      error(loggingLevel, "Error preparing to edit exercise in database:", err);
      toast({
        title: "Error",
        description: "Failed to load exercise details for editing.",
        variant: "destructive",
      });
    }
  };

  const handleSaveExerciseDatabaseEdit = async () => {
    if (!exerciseToEditInDatabase) return;

    try {
      const formData = new FormData();
      const updatedExerciseData: Partial<Exercise> = {
        name: editExerciseName,
        category: editExerciseCategory,
        calories_per_hour: editExerciseCalories,
        description: editExerciseDescription,
        level: editExerciseLevel,
        force: editExerciseForce,
        mechanic: editExerciseMechanic,
        equipment: editExerciseEquipment,
        primary_muscles: editExercisePrimaryMuscles,
        secondary_muscles: editExerciseSecondaryMuscles,
        instructions: editExerciseInstructions,
        images: editExerciseImages,
      };

      formData.append('exerciseData', JSON.stringify(updatedExerciseData));
      newExerciseImageFiles.forEach((file) => {
        formData.append('images', file);
      });

      await updateExercise(exerciseToEditInDatabase.id, formData);
      toast({
        title: "Success",
        description: "Exercise updated successfully in database",
      });
      setIsEditExerciseDatabaseDialogOpen(false);
      setExerciseToEditInDatabase(null);
      setNewExerciseImageFiles([]);
      setNewExerciseImageUrls([]);
      handleDataChange(); // Refresh exercise entries in the card
    } catch (err) {
      error(loggingLevel, "Error updating exercise in database:", err);
      toast({
        title: "Error",
        description: "Failed to update exercise in database",
        variant: "destructive",
      });
    }
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="default" onClick={handleOpenAddDialog}>
                  <Dumbbell className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add Exercise</p>
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
                      {entry.weight && ` • Weight: ${convertWeight(entry.weight, 'lbs', weightUnit)} ${weightUnit}`}
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
                    {/* Image Display Logic */}
                    <div className="mt-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <img
                            src={entry.image_url ? entry.image_url : (entry.exercises?.images && entry.exercises.images.length > 0 ? (entry.exercises.source ? `/uploads/exercises/${entry.exercises.images[0]}` : entry.exercises.images[0]) : '')}
                            alt={entry.exercises?.name || 'Exercise'}
                            className="w-16 h-16 object-cover rounded cursor-pointer"
                            style={{ display: (entry.image_url || (entry.exercises?.images && entry.exercises.images.length > 0)) ? 'block' : 'none' }}
                          />
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl">
                          <DialogHeader>
                            <DialogTitle>{entry.exercises?.name || 'Exercise Image'}</DialogTitle>
                            <DialogDescription>
                              Preview of the exercise image.
                            </DialogDescription>
                          </DialogHeader>
                          <img
                            src={entry.image_url ? entry.image_url : (entry.exercises?.images && entry.exercises.images.length > 0 ? (entry.exercises.source ? `/uploads/exercises/${entry.exercises.images[0]}` : entry.exercises.images[0]) : '')}
                            alt={entry.exercises?.name || 'Exercise'}
                            className="w-full h-auto object-contain"
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  {entry.exercises?.instructions && entry.exercises.instructions.length > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
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
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Play Instructions</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(entry)}
                          className="h-8 w-8"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit Entry</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {entry.exercises?.user_id === currentUserId && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
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
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit Exercise in Database</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(entry.id)}
                          className="h-8 w-8 hover:bg-gray-200 dark:hover:bg-gray-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete Entry</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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

      {/* Edit Exercise Database Dialog */}
      <Dialog open={isEditExerciseDatabaseDialogOpen} onOpenChange={setIsEditExerciseDatabaseDialogOpen}>
        <DialogContent className="sm:max-w-[625px] overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Exercise in Database</DialogTitle>
            <DialogDescription>
              Edit the details of the selected exercise in the database.
            </DialogDescription>
          </DialogHeader>
          {exerciseToEditInDatabase && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-db-name" className="text-right">
                  Name
                </Label>
                <Input
                  id="edit-db-name"
                  value={editExerciseName}
                  onChange={(e) => setEditExerciseName(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-db-category" className="text-right">
                  Category
                </Label>
                <Select onValueChange={setEditExerciseCategory} defaultValue={editExerciseCategory}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="strength">Strength</SelectItem>
                    <SelectItem value="cardio">Cardio</SelectItem>
                    <SelectItem value="yoga">Yoga</SelectItem>
                    <SelectItem value="powerlifting">Powerlifting</SelectItem>
                    <SelectItem value="olympic weightlifting">Olympic Weightlifting</SelectItem>
                    <SelectItem value="strongman">Strongman</SelectItem>
                    <SelectItem value="plyometrics">Plyometrics</SelectItem>
                    <SelectItem value="stretching">Stretching</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-db-calories" className="text-right">
                  Calories/Hour
                </Label>
                <Input
                  id="edit-db-calories"
                  type="number"
                  value={editExerciseCalories.toString()}
                  onChange={(e) => setEditExerciseCalories(Number(e.target.value))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-db-level" className="text-right">
                  Level
                </Label>
                <Select onValueChange={setEditExerciseLevel} defaultValue={editExerciseLevel}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-db-force" className="text-right">
                  Force
                </Label>
                <Select onValueChange={setEditExerciseForce} defaultValue={editExerciseForce}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select force" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pull">Pull</SelectItem>
                    <SelectItem value="push">Push</SelectItem>
                    <SelectItem value="static">Static</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-db-mechanic" className="text-right">
                  Mechanic
                </Label>
                <Select onValueChange={setEditExerciseMechanic} defaultValue={editExerciseMechanic}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select mechanic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="isolation">Isolation</SelectItem>
                    <SelectItem value="compound">Compound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-db-equipment" className="text-right mt-1">
                  Equipment (comma-separated)
                </Label>
                <Input
                  id="edit-db-equipment"
                  value={editExerciseEquipment.join(', ')}
                  onChange={(e) => setEditExerciseEquipment(e.target.value.split(',').map(s => s.trim()))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-db-primary-muscles" className="text-right mt-1">
                  Primary Muscles (comma-separated)
                </Label>
                <Input
                  id="edit-db-primary-muscles"
                  value={editExercisePrimaryMuscles.join(', ')}
                  onChange={(e) => setEditExercisePrimaryMuscles(e.target.value.split(',').map(s => s.trim()))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-db-secondary-muscles" className="text-right mt-1">
                  Secondary Muscles (comma-separated)
                </Label>
                <Input
                  id="edit-db-secondary-muscles"
                  value={editExerciseSecondaryMuscles.join(', ')}
                  onChange={(e) => setEditExerciseSecondaryMuscles(e.target.value.split(',').map(s => s.trim()))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-db-instructions" className="text-right mt-1">
                  Instructions (one per line)
                </Label>
                <Textarea
                  id="edit-db-instructions"
                  value={editExerciseInstructions.join('\n')}
                  onChange={(e) => setEditExerciseInstructions(e.target.value.split('\n').map(s => s.trim()))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-db-images" className="text-right mt-1">
                  Images
                </Label>
                <div className="col-span-3">
                  <Input
                    id="edit-db-images"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files) {
                        const filesArray = Array.from(e.target.files);
                        setNewExerciseImageFiles((prev) => [...prev, ...filesArray]);
                        filesArray.forEach((file) => {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewExerciseImageUrls((prev) => [...prev, reader.result as string]);
                          };
                          reader.readAsDataURL(file);
                        });
                      }
                    }}
                    className="col-span-3"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {editExerciseImages.map((url, index) => (
                      <div
                        key={`existing-${index}`}
                        draggable
                        onDragStart={() => setDraggedImageIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedImageIndex === null) return;
                          const newImages = [...editExerciseImages];
                          const [draggedItem] = newImages.splice(draggedImageIndex, 1);
                          newImages.splice(index, 0, draggedItem);
                          setEditExerciseImages(newImages);
                          setDraggedImageIndex(null);
                        }}
                        className="relative w-24 h-24 cursor-grab"
                      >
                        <img src={url.startsWith('http') ? url : `/uploads/exercises/${url}`} alt={`existing ${index}`} className="w-full h-full object-cover rounded" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={() => setEditExerciseImages((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {newExerciseImageUrls.map((url, index) => (
                      <div
                        key={`new-${index}`}
                        draggable
                        onDragStart={() => setDraggedImageIndex(editExerciseImages.length + index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedImageIndex === null) return;

                          const allImages = [...editExerciseImages, ...newExerciseImageUrls];
                          const allFiles = [...newExerciseImageFiles];

                          const targetIndex = index + editExerciseImages.length;

                          if (draggedImageIndex < editExerciseImages.length) { // Dragging an existing image
                            const newExistingImages = [...editExerciseImages];
                            const [draggedItem] = newExistingImages.splice(draggedImageIndex, 1);
                            newExistingImages.splice(targetIndex, 0, draggedItem);
                            setEditExerciseImages(newExistingImages);
                          } else { // Dragging a new image
                            const newNewImageFiles = [...newExerciseImageFiles];
                            const newNewImageUrls = [...newExerciseImageUrls];

                            const draggedNewImageIndex = draggedImageIndex - editExerciseImages.length;
                            const [draggedFile] = newNewImageFiles.splice(draggedNewImageIndex, 1);
                            const [draggedUrl] = newNewImageUrls.splice(draggedNewImageIndex, 1);

                            newNewImageFiles.splice(targetIndex - editExerciseImages.length, 0, draggedFile);
                            newNewImageUrls.splice(targetIndex - editExerciseImages.length, 0, draggedUrl);

                            setNewExerciseImageFiles(newNewImageFiles);
                            setNewExerciseImageUrls(newNewImageUrls);
                          }
                          setDraggedImageIndex(null);
                        }}
                        className="relative w-24 h-24 cursor-grab"
                      >
                        <img src={url} alt={`preview ${index}`} className="w-full h-full object-cover rounded" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={() => {
                            setNewExerciseImageFiles((prev) => prev.filter((_, i) => i !== index));
                            setNewExerciseImageUrls((prev) => prev.filter((_, i) => i !== index));
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-db-description" className="text-right mt-1">
                  Description
                </Label>
                <Textarea
                  id="edit-db-description"
                  value={editExerciseDescription}
                  onChange={(e) => setEditExerciseDescription(e.target.value)}
                  className="col-span-3"
                />
              </div>
            </div>
          )}
          <Button onClick={handleSaveExerciseDatabaseEdit}>Save Changes</Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ExerciseCard;
