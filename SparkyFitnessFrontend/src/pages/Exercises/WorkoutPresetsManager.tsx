import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, CalendarPlus, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { WorkoutPreset } from '@/types/workout';
import WorkoutPresetForm from './WorkoutPresetForm';
import {
  useCreateWorkoutPresetMutation,
  useDeleteWorkoutPresetMutation,
  useUpdateWorkoutPresetMutation,
  useWorkoutPresets,
} from '@/hooks/Exercises/useWorkoutPresets';
import { useLogWorkoutPresetMutation } from '@/hooks/Exercises/useExerciseEntries';

const WorkoutPresetsManager = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [isAddPresetDialogOpen, setIsAddPresetDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<WorkoutPreset | null>(
    null
  );

  // Infinite Query & Mutations
  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } =
    useWorkoutPresets(user?.id);

  const { mutateAsync: createPreset } = useCreateWorkoutPresetMutation();
  const { mutateAsync: updatePreset } = useUpdateWorkoutPresetMutation();
  const { mutateAsync: deletePreset } = useDeleteWorkoutPresetMutation();
  const { mutateAsync: logWorkoutPreset } = useLogWorkoutPresetMutation();

  const presets = data?.pages.flatMap((page) => page.presets) ?? [];

  const handleCreatePreset = async (
    newPresetData: Omit<WorkoutPreset, 'id' | 'created_at' | 'updated_at'>
  ) => {
    if (!user?.id) return;
    await createPreset({ ...newPresetData, user_id: user.id });
    setIsAddPresetDialogOpen(false);
  };

  const handleUpdatePreset = async (
    presetId: string,
    updatedPresetData: Partial<WorkoutPreset>
  ) => {
    await updatePreset({ id: presetId, data: updatedPresetData });
    setIsEditDialogOpen(false);
    setSelectedPreset(null);
  };

  const handleDeletePreset = async (presetId: string) => {
    await deletePreset(presetId);
  };

  const handleLogPresetToDiary = async (preset: WorkoutPreset) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      await logWorkoutPreset({ presetId: preset.id, date: today });
      toast({
        title: t('common.success', 'Success'),
        description: t('workoutPresetsManager.logSuccess', {
          presetName: preset.name,
        }),
      });
    } catch (err) {
      toast({
        title: t('common.error', 'Error'),
        description: t('workoutPresetsManager.logError', {
          presetName: preset.name,
        }),
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <div className="flex flex-row items-center justify-end space-y-0 pb-2">
        <Button size="sm" onClick={() => setIsAddPresetDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('workoutPresetsManager.addPresetButton', 'Add presets')}
        </Button>
      </div>

      {presets.length === 0 && !isLoading ? (
        <p className="text-center text-muted-foreground">
          {t(
            'workoutPresetsManager.noPresetsFound',
            'No workout presets found.'
          )}
        </p>
      ) : (
        <div className="space-y-4">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex-1 min-w-0 mr-4">
                <h4 className="font-medium truncate">{preset.name}</h4>
                {preset.description && (
                  <p className="text-sm text-muted-foreground truncate">
                    {preset.description}
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {preset.exercises?.slice(0, 3).map((ex, idx) => (
                    <p key={idx} className="flex items-center gap-2">
                      <span className="font-medium">{ex.exercise_name}</span>
                      {ex.sets && <span>• {ex.sets.length} Sätze</span>}
                    </p>
                  ))}
                  {preset.exercises && preset.exercises.length > 3 && (
                    <p className="text-gray-400 italic mt-0.5">
                      + {preset.exercises.length - 3} more
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleLogPresetToDiary(preset)}
                  title={t('workoutPresetsManager.logToDiary', 'Log to Diary')}
                >
                  <CalendarPlus className="h-4 w-4" />
                </Button>
                {preset.user_id === user?.id && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedPreset(preset);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeletePreset(String(preset.id))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('workoutPresetsManager.loading', 'Loading...')}
              </>
            ) : (
              t('workoutPresetsManager.loadMore', 'Load more')
            )}
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
          onClose={() => {
            setIsEditDialogOpen(false);
            setSelectedPreset(null);
          }}
          onSave={(updatedData) =>
            handleUpdatePreset(String(selectedPreset.id), updatedData)
          }
          initialPreset={selectedPreset}
        />
      )}
    </>
  );
};

export default WorkoutPresetsManager;
