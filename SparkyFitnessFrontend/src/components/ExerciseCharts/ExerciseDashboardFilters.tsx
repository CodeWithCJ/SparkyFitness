import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ExerciseDashboardFiltersProps {
  aggregationLevel: string;
  setAggregationLevel: (value: string) => void;
  comparisonPeriod: string | null;
  setComparisonPeriod: (value: string | null) => void;
  selectedEquipment: string | null;
  setSelectedEquipment: (value: string | null) => void;
  selectedMuscle: string | null;
  setSelectedMuscle: (value: string | null) => void;
  selectedExercise: string;
  setSelectedExercise: (value: string) => void;
  availableEquipment: string[];
  availableMuscles: string[];
  availableExercises: { id: string; name: string }[];
}

export const ExerciseDashboardFilters = ({
  aggregationLevel,
  setAggregationLevel,
  comparisonPeriod,
  setComparisonPeriod,
  selectedEquipment,
  setSelectedEquipment,
  selectedMuscle,
  setSelectedMuscle,
  selectedExercise,
  setSelectedExercise,
  availableEquipment,
  availableMuscles,
  availableExercises,
}: ExerciseDashboardFiltersProps) => {
  const { t } = useTranslation();

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>
          {t(
            'exerciseReportsDashboard.filtersAggregation',
            'Filters & Aggregation'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Select value={aggregationLevel} onValueChange={setAggregationLevel}>
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t(
                  'exerciseReportsDashboard.aggregation',
                  'Aggregation'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">
                {t('exerciseReportsDashboard.daily', 'Daily')}
              </SelectItem>
              <SelectItem value="weekly">
                {t('exerciseReportsDashboard.weekly', 'Weekly')}
              </SelectItem>
              <SelectItem value="monthly">
                {t('exerciseReportsDashboard.monthly', 'Monthly')}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={comparisonPeriod || 'none'}
            onValueChange={(value) =>
              setComparisonPeriod(value === 'none' ? null : value)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t(
                  'exerciseReportsDashboard.compareTo',
                  'Compare to'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t('exerciseReportsDashboard.noComparison', 'No Comparison')}
              </SelectItem>
              <SelectItem value="previous-period">
                {t(
                  'exerciseReportsDashboard.previousPeriod',
                  'Previous Period'
                )}
              </SelectItem>
              <SelectItem value="last-year">
                {t('exerciseReportsDashboard.lastYear', 'Last Year')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Select
            value={selectedEquipment || ''}
            onValueChange={(value) =>
              setSelectedEquipment(value === 'All' ? null : value)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t(
                  'exerciseReportsDashboard.filterByEquipment',
                  'Filter by Equipment'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">
                {t('exerciseReportsDashboard.allEquipment', 'All Equipment')}
              </SelectItem>
              {availableEquipment.map((equipment) => (
                <SelectItem key={equipment} value={equipment}>
                  {equipment}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedMuscle || ''}
            onValueChange={(value) =>
              setSelectedMuscle(value === 'All' ? null : value)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t(
                  'exerciseReportsDashboard.filterByMuscleGroup',
                  'Filter by Muscle Group'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">
                {t('exerciseReportsDashboard.allMuscles', 'All Muscles')}
              </SelectItem>
              {availableMuscles.map((muscle) => (
                <SelectItem key={muscle} value={muscle}>
                  {muscle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select
          value={selectedExercise || 'All'}
          onValueChange={(value) => setSelectedExercise(value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={t(
                'exerciseReportsDashboard.selectExercises',
                'Select exercises'
              )}
            >
              {selectedExercise === 'All'
                ? t('exerciseReportsDashboard.allExercises', 'All Exercises')
                : availableExercises.find((ex) => ex.id === selectedExercise)
                    ?.name ||
                  t(
                    'exerciseReportsDashboard.selectExercises',
                    'Select exercises'
                  )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">
              {t('exerciseReportsDashboard.allExercises', 'All Exercises')}
            </SelectItem>
            {availableExercises.map((exercise) => (
              <SelectItem key={exercise.id} value={exercise.id}>
                {exercise.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
};
