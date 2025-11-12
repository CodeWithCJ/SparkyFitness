import React from 'react';
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { usePreferences } from "@/contexts/PreferencesContext";
import ZoomableChart from '../ZoomableChart';

interface PrProgressionChartProps {
  prProgressionData: {
    date: string;
    oneRM: number;
    maxWeight: number;
    maxReps: number;
  }[] | null;
}

const PrProgressionChart: React.FC<PrProgressionChartProps> = ({ prProgressionData }) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();

  if (!prProgressionData || prProgressionData.length === 0) {
    return null;
  }

  const formattedData = prProgressionData.map(d => ({
    ...d,
    date: formatDateInUserTimezone(d.date, 'MMM dd, yyyy'),
  }));

  return (
    <ZoomableChart title={t("prProgressionChart.title", "Personal Record Progression")}>
      {(isMaximized, zoomLevel) => (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("prProgressionChart.title", "Personal Record Progression")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
              <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                <LineChart data={formattedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickCount={isMaximized ? Math.max(formattedData.length, 10) : undefined}
                  />
                  <YAxis yAxisId="left" label={{ value: t("prProgressionChart.weightKg", "Weight (kg)"), angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: t("prProgressionChart.reps", "Reps"), angle: -90, position: 'insideRight' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="oneRM" stroke="#8884d8" name={t("prProgressionChart.estimated1RM", "Estimated 1RM")} />
                  <Line yAxisId="left" type="monotone" dataKey="maxWeight" stroke="#82ca9d" name={t("prProgressionChart.maxWeight", "Max Weight")} />
                  <Line yAxisId="right" type="monotone" dataKey="maxReps" stroke="#ffc658" name={t("prProgressionChart.maxReps", "Max Reps")} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};

export default PrProgressionChart;