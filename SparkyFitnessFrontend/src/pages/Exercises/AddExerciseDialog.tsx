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

interface AddExerciseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExerciseAdded: (
    exercise?: Exercise,
    sourceMode?: 'internal' | 'external' | 'custom' | 'preset'
  ) => void;
  onWorkoutPresetSelected?: (preset: WorkoutPreset) => void; // New prop for selecting a workout preset
  mode: 'preset' | 'workout-plan' | 'diary' | 'database-manager';
  initialTab?: 'my-exercises' | 'workout-preset' | 'online' | 'custom';
}

type AddExerciseDialogTab = NonNullable<AddExerciseDialogProps['initialTab']>;

const AddExerciseDialog = ({
  open,
  onOpenChange,
  onExerciseAdded,
  mode,
  onWorkoutPresetSelected,
  initialTab,
}: AddExerciseDialogProps) => {
  const { t } = useTranslation();
  const customForm = useAddCustomExerciseForm(onExerciseAdded, onOpenChange);
  const [activeTab, setActiveTab] = useState(
    initialTab ?? (mode === 'database-manager' ? 'online' : 'my-exercises')
  );

  const tabsListClass = 'h-10 flex w-full justify-center flex-wrap';

  const handleExerciseSelect = (
    exercise: Exercise,
    sourceMode: 'internal' | 'external'
  ) => {
    toast({
      title: t('common.success', 'Success'),
      description: t(
        'exercise.addExerciseDialog.addSuccess',
        'Exercise added successfully'
      ),
    });
    onExerciseAdded(exercise, sourceMode); // Pass the selected exercise and source mode
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
            {t('exercise.addExerciseDialog.title', 'Add Exercise')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t(
              'exercise.addExerciseDialog.description',
              'Add a new exercise to your database, either by creating a custom one or importing from an external source.'
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          defaultValue={activeTab}
          onValueChange={(value) => setActiveTab(value as AddExerciseDialogTab)}
        >
          <TabsList className={tabsListClass}>
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
