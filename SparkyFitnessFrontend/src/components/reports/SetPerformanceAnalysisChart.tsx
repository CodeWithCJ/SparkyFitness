import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import ZoomableChart from '../ZoomableChart';

interface SetPerformanceAnalysisChartProps {
  setPerformanceData: {
    setName: string;
    avgWeight: number;
    avgReps: number;
  }[];
  exerciseName?: string; // New prop for exercise name
}

const SetPerformanceAnalysisChart: React.FC<SetPerformanceAnalysisChartProps> = ({ setPerformanceData, exerciseName }) => {
  const { t } = useTranslation();
  if (!setPerformanceData || setPerformanceData.length === 0) {
    return null;
  }

  const chartTitle = exerciseName ? t('reports.setPerformanceAnalysis.titleWithExercise', `Set Performance Analysis - ${exerciseName}`, { exerciseName }) : t('reports.setPerformanceAnalysis.title', 'Set Performance Analysis');

  return (
    <ZoomableChart title={chartTitle}>
      {(isMaximized, zoomLevel) => (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{chartTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
              <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                <BarChart data={setPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="setName"
                    tickCount={isMaximized ? Math.max(setPerformanceData.length, 10) : undefined}
                  />
                  <YAxis yAxisId="left" label={{ value: t('reports.setPerformanceAnalysis.avgWeightKg', 'Avg. Weight (kg)'), angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: t('reports.setPerformanceAnalysis.avgReps', 'Avg. Reps'), angle: -90, position: 'insideRight' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="avgWeight" fill="#8884d8" name={t('reports.setPerformanceAnalysis.avgWeight', 'Avg. Weight')} />
                  <Bar yAxisId="right" dataKey="avgReps" fill="#82ca9d" name={t('reports.setPerformanceAnalysis.avgReps', 'Avg. Reps')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};

export default SetPerformanceAnalysisChart;