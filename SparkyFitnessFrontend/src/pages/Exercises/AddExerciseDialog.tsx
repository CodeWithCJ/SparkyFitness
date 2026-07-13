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
import ExerciseImportCSV, { type ExerciseCSVData } from './ExerciseImportCSV';
import ExerciseEntryHistoryImportCSV from './ExerciseEntryHistoryImportCSV';
import ExerciseImportFit from './ExerciseImportFit';
import type { WorkoutPreset } from '@/types/workout';
import { toast } from '@/hooks/use-toast';
import { useImportExercisesJsonMutation } from '@/hooks/Exercises/useExercises';
import { Exercise } from '@/types/exercises';
import { useAddCustomExerciseForm } from '@/hooks/Exercises/useAddCustomExerciseForm';
import AddCustomExerciseForm from './AddCustomExerciseForm';

interface ImportConflictError {
  status?: number;
  data?: {
    duplicates?: Array<{ name: string }>;
  };
}

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
    | 'my-exercises'
    | 'workout-preset'
    | 'online'
    | 'custom'
    | 'import-csv'
    | 'import-history-csv'
    | 'import-fit';
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
  const { mutateAsync: importExerciseFromJson } =
    useImportExercisesJsonMutation();

  // Diary mode shows 7 tabs, which can't fit on one 800px row. Triggers are
  // flex-1, so a plain wrap stretches the last tab across a full second row;
  // a 12-column grid gives balanced rows of 4 (browse) + 3 (import) instead.
  // Below sm the flex wrap is fine because everything wraps anyway.
  const isDiary = mode === 'diary';
  const tabsListClass = isDiary
    ? 'h-auto min-h-10 flex w-full justify-center flex-wrap sm:grid sm:grid-cols-12'
    : 'h-10 flex w-full justify-center flex-wrap';
  const browseTabClass = isDiary ? 'sm:col-span-3' : undefined;
  const importTabClass = isDiary ? 'sm:col-span-4' : undefined;

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

  const handleImportFromCSV = async (
    exerciseDataArray: Omit<ExerciseCSVData, 'id'>[]
  ) => {
    try {
      await importExerciseFromJson(exerciseDataArray);
      onOpenChange(false);
    } catch (err: unknown) {
      const error = err as ImportConflictError;
      if (error?.status === 409 && error.data?.duplicates) {
        const duplicateList = error.data.duplicates
          .map((d: { name: string }) => `"${d.name}"`)
          .join(', ');

        toast({
          title: t(
            'exercise.addExerciseDialog.importDuplicateTitle',
            'Import Failed: Duplicate Items Found'
          ),
          description: t(
            'exercise.addExerciseDialog.importDuplicateDescription',
            'The following items already exist: {{duplicateList}}. Please remove them from your file and try again.',
            { duplicateList }
          ),
          variant: 'destructive',
          duration: 10000,
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        requireConfirmation
        className={
          activeTab === 'import-csv' || activeTab === 'import-history-csv'
            ? 'sm:max-w-[95vw] sm:max-h-[95vh] w-[95vw] h-[95vh] overflow-y-auto'
            : 'sm:max-w-[800px] overflow-y-auto max-h-[90vh]'
        }
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
              <TabsTrigger value="my-exercises" className={browseTabClass}>
                {t('exercise.addExerciseDialog.myExercisesTab', 'My Exercises')}
              </TabsTrigger>
            )}
            {(mode === 'diary' || mode === 'workout-plan') && (
              <TabsTrigger value="workout-preset" className={browseTabClass}>
                {t(
                  'exercise.addExerciseDialog.workoutPresetTab',
                  'Workout Preset'
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="online" className={browseTabClass}>
              {t('exercise.addExerciseDialog.onlineTab', 'Online')}
            </TabsTrigger>
            <TabsTrigger value="custom" className={browseTabClass}>
              {t('exercise.addExerciseDialog.addCustomTab', 'Add Custom')}
            </TabsTrigger>
            <TabsTrigger value="import-csv" className={importTabClass}>
              {t('exercise.addExerciseDialog.importCSVTab', 'Import Exercises')}
            </TabsTrigger>
            {mode === 'diary' && (
              <TabsTrigger
                value="import-history-csv"
                className={importTabClass}
              >
                {t(
                  'exercise.addExerciseDialog.importHistoryCSVTab',
                  'Import History'
                )}
              </TabsTrigger>
            )}
            {mode === 'diary' && (
              <TabsTrigger value="import-fit" className={importTabClass}>
                {t('exercise.addExerciseDialog.importFitTab', 'Import FIT')}
              </TabsTrigger>
            )}
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
          <TabsContent value="import-csv">
            <div className="pt-4">
              <ExerciseImportCSV
                onSave={handleImportFromCSV} // Use the new onSave prop
              />
            </div>
          </TabsContent>
          {mode === 'diary' && (
            <TabsContent value="import-history-csv">
              <div className="pt-4">
                <ExerciseEntryHistoryImportCSV
                  onImportComplete={() => {
                    onOpenChange(false);
                    onExerciseAdded(); // Trigger refresh in parent without passing a full exercise object
                  }}
                />
              </div>
            </TabsContent>
          )}
          {mode === 'diary' && (
            <TabsContent value="import-fit">
              <div className="pt-4">
                <ExerciseImportFit />
              </div>
            </TabsContent>
          )}
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
