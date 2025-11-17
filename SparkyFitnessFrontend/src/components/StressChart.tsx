import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import moment from 'moment';

interface StressDataPoint {
  time: string;
  data: number;
}

interface StressChartProps {
  data: StressDataPoint[];
  title: string;
}

const StressChart: React.FC<StressChartProps> = ({ data, title }) => {
  // Filter out data points where 'data' is -1 or -2 (Garmin's way of indicating no data)
  const filteredData = data.filter(point => point.data >= 0);

  // Format data for recharts
  const formattedData = filteredData.map(point => ({
    name: moment(point.time).format('HH:mm'),
    Stress: point.data,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {formattedData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={formattedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="Stress" stroke="#8884d8" activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p>No stress data available for this period.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default StressChart;