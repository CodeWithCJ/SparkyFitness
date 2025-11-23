import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkoutData } from './ActivityReportVisualizer';
import SetPerformanceAnalysisChart from './reports/SetPerformanceAnalysisChart';
import PrProgressionChart from './reports/PrProgressionChart';
import { usePreferences } from "@/contexts/PreferencesContext";
import { formatNumber } from "@/utils/numberFormatting";
import { FaDumbbell, FaClock, FaWeightHanging, FaRedo, FaTrophy, FaWeight, FaChartLine } from 'react-icons/fa'; // Import icons

interface WorkoutReportVisualizerProps {
  workoutData: WorkoutData;
}

const WorkoutReportVisualizer: React.FC<WorkoutReportVisualizerProps> = ({ workoutData }) => {
  const { t } = useTranslation();
  const { weightUnit, convertWeight } = usePreferences(); // Destructure convertWeight

  if (!workoutData) return null;

  const { workoutName, description, sportType, estimatedDurationInSecs, workoutSegments } = workoutData;

  // Helper function to flatten workout steps, handling nested RepeatGroupDTOs
  const getAllExecutableSteps = (segments: any[]) => {
    const executableSteps: any[] = [];
    segments?.forEach(segment => {
      segment.workoutSteps?.forEach((step: any) => {
        if (step.type === 'ExecutableStepDTO') {
          executableSteps.push(step);
        } else if (step.type === 'RepeatGroupDTO' && step.workoutSteps) {
          // Recursively get executable steps from nested repeat groups
          step.workoutSteps.forEach((nestedStep: any) => {
            if (nestedStep.type === 'ExecutableStepDTO') {
              executableSteps.push(nestedStep);
            }
          });
        }
      });
    });
    return executableSteps;
  };

  const allExecutableSteps = getAllExecutableSteps(workoutSegments || []);

  const totalVolume = allExecutableSteps.reduce((total, step) => {
    if (step.weightValue && step.endCondition?.conditionTypeKey === 'reps') {
      const weight = step.weightValue || 0;
      const reps = step.endConditionValue || 0;
      return total + (weight * reps);
    }
    return total;
  }, 0) || 0;

  const totalReps = allExecutableSteps.reduce((total, step) => {
    if (step.endCondition?.conditionTypeKey === 'reps') {
      return total + (step.endConditionValue || 0);
    }
    return total;
  }, 0) || 0;

  // Process data for SetPerformanceAnalysisChart
  const setPerformanceData: Record<string, { setName: string; avgWeight: number; avgReps: number }[]> = {};
  allExecutableSteps.forEach((step: any, stepIndex: number) => {
    if (step.exerciseName) {
      const exerciseName = step.exerciseName;
      const setName = `Set ${stepIndex + 1}`;
      const weight = step.weightValue || 0;
      const reps = step.endConditionValue || 0;

      if (!setPerformanceData[exerciseName]) {
        setPerformanceData[exerciseName] = [];
      }
      setPerformanceData[exerciseName].push({ setName, avgWeight: weight, avgReps: reps });
    }
  });

  // Process data for PrProgressionChart (simplified for a single workout)
  const prProgressionData: Record<string, { date: string; oneRM: number; weight: number; reps: number }[]> = {};
  const today = new Date().toISOString().split('T')[0];
  allExecutableSteps.forEach(step => {
    if (step.exerciseName) {
      const exerciseName = step.exerciseName;
      const weight = step.weightValue || 0;
      const reps = step.endConditionValue || 0;
      const oneRM = weight * (1 + (reps / 30));

      if (!prProgressionData[exerciseName]) {
        prProgressionData[exerciseName] = [];
      }
      const existingPr = prProgressionData[exerciseName][0];
      if (!existingPr || oneRM > existingPr.oneRM) {
        prProgressionData[exerciseName] = [{ date: today, oneRM, weight, reps }];
      }
    }
  });


  return (
    <>
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-2">{t("workoutReport.workoutStats", "Workout Stats")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-sm font-medium">{t("workoutReport.sport", "Sport")}</CardTitle>
              <FaDumbbell className="h-5 w-5 text-blue-500" /> {/* Icon for Sport */}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sportType?.sportTypeKey || t("common.notApplicable", "N/A")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-sm font-medium">{t("workoutReport.estDuration", "Est. Duration")}</CardTitle>
              <FaClock className="h-5 w-5 text-green-500" /> {/* Icon for Duration */}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{estimatedDurationInSecs ? `${(estimatedDurationInSecs / 60).toFixed(0)} min` : t("common.notApplicable", "N/A")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-sm font-medium">{t("workoutReport.totalVolume", "Total Volume")}</CardTitle>
              <FaWeightHanging className="h-5 w-5 text-purple-500" /> {/* Icon for Total Volume */}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Math.round(totalVolume))}</div> {/* Rounded to whole number */}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-sm font-medium">{t("workoutReport.totalReps", "Total Reps")}</CardTitle>
              <FaRedo className="h-5 w-5 text-orange-500" /> {/* Icon for Total Reps */}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Math.round(totalReps))}</div> {/* Rounded to whole number */}
            </CardContent>
          </Card>
        </div>
      </div>

      {description && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">{t("workoutReport.description", "Description")}</h3>
          <p>{description}</p>
        </div>
      )}

      {allExecutableSteps.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">{t("workoutReport.workoutSteps", "Workout Steps")}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("workoutReport.step", "Step")}
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("workoutReport.exercise", "Exercise")}
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("workoutReport.target", "Target")}
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("workoutReport.weight", "Weight")} ({weightUnit}) {/* Moved unit to header */}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allExecutableSteps.map((step: any, index: number) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{step.exerciseName || step.category || t("common.notApplicable", "N/A")}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {step.endConditionValue} {step.endCondition?.conditionTypeKey}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {step.weightValue ? `${formatNumber(Math.round(convertWeight(step.weightValue, step.weightUnit?.unitKey === 'pound' ? 'lbs' : step.weightUnit?.unitKey, weightUnit)))}` : t("common.notApplicable", "N/A")} {/* Converted and rounded */}
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
          <h3 className="text-xl font-semibold mb-2">{t("workoutReport.setPerformanceAnalysis", "Set Performance Analysis")}</h3>
          {Object.entries(setPerformanceData).map(([exerciseName, data]) => (
            <SetPerformanceAnalysisChart
              key={`set-performance-${exerciseName}`}
              setPerformanceData={data.map(d => ({
                setName: d.setName,
                avgWeight: Math.round(convertWeight(d.avgWeight, 'lbs', weightUnit)), // Converted and rounded
                avgReps: d.avgReps
              }))}
              exerciseName={exerciseName}
            />
          ))}
        </div>
      )}

      {Object.keys(prProgressionData).length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">{t("workoutReport.personalRecords", "Personal Records (PRs)")}</h3>
          {Object.entries(prProgressionData).map(([exerciseName, data]) => (
            <Card key={`pr-progression-${exerciseName}`} className="mb-4">
              <CardHeader>
                <CardTitle className="text-sm">{t("workoutReport.prs", "PRs - ")}{exerciseName}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.map((pr, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                    <div className="flex flex-col items-center justify-center p-2 border rounded-lg">
                      <FaTrophy className="h-5 w-5 text-yellow-500 mb-1" />
                      <span className="text-lg font-bold">{formatNumber(Math.round(convertWeight(pr.oneRM, 'lbs', weightUnit)))} {weightUnit}</span> {/* Converted and rounded */}
                      <span className="text-xs text-muted-foreground">{t("workoutReport.estimated1RM", "Estimated 1RM")}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-2 border rounded-lg">
                      <FaWeight className="h-5 w-5 text-red-500 mb-1" />
                      <span className="text-lg font-bold">{formatNumber(Math.round(convertWeight(pr.weight, 'lbs', weightUnit)))} {weightUnit}</span> {/* Converted and rounded */}
                      <span className="text-xs text-muted-foreground">{t("workoutReport.maxWeight", "Max Weight")}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-2 border rounded-lg">
                      <FaChartLine className="h-5 w-5 text-green-500 mb-1" />
                      <span className="text-lg font-bold">{formatNumber(Math.round(pr.reps))} {t("workoutReport.maxReps", "reps")}</span> {/* Rounded */}
                      <span className="text-xs text-muted-foreground">{t("workoutReport.maxReps", "Max Reps")}</span>
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