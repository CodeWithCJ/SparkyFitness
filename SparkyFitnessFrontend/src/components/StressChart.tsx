import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

interface StressDataPoint {
  time: string;
  stress_level: number;
}

interface StressChartProps {
  data: StressDataPoint[];
  title: string;
}

const StressChart: React.FC<StressChartProps> = ({ data, title }) => {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Filter out data points where 'data' is -1 or -2 (Garmin's way of indicating no data)
  const filteredData = data.filter(point => point.stress_level >= 0);

  // Format data for recharts
  const formattedData = filteredData.map(point => ({
    name: format(parseISO(point.time), 'HH:mm'),
    Stress: point.stress_level,
  }));

  if (!isMounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
            <span className="text-xs text-muted-foreground">Loading stress data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {formattedData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0} debounce={100}>
            <BarChart data={formattedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="Stress" fill="#FC8A15" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p>No stress data available for this period.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default StressChart;