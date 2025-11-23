import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getMoodDisplay } from '@/utils/moodUtils';
import { MoodEntry } from '@/types';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';

interface MoodChartProps {
  data: MoodEntry[];
  title: string;
}

const MoodChart: React.FC<MoodChartProps> = ({ data, title }) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  // Add logging to check the data prop
  console.log('MoodChart: Received data prop:', data);

  const formattedData = data.map(entry => ({
    date: entry.entry_date,
    moodValue: entry.mood_value,
    moodDisplay: getMoodDisplay(entry.mood_value), // Get both emoji and label
    notes: entry.notes,
  }));

  // Custom Tooltip for Mood Chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0].payload;
      return (
        <div className="p-2 bg-background border rounded-md shadow-md">
          <p className="label">{`${formatDateInUserTimezone(entry.date, 'MMM dd, yyyy')}`}</p>
          <p className="intro">{`${t('mood.moodValue', 'Mood Value')}: ${entry.moodValue} ${entry.moodDisplay.emoji} (${entry.moodDisplay.label})`}</p>
          {entry.notes && <p className="desc" style={{ marginTop: '5px' }}>{t('mood.notes', 'Notes: ') + entry.notes}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {formattedData.length > 0 ? (
          <ResponsiveContainer width="100%" height={500}> {/* Increased height */}
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid />
              <XAxis
                dataKey="date"
                name={t('mood.date', 'Date')}
                tickFormatter={(tickItem) => formatDateInUserTimezone(tickItem, 'MMM dd')}
              />
              <YAxis type="number" dataKey="moodValue" name={t('mood.mood', 'Mood')} domain={[0, 100]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
              <Scatter name={t('mood.dailyMood', 'Daily Mood')} data={formattedData} fill="#8884d8" shape={(props) => {
                const { cx, cy, payload } = props;
                return (
                  <text x={cx} y={cy} dy={5} textAnchor="middle" dominantBaseline="middle" className="custom-chart-emoji">
                    {payload.moodDisplay.emoji} {/* Use emoji from moodDisplay */}
                  </text>
                );
              }} />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <p>{t('mood.noMoodData', "No mood data available for this period.")}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default MoodChart;