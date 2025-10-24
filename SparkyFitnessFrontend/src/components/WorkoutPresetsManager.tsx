import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Share2, Lock, Repeat, Weight, Timer, ListOrdered, CalendarPlus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useAuth } from "@/hooks/useAuth";
import { debug, info, warn, error } from '@/utils/logging';
import {
  getWorkoutPresets,
  createWorkoutPreset,
  updateWorkoutPreset,
  deleteWorkoutPreset,
} from '@/services/workoutPresetService';
import { logWorkoutPreset } from '@/services/exerciseEntryService'; // Import logWorkoutPreset
import { WorkoutPreset, PaginatedWorkoutPresets } from '@/types/workout';
import WorkoutPresetForm from "./WorkoutPresetForm";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WorkoutPresetsManagerProps {
  // onUsePreset: (preset: WorkoutPreset) => void; // No longer needed
}

const WorkoutPresetsManager: React.FC<WorkoutPresetsManagerProps> = () => { // Removed onUsePreset prop
  const { user } = useAuth();
  const { loggingLevel } = usePreferences();
  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [isAddPresetDialogOpen, setIsAddPresetDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<WorkoutPreset | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadPresets = useCallback(async (loadMore = false) => {
    if (!user?.id || loading) return;
    setLoading(true);
    try {
      const currentPage = loadMore ? page + 1 : 1;
      const data: PaginatedWorkoutPresets = await getWorkoutPresets(currentPage, 10);
      setPresets(prev => loadMore ? [...prev, ...data.presets] : data.presets);
      setHasMore(data.presets.length > 0 && data.total > (currentPage * data.limit));
      if (loadMore) {
        setPage(currentPage);
      }
    } catch (err) {
      error(loggingLevel, 'Error loading workout presets:', err);
      toast({
        title: "Error",
        description: "Failed to load workout presets.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, loading, page, loggingLevel]);

  useEffect(() => {
    if (user?.id) {
      loadPresets();
    }
  }, [user?.id, loadPresets]);

  const handleCreatePreset = useCallback(async (newPresetData: Omit<WorkoutPreset, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user?.id) return;
    debug(loggingLevel, "WorkoutPresetsManager: Attempting to create preset:", newPresetData);
    try {
      await createWorkoutPreset({ ...newPresetData, user_id: user.id });
      info(loggingLevel, "WorkoutPresetsManager: Workout preset created successfully.");
      toast({
        title: "Success",
        description: "Workout preset created successfully.",
      });
      loadPresets();
      setIsAddPresetDialogOpen(false);
    } catch (err) {
      error(loggingLevel, 'WorkoutPresetsManager: Error creating workout preset:', err);
      toast({
        title: "Error",
        description: "Failed to create workout preset.",
        variant: "destructive",
      });
    }
  }, [user?.id, loggingLevel, toast, loadPresets]);

  const handleUpdatePreset = useCallback(async (presetId: string, updatedPresetData: Partial<WorkoutPreset>) => {
    if (!user?.id) return;
    debug(loggingLevel, `WorkoutPresetsManager: Attempting to update preset ${presetId} with data:`, updatedPresetData);
    try {
      await updateWorkoutPreset(presetId, updatedPresetData);
      info(loggingLevel, `WorkoutPresetsManager: Workout preset ${presetId} updated successfully.`);
      toast({
        title: "Success",
        description: "Workout preset updated successfully.",
      });
      loadPresets();
      setIsEditDialogOpen(false);
      setSelectedPreset(null);
    } catch (err) {
      error(loggingLevel, 'WorkoutPresetsManager: Error updating workout preset:', err);
      toast({
        title: "Error",
        description: "Failed to update workout preset.",
        variant: "destructive",
      });
    }
  }, [user?.id, loggingLevel, toast, loadPresets]);

  const handleDeletePreset = useCallback(async (presetId: string) => {
    if (!user?.id) return;
    debug(loggingLevel, `WorkoutPresetsManager: Attempting to delete preset ${presetId}`);
    try {
      await deleteWorkoutPreset(presetId);
      info(loggingLevel, `WorkoutPresetsManager: Workout preset ${presetId} deleted successfully.`);
      toast({
        title: "Success",
        description: "Workout preset deleted successfully.",
      });
      loadPresets();
    } catch (err) {
      error(loggingLevel, 'WorkoutPresetsManager: Error deleting workout preset:', err);
      toast({
        title: "Error",
        description: "Failed to delete workout preset.",
        variant: "destructive",
      });
    }
  }, [user?.id, loggingLevel, toast, loadPresets]);

  const handleLogPresetToDiary = useCallback(async (preset: WorkoutPreset) => {
    if (!user?.id) return;
    try {
      const today = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
      await logWorkoutPreset(preset.id, today);
      toast({
        title: "Success",
        description: `Workout preset "${preset.name}" logged to diary.`,
      });
    } catch (err) {
      error(loggingLevel, 'Error logging workout preset to diary:', err);
      toast({
        title: "Error",
        description: `Failed to log workout preset "${preset.name}" to diary.`,
        variant: "destructive",
      });
    }
  }, [user?.id, loggingLevel, toast]);

  return (
    <>
      <div className="flex flex-row items-center justify-end space-y-0 pb-2">
        <Button size="sm" onClick={() => setIsAddPresetDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Preset
        </Button>
      </div>
      {presets.length === 0 ? (
        <p className="text-center text-muted-foreground">No workout presets found. Create one to get started!</p>
      ) : (
        <div className="space-y-4">
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">{preset.name}</h4>
                <p className="text-sm text-muted-foreground">{preset.description}</p>
                {preset.exercises && preset.exercises.length > 0 ? (
                  <div className="text-xs text-muted-foreground mt-1">
                    {preset.exercises.map((ex, idx) => (
                      <p key={idx} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium">{ex.exercise_name}</span>
                        {ex.sets && <span className="flex items-center gap-1"><ListOrdered className="h-3 w-3" /> {ex.sets.length} sets</span>}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No exercises in this preset</p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => handleLogPresetToDiary(preset)}>
                        <CalendarPlus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Log preset to diary</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {/* Share/Lock button - assuming presets can be shared */}
                {preset.user_id === user?.id && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { /* Implement share/unshare logic */ }}
                        >
                          {preset.is_public ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <Share2 className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{preset.is_public ? "Make this preset private" : "Share this preset with the community"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedPreset(preset); setIsEditDialogOpen(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit this preset</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => handleDeletePreset(preset.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete this preset</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          ))}
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button onClick={() => loadPresets(true)} disabled={loading}>
            {loading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}

      <WorkoutPresetForm
        isOpen={isAddPresetDialogOpen}
        onClose={() => setIsAddPresetDialogOpen(false)}
        onSave={handleCreatePreset}
      />

      {selectedPreset && (
        <WorkoutPresetForm
          isOpen={isEditDialogOpen}
          onClose={() => { setIsEditDialogOpen(false); setSelectedPreset(null); }}
          onSave={(updatedData) => handleUpdatePreset(selectedPreset.id, updatedData)}
          initialPreset={selectedPreset}
        />
      )}
    </>
  );
};

export default WorkoutPresetsManager;