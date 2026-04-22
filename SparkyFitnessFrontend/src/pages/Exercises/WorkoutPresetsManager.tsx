import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Plus,
  Edit,
  Trash2,
  CalendarPlus,
  Loader2,
  ChevronDown,
  Layers,
  Dumbbell,
} from 'lucide-react';
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
import { usePreferences } from '@/contexts/PreferencesContext';

const WorkoutPresetsManager = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [isAddPresetDialogOpen, setIsAddPresetDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<WorkoutPreset | null>(
    null
  );

  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } =
    useWorkoutPresets(user?.id);

  const { mutateAsync: createPreset } = useCreateWorkoutPresetMutation();
  const { mutateAsync: updatePreset } = useUpdateWorkoutPresetMutation();
  const { mutateAsync: deletePreset } = useDeleteWorkoutPresetMutation();
  const { mutateAsync: logWorkoutPreset } = useLogWorkoutPresetMutation();

  const presets = data?.pages.flatMap((page) => page.presets) ?? [];

  const handleCreatePreset = async (
    newPresetData: Omit<
      WorkoutPreset,
      'id' | 'created_at' | 'updated_at' | 'user_id'
    >
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
      const today = formatDateToYYYYMMDD(new Date());
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
    <div className="space-y-6">
      <div className="flex justify-end px-1">
        <Button
          onClick={() => setIsAddPresetDialogOpen(true)}
          className="rounded-xl shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('workoutPresetsManager.addPresetButton', 'Add presets')}
        </Button>
      </div>

      {presets.length === 0 && !isLoading ? (
        <p className="text-center text-gray-400 py-10 italic">
          {t(
            'workoutPresetsManager.noPresetsFound',
            'No workout presets found.'
          )}
        </p>
      ) : (
        <div className="space-y-4">
          {presets.map((preset) => (
            <WorkoutPresetItem
              key={preset.id}
              preset={preset}
              userId={user?.id}
              onLog={() => handleLogPresetToDiary(preset)}
              onEdit={() => {
                setSelectedPreset(preset);
                setIsEditDialogOpen(true);
              }}
              onDelete={() => handleDeletePreset(preset.id.toString())}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="ghost"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-gray-500"
          >
            {isFetchingNextPage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
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
            handleUpdatePreset(selectedPreset.id.toString(), updatedData)
          }
          initialPreset={selectedPreset}
        />
      )}
    </div>
  );
};

const WorkoutPresetItem: React.FC<{
  preset: WorkoutPreset;
  userId: string | undefined;
  onLog: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ preset, userId, onLog, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const { weightUnit } = usePreferences();

  const totalSets =
    preset.exercises?.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0) ?? 0;
  const totalWeight =
    preset.exercises?.reduce((sum, ex) => {
      const exerciseVolume =
        ex.sets?.reduce((setSum, set) => {
          return setSum + (set.weight || 0) * (set.reps || 0);
        }, 0) ?? 0;
      return sum + exerciseVolume;
    }, 0) ?? 0;

  return (
    <Card className="overflow-hidden border-0 shadow-md bg-white dark:bg-gray-900 rounded-xl">
      <div className="flex">
        <div className="w-1 flex-shrink-0 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-l-xl" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-3 min-w-0 flex-1 text-left group"
            >
              <span
                className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all duration-200
                  ${
                    isExpanded
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-400 group-hover:border-blue-400 group-hover:text-blue-500'
                  }`}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                />
              </span>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-gray-50 text-base leading-tight truncate">
                    {preset.name}
                  </span>
                  {preset.exercises && preset.exercises.length > 0 && (
                    <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                      {preset.exercises.length}{' '}
                      {preset.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </span>
                  )}
                </div>
                {preset.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {preset.description}
                  </p>
                )}
              </div>
            </button>

            <div className="flex items-center gap-1">
              <ActionButton
                icon={<CalendarPlus className="h-3.5 w-3.5" />}
                label={t('workoutPresetsManager.logToDiary', 'Log to Diary')}
                onClick={onLog}
                colorClass="hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/50"
              />
              {preset.user_id === userId && (
                <>
                  <ActionButton
                    icon={<Edit className="h-3.5 w-3.5" />}
                    label={t('common.edit', 'Edit')}
                    onClick={onEdit}
                    colorClass="hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                  />
                  <ActionButton
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label={t('common.delete', 'Delete')}
                    onClick={onDelete}
                    colorClass="hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
                  />
                </>
              )}
            </div>
          </div>

          <div className="mx-4 mb-4 mt-1 grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-800 bg-gray-50 dark:bg-gray-800/60 rounded-lg overflow-hidden">
            <StatCell
              icon={<Layers className="w-3 h-3" />}
              value={totalSets.toString()}
              label={t('common.totalSets', 'Sets')}
              color="text-blue-600 dark:text-blue-400"
            />
            <StatCell
              icon={<Dumbbell className="w-3 h-3" />}
              value={totalWeight.toString() + weightUnit}
              label={t('common.totalWeight', 'Total Weight')}
              color="text-indigo-600 dark:text-indigo-400"
            />
          </div>
        </div>
      </div>

      {isExpanded && (
        <CardContent className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-800">
          <div className="pt-3 space-y-2">
            {preset.exercises?.map((ex, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all"
              >
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {ex.exercise_name}
                </span>
                {ex.sets && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-500 font-bold">
                    {ex.sets.length} {t('common.sets', 'Sets').toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  colorClass: string;
}> = ({ icon, label, onClick, colorClass }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className={`h-8 w-8 text-gray-400 transition-colors ${colorClass}`}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const StatCell: React.FC<{
  icon: React.ReactNode;
  value: string;
  label: string;
  color: string;
}> = ({ icon, value, label, color }) => (
  <div className="flex flex-col items-center justify-center py-2 px-1 gap-0.5">
    <span className={`${color} flex items-center gap-1`}>
      {icon}
      <span className="font-bold text-sm text-gray-800 dark:text-gray-100">
        {value}
      </span>
    </span>
    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">
      {label}
    </span>
  </div>
);

export default WorkoutPresetsManager;
