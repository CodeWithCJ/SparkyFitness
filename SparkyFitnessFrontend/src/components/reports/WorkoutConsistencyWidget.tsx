import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WorkoutConsistencyWidgetProps {
  consistencyData: {
    currentStreak: number;
    longestStreak: number;
    weeklyFrequency: number;
    monthlyFrequency: number;
  } | null;
}

const WorkoutConsistencyWidget: React.FC<WorkoutConsistencyWidgetProps> = ({ consistencyData }) => {
  const { t } = useTranslation();

  if (!consistencyData) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg h-full">
        <span className="text-3xl font-bold">{consistencyData.currentStreak}</span>
        <span className="text-sm text-center">{t("reports.exerciseReportsDashboard.currentStreakDays", "Current Streak (days)")}</span>
      </div>
      <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-lg h-full">
        <span className="text-3xl font-bold">{consistencyData.longestStreak}</span>
        <span className="text-sm text-center">{t("reports.exerciseReportsDashboard.longestStreakDays", "Longest Streak (days)")}</span>
      </div>
      <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-emerald-500 to-lime-600 text-white shadow-lg h-full">
        <span className="text-3xl font-bold">{consistencyData.weeklyFrequency.toFixed(1)}</span>
        <span className="text-sm text-center">{t("reports.exerciseReportsDashboard.weeklyFrequency", "Weekly Frequency")}</span>
      </div>
      <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-lg h-full">
        <span className="text-3xl font-bold">{consistencyData.monthlyFrequency.toFixed(1)}</span>
        <span className="text-sm text-center">{t("reports.exerciseReportsDashboard.monthlyFrequency", "Monthly Frequency")}</span>
      </div>
    </>
  );
};

export default WorkoutConsistencyWidget;