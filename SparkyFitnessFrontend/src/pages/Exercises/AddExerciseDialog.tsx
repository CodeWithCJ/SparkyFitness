import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import ExerciseSearch from './ExerciseSearch';
import WorkoutPresetSelector from './WorkoutPresetSelector';
import type { WorkoutPreset } from '@/types/workout';
import { toast } from '@/hooks/use-toast';
import { Exercise } from '@/types/exercises';
import { useAddCustomExerciseForm } from '@/hooks/Exercises/useAddCustomExerciseForm';
import AddCustomExerciseForm from './AddCustomExerciseForm';
import ExerciseAlternativesPanel from './ExerciseAlternativesPanel';
import type { ExerciseReplaceContext } from '@/utils/exerciseAlternatives';
import { normalizeExerciseArrays } from '@/utils/exerciseArrays';

interface AddExerciseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExerciseAdded: (
    exercise?: Exercise,
    sourceMode?: 'internal' | 'external' | 'custom' | 'preset'
  ) => void;
  onWorkoutPresetSelected?: (preset: WorkoutPreset) => void; // New prop for selecting a workout preset
  mode: 'preset' | 'workout-plan' | 'diary' | 'database-manager';
  initialTab?:
    'suggested' | 'my-exercises' | 'workout-preset' | 'online' | 'custom';
  /** Set when replacing an exercise: adds a ranked "Suggested" tab. */
  replaceFor?: ExerciseReplaceContext;
}

type AddExerciseDialogTab = NonNullable<AddExerciseDialogProps['initialTab']>;

const AddExerciseDialog = ({
  open,
  onOpenChange,
  onExerciseAdded,
  mode,
  onWorkoutPresetSelected,
  initialTab,
  replaceFor,
}: AddExerciseDialogProps) => {
  const { t } = useTranslation();
  // Created and imported exercises come back as stored, with JSON-text array
  // columns, so every tab hands its consumer normalized arrays.
  const addExercise: AddExerciseDialogProps['onExerciseAdded'] = (
    exercise,
    sourceMode
  ) =>
    onExerciseAdded(
      exercise ? normalizeExerciseArrays(exercise) : exercise,
      sourceMode
    );
  const customForm = useAddCustomExerciseForm(addExercise, onOpenChange);
  const openingTab: AddExerciseDialogTab =
    initialTab ??
    (replaceFor
      ? 'suggested'
      : mode === 'database-manager'
        ? 'online'
        : 'my-exercises');
  const [activeTab, setActiveTab] = useState<AddExerciseDialogTab>(openingTab);
  // The tabs are controlled (so "Search all exercises" can switch them), so
  // reset to the opening tab each time the dialog opens — the same dialog
  // serves both Add and Replace.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setActiveTab(openingTab);
  }

  const tabsListClass = 'h-10 flex w-full justify-center flex-wrap';

  const handleExerciseSelect = (
    exercise: Exercise,
    sourceMode: 'internal' | 'external'
  ) => {
    toast({
      title: t('common.success', 'Success'),
      description: replaceFor
        ? t('exercise.addExerciseDialog.replaceSuccess', 'Exercise replaced')
        : t(
            'exercise.addExerciseDialog.addSuccess',
            'Exercise added successfully'
          ),
    });
    addExercise(exercise, sourceMode);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        requireConfirmation
        className="sm:max-w-[800px] overflow-y-auto max-h-[90vh]"
      >
        <DialogHeader>
          <DialogTitle className="text-center">
            {replaceFor
              ? t('exercise.addExerciseDialog.replaceTitle', 'Replace Exercise')
              : t('exercise.addExerciseDialog.title', 'Add Exercise')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t(
              'exercise.addExerciseDialog.description',
              'Add a new exercise to your database, either by creating a custom one or importing from an external source.'
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as AddExerciseDialogTab)}
        >
          <TabsList className={tabsListClass}>
            {replaceFor && (
              <TabsTrigger value="suggested">
                {t('exercise.addExerciseDialog.suggestedTab', 'Suggested')}
              </TabsTrigger>
            )}
            {mode !== 'database-manager' && (
              <TabsTrigger value="my-exercises">
                {t('exercise.addExerciseDialog.myExercisesTab', 'My Exercises')}
              </TabsTrigger>
            )}
            {(mode === 'diary' || mode === 'workout-plan') && (
              <TabsTrigger value="workout-preset">
                {t(
                  'exercise.addExerciseDialog.workoutPresetTab',
                  'Workout Preset'
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="online">
              {t('exercise.addExerciseDialog.onlineTab', 'Online')}
            </TabsTrigger>
            <TabsTrigger value="custom">
              {t('exercise.addExerciseDialog.addCustomTab', 'Add Custom')}
            </TabsTrigger>
          </TabsList>
          {replaceFor && (
            <TabsContent value="suggested">
              <div className="pt-4">
                <ExerciseAlternativesPanel
                  replaceFor={replaceFor}
                  onSelect={handleExerciseSelect}
                  onSearchAll={() => setActiveTab('my-exercises')}
                />
              </div>
            </TabsContent>
          )}
          {mode !== 'database-manager' && (
            <TabsContent value="my-exercises">
              <div className="pt-4">
                <ExerciseSearch
                  onExerciseSelect={(exercise, source) =>
                    handleExerciseSelect(exercise, source)
                  }
                  disableTabs={true}
                  initialSearchSource="internal"
                />
              </div>
            </TabsContent>
          )}
          <TabsContent value="online">
            <div className="pt-4">
              <ExerciseSearch
                onExerciseSelect={(exercise, source) =>
                  handleExerciseSelect(exercise, source)
                }
                disableTabs={true}
                initialSearchSource="external"
              />
            </div>
          </TabsContent>
          <TabsContent value="custom" className="overflow-y-auto max-h-full">
            <AddCustomExerciseForm form={customForm} />
          </TabsContent>

          {(mode === 'diary' || mode === 'workout-plan') && (
            <TabsContent value="workout-preset">
              <div className="pt-4">
                <WorkoutPresetSelector
                  onPresetSelected={(preset) => {
                    if (onWorkoutPresetSelected) {
                      onWorkoutPresetSelected(preset);
                    }
                    onOpenChange(false); // Close the dialog after selecting a preset
                  }}
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AddExerciseDialog;
