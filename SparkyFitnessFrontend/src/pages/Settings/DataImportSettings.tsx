import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Utensils,
  NotebookPen,
  HeartPulse,
  Dumbbell,
  Upload,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/use-toast';
import FoodImportFromCSV from '@/pages/Foods/FoodImportFromCSV';
import FoodDiaryImportCSV from '@/pages/Diary/FoodDiaryImportCSV';
import HealthDataImportCSV from '@/pages/CheckIn/HealthDataImportCSV';
import ExerciseImportCSV, {
  type ExerciseCSVData,
} from '@/pages/Exercises/ExerciseImportCSV';
import ExerciseEntryHistoryImportCSV from '@/pages/Exercises/ExerciseEntryHistoryImportCSV';
import ExerciseImportFit from '@/pages/Exercises/ExerciseImportFit';
import { useImportCsvMutation } from '@/hooks/Foods/useFoods';
import { useImportFoodDiaryCsvMutation } from '@/hooks/Diary/useFoodEntries';
import { useImportExercisesJsonMutation } from '@/hooks/Exercises/useExercises';
import type { FoodDataForBackend } from '@/types/food';
import type { FoodDiaryImportRow, FoodDiaryImportScope } from '@/types/diary';

interface ImportConflictError {
  status?: number;
  data?: { duplicates?: { name: string }[] };
}

// A single import tool: a labelled row with an "Import" button that opens the
// existing importer component in a large confirm-on-close dialog. Centralizing
// them here keeps the infrequent bulk-import tools out of the daily screens.
const ImportLauncher = ({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: (close: () => void) => ReactNode;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <Button
          variant="outline"
          className="flex shrink-0 items-center gap-2"
          onClick={() => setOpen(true)}
        >
          <Upload className="h-4 w-4" />
          {t('settings.dataImport.importButton', 'Import')}
        </Button>
        <DialogContent
          requireConfirmation
          className="w-[98vw] max-w-[1800px] h-[92vh] max-h-[92vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children(() => setOpen(false))}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const DataImportSettings = () => {
  const { t } = useTranslation();
  const { mutateAsync: importFoodsCsv } = useImportCsvMutation();
  const { mutateAsync: importFoodDiaryCsv } = useImportFoodDiaryCsvMutation();
  const { mutateAsync: importExercisesJson } = useImportExercisesJsonMutation();

  const handleFoodSave = async (
    foods: FoodDataForBackend[],
    overwrite: boolean
  ) => {
    await importFoodsCsv({ foods, overwrite });
  };

  const handleFoodDiarySave = (
    entries: FoodDiaryImportRow[],
    scope: FoodDiaryImportScope,
    overrideNutrition: boolean
  ) => importFoodDiaryCsv({ entries, scope, overrideNutrition });

  // Mirrors AddExerciseDialog.handleImportFromCSV: surfaces the 409 duplicate
  // conflict as a toast instead of failing silently.
  const handleExerciseSave = async (
    exercises: Omit<ExerciseCSVData, 'id'>[]
  ) => {
    try {
      await importExercisesJson(exercises);
    } catch (err: unknown) {
      const error = err as ImportConflictError;
      if (error?.status === 409 && error.data?.duplicates) {
        const duplicateList = error.data.duplicates
          .map((d) => `"${d.name}"`)
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
      throw err;
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-6">
      <h3 className="text-lg font-medium">
        {t('settings.dataImport.title', 'Data Import')}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t(
          'settings.dataImport.description',
          'Bulk-import your data from CSV files. These tools are for one-time migrations and periodic backfills, so they live here rather than on the daily screens.'
        )}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <ImportLauncher
          icon={Utensils}
          title={t('settings.dataImport.food.title', 'Food Database (CSV)')}
          description={t(
            'settings.dataImport.food.description',
            'Add reusable foods (with servings and nutrition) to your food library.'
          )}
        >
          {() => <FoodImportFromCSV onSave={handleFoodSave} />}
        </ImportLauncher>
        <ImportLauncher
          icon={NotebookPen}
          title={t('settings.dataImport.diary.title', 'Food Diary (CSV)')}
          description={t(
            'settings.dataImport.diary.description',
            'Log past meals to your food diary by date and meal type, matching or creating foods as needed.'
          )}
        >
          {() => <FoodDiaryImportCSV onSave={handleFoodDiarySave} />}
        </ImportLauncher>

        <ImportLauncher
          icon={HeartPulse}
          title={t(
            'settings.dataImport.checkin.title',
            'Check-in & Health Data (CSV)'
          )}
          description={t(
            'settings.dataImport.checkin.description',
            'Import body measurements, sleep, vitals, activity, hydration, and mood.'
          )}
        >
          {() => <HealthDataImportCSV />}
        </ImportLauncher>

        <ImportLauncher
          icon={Dumbbell}
          title={t(
            'settings.dataImport.exercise.title',
            'Exercise Database (CSV)'
          )}
          description={t(
            'settings.dataImport.exercise.description',
            'Add reusable exercises to your exercise database.'
          )}
        >
          {() => <ExerciseImportCSV onSave={handleExerciseSave} />}
        </ImportLauncher>

        <ImportLauncher
          icon={Dumbbell}
          title={t(
            'settings.dataImport.exerciseHistory.title',
            'Workout History (CSV)'
          )}
          description={t(
            'settings.dataImport.exerciseHistory.description',
            'Import past workouts, sets, reps, and weights.'
          )}
        >
          {(close) => (
            <ExerciseEntryHistoryImportCSV onImportComplete={close} />
          )}
        </ImportLauncher>

        <ImportLauncher
          icon={Activity}
          title={t(
            'settings.dataImport.garminFit.title',
            'Workout Activities (FIT)'
          )}
          description={t(
            'settings.dataImport.garminFit.description',
            'Import workouts and activity data from binary .fit files.'
          )}
        >
          {() => <ExerciseImportFit />}
        </ImportLauncher>
      </div>
    </div>
  );
};
