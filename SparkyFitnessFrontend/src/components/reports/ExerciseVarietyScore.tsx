import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ExerciseVarietyScoreProps {
  varietyData: {
    [muscleGroup: string]: number;
  } | null;
}

const ExerciseVarietyScore: React.FC<ExerciseVarietyScoreProps> = ({ varietyData }) => {
  const { t } = useTranslation();

  if (!varietyData || Object.keys(varietyData).length === 0) {
    return null;
  }

  const chartData = Object.entries(varietyData).map(([muscle, count]) => ({
    muscle,
    count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('reports.exerciseVarietyScore', 'Exercise Variety Score')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="muscle" />
            <YAxis allowDecimals={false} label={{ value: t('reports.uniqueExercises', 'Unique Exercises'), angle: -90, position: 'insideLeft' }} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
            <Legend />
            <Bar dataKey="count" fill="#ff7300" name={t('reports.uniqueExercises', 'Unique Exercises')} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default ExerciseVarietyScore;