import { useTranslation } from 'react-i18next';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SetPerformanceAnalysisChart from './SetPerformanceAnalysisChart';
import { usePreferences, type WeightUnit } from '@/contexts/PreferencesContext';
import { formatNumber, formatWeight } from '@/utils/numberFormatting';
import {
  FaDumbbell,
  FaClock,
  FaWeightHanging,
  FaRedo,
  FaTrophy,
  FaWeight,
  FaChartLine,
} from 'react-icons/fa';
import { WorkoutData } from '@/types/reports';

interface WorkoutEndCondition {
  conditionTypeKey?: string;
}

interface WorkoutWeightUnit {
  unitKey?: string;
}

interface WorkoutStep {
  type?: string;
  workoutSteps?: WorkoutStep[];
  weightValue?: number;
  endCondition?: WorkoutEndCondition;
  endConditionValue?: number;
  exerciseName?: string;
  category?: string;
  weightUnit?: WorkoutWeightUnit;
}

interface WorkoutSegment {
  segmentOrder?: number;
  workoutSteps?: WorkoutStep[];
}

interface WorkoutReportVisualizerProps {
  workoutData: WorkoutData;
}

interface SetPerformanceData {
  setName: string;
  avgWeight: number;
  avgReps: number;
}

interface PrProgressionData {
  date: string;
  oneRM: number;
  weight: number;
  reps: number;
}

const WorkoutReportVisualizer = ({
  workoutData,
}: WorkoutReportVisualizerProps) => {
  const { t } = useTranslation();
  const { weightUnit, convertWeight } = usePreferences();

  if (!workoutData) return null;

  const { description, sportType, estimatedDurationInSecs, workoutSegments } =
    workoutData;

  const getAllExecutableSteps = (segments: WorkoutSegment[]): WorkoutStep[] => {
    const executableSteps: WorkoutStep[] = [];
    segments?.forEach((segment) => {
      segment.workoutSteps?.forEach((step: WorkoutStep) => {
        if (step.type === 'ExecutableStepDTO') {
          executableSteps.push(step);
        } else if (step.type === 'RepeatGroupDTO' && step.workoutSteps) {
          step.workoutSteps.forEach((nestedStep: WorkoutStep) => {
            if (nestedStep.type === 'ExecutableStepDTO') {
              executableSteps.push(nestedStep);
            }
          });
        }
      });
    });
    return executableSteps;
  };

  const allExecutableSteps = getAllExecutableSteps(
    (workoutSegments as unknown as WorkoutSegment[]) || []
  );

  const totalVolume =
    allExecutableSteps.reduce((total, step) => {
      if (step.weightValue && step.endCondition?.conditionTypeKey === 'reps') {
        const weight = step.weightValue || 0;
        const reps = step.endConditionValue || 0;
        return total + weight * reps;
      }
      return total;
    }, 0) || 0;

  const totalReps =
    allExecutableSteps.reduce((total, step) => {
      if (step.endCondition?.conditionTypeKey === 'reps') {
        return total + (step.endConditionValue || 0);
      }
      return total;
    }, 0) || 0;

  const setPerformanceData: Record<string, SetPerformanceData[]> = {};

  allExecutableSteps.forEach((step: WorkoutStep, stepIndex: number) => {
    if (step.exerciseName) {
      const exerciseName = step.exerciseName;
      const setName = `Set ${stepIndex + 1}`;
      const weight = step.weightValue || 0;
      const reps = step.endConditionValue || 0;

      if (!setPerformanceData[exerciseName]) {
        setPerformanceData[exerciseName] = [];
      }
      setPerformanceData[exerciseName].push({
        setName,
        avgWeight: weight,
        avgReps: reps,
      });
    }
  });

  const prProgressionData: Record<string, PrProgressionData[]> = {};
  const today = formatDateToYYYYMMDD(new Date());

  allExecutableSteps.forEach((step) => {
    if (step.exerciseName) {
      const exerciseName = step.exerciseName;
      const weight = step.weightValue || 0;
      const reps = step.endConditionValue || 0;
      const oneRM = weight * (1 + reps / 30);

      if (!prProgressionData[exerciseName]) {
        prProgressionData[exerciseName] = [];
      }
      const existingPr = prProgressionData[exerciseName][0];
      if (!existingPr || oneRM > existingPr.oneRM) {
        prProgressionData[exerciseName] = [
          { date: today ?? '', oneRM, weight, reps },
        ];
      }
    }
  });

  return (
    <>
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-2">
          {t('workoutReport.workoutStats', 'Workout Stats')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-sm font-medium">
                {t('workoutReport.sport', 'Sport')}
              </CardTitle>
              <FaDumbbell className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {sportType?.sportTypeKey || t('common.notApplicable', 'N/A')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-sm font-medium">
                {t('workoutReport.estDuration', 'Est. Duration')}
              </CardTitle>
              <FaClock className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {estimatedDurationInSecs
                  ? `${(estimatedDurationInSecs / 60).toFixed(0)} min`
                  : t('common.notApplicable', 'N/A')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-sm font-medium">
                {t('workoutReport.totalVolume', 'Total Volume')}
              </CardTitle>
              <FaWeightHanging className="h-5 w-5 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(Math.round(totalVolume))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-sm font-medium">
                {t('workoutReport.totalReps', 'Total Reps')}
              </CardTitle>
              <FaRedo className="h-5 w-5 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(Math.round(totalReps))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {description && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">
            {t('workoutReport.description', 'Description')}
          </h3>
          <p>{description}</p>
        </div>
      )}

      {allExecutableSteps.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">
            {t('workoutReport.workoutSteps', 'Workout Steps')}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {t('workoutReport.step', 'Step')}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {t('workoutReport.exercise', 'Exercise')}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {t('workoutReport.target', 'Target')}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {t('workoutReport.weight', 'Weight')} ({weightUnit})
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allExecutableSteps.map((step: WorkoutStep, index: number) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {step.exerciseName ||
                        step.category ||
                        t('common.notApplicable', 'N/A')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {step.endConditionValue}{' '}
                      {step.endCondition?.conditionTypeKey}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {step.weightValue
                        ? formatWeight(
                            convertWeight(
                              step.weightValue,
                              (step.weightUnit?.unitKey === 'pound'
                                ? 'lbs'
                                : step.weightUnit?.unitKey ||
                                  'kg') as WeightUnit,
                              'kg'
                            ),
                            weightUnit
                          )
                        : t('common.notApplicable', 'N/A')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Object.keys(setPerformanceData).length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">
            {t(
              'workoutReport.setPerformanceAnalysis',
              'Set Performance Analysis'
            )}
          </h3>
          {Object.entries(setPerformanceData).map(([exerciseName, data]) => (
            <SetPerformanceAnalysisChart
              key={`set-performance-${exerciseName}`}
              setPerformanceData={data.map((d) => ({
                setName: d.setName,
                avgWeight: convertWeight(d.avgWeight, 'lbs', 'kg'),
                avgReps: d.avgReps,
              }))}
              exerciseName={exerciseName}
            />
          ))}
        </div>
      )}

      {Object.keys(prProgressionData).length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">
            {t('workoutReport.personalRecords', 'Personal Records (PRs)')}
          </h3>
          {Object.entries(prProgressionData).map(([exerciseName, data]) => (
            <Card key={`pr-progression-${exerciseName}`} className="mb-4">
              <CardHeader>
                <CardTitle className="text-sm">
                  {t('workoutReport.prs', 'PRs - ')}
                  {exerciseName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.map((pr, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2"
                  >
                    <div className="flex flex-col items-center justify-center p-2 border rounded-lg">
                      <FaTrophy className="h-5 w-5 text-yellow-500 mb-1" />
                      <span className="text-lg font-bold">
                        {formatWeight(
                          convertWeight(pr.oneRM, 'lbs', 'kg'),
                          weightUnit
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('workoutReport.estimated1RM', 'Estimated 1RM')}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-2 border rounded-lg">
                      <FaWeight className="h-5 w-5 text-red-500 mb-1" />
                      <span className="text-lg font-bold">
                        {formatWeight(
                          convertWeight(pr.weight, 'lbs', 'kg'),
                          weightUnit
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('workoutReport.maxWeight', 'Max Weight')}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-2 border rounded-lg">
                      <FaChartLine className="h-5 w-5 text-green-500 mb-1" />
                      <span className="text-lg font-bold">
                        {formatNumber(Math.round(pr.reps))}{' '}
                        {t('workoutReport.maxReps', 'reps')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('workoutReport.maxReps', 'Max Reps')}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
};

export default WorkoutReportVisualizer;
