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
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!varietyData || Object.keys(varietyData).length === 0) {
    return null;
  }

  if (!isMounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('reports.exerciseVarietyScore', 'Exercise Variety Score')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
            <span className="text-xs text-muted-foreground">{t('common.loading', 'Loading...')}</span>
          </div>
        </CardContent>
      </Card>
    );
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
        <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0} debounce={100}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="muscle" />
            <YAxis allowDecimals={false} label={{ value: t('reports.uniqueExercises', 'Unique Exercises'), angle: -90, position: 'insideLeft' }} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
            <Legend />
            <Bar dataKey="count" fill="#ff7300" name={t('reports.uniqueExercises', 'Unique Exercises')} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default ExerciseVarietyScore;