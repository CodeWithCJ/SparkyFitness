import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { FastingLog } from '@/services/fastingService';

interface FastingReportProps {
    fastingData: FastingLog[];
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042'];

export const FastingReport: React.FC<FastingReportProps> = ({ fastingData }) => {
    const { t } = useTranslation();

    // Compute summary statistics
    const summary = useMemo(() => {
        const totalFasts = fastingData.length;
        const totalMinutes = fastingData.reduce((sum, f) => sum + (f.duration_minutes ?? 0), 0);
        const avgDuration = totalFasts ? totalMinutes / totalFasts : 0;
        const longestFast = Math.max(...fastingData.map(f => f.duration_minutes ?? 0), 0);
        return {
            totalFasts,
            totalHours: (totalMinutes / 60).toFixed(1),
            avgDuration: avgDuration.toFixed(1),
            longestFast: (longestFast / 60).toFixed(1),
        };
    }, [fastingData]);

    // Daily fasting duration for bar chart
    const dailyData = useMemo(() => {
        const map: Record<string, number> = {};
        fastingData.forEach(f => {
            const date = new Date(f.start_time).toLocaleDateString();
            const mins = f.duration_minutes ?? 0;
            map[date] = (map[date] || 0) + mins / 60; // hours
        });
        return Object.entries(map).map(([date, hours]) => ({ date, hours: Number(hours.toFixed(2)) }));
    }, [fastingData]);

    // Zone distribution (simple example based on duration)
    const zoneData = useMemo(() => {
        const zones: Record<string, number> = { Anabolic: 0, Catabolic: 0, FatBurning: 0, Ketosis: 0 };
        fastingData.forEach(f => {
            const hrs = (f.duration_minutes ?? 0) / 60;
            if (hrs < 12) zones.Anabolic += 1;
            else if (hrs < 16) zones.Catabolic += 1;
            else if (hrs < 20) zones.FatBurning += 1;
            else zones.Ketosis += 1;
        });
        return Object.entries(zones).map(([name, value]) => ({ name, value }));
    }, [fastingData]);

    // Consistency calendar data (heatmap style) – simplified as array of dates with count
    const calendarData = useMemo(() => {
        const map: Record<string, number> = {};
        fastingData.forEach(f => {
            const date = new Date(f.start_time).toISOString().split('T')[0];
            map[date] = (map[date] || 0) + 1;
        });
        return Object.entries(map).map(([date, count]) => ({ date, count }));
    }, [fastingData]);

    // Trend line (moving average of daily hours)
    const trendData = useMemo(() => {
        const sorted = dailyData.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const window = 3;
        return sorted.map((d, i) => {
            const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
            const avg = slice.reduce((s, cur) => s + cur.hours, 0) / slice.length;
            return { date: d.date, avg: Number(avg.toFixed(2)) };
        });
    }, [dailyData]);

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('reports.fasting.totalFasts', 'Total Fasts')}</CardTitle>
                    </CardHeader>
                    <CardContent>{summary.totalFasts}</CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>{t('reports.fasting.totalHours', 'Total Hours')}</CardTitle>
                    </CardHeader>
                    <CardContent>{summary.totalHours}</CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>{t('reports.fasting.avgDuration', 'Avg Duration (hrs)')}</CardTitle>
                    </CardHeader>
                    <CardContent>{summary.avgDuration}</CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>{t('reports.fasting.longestFast', 'Longest Fast (hrs)')}</CardTitle>
                    </CardHeader>
                    <CardContent>{summary.longestFast}</CardContent>
                </Card>
            </div>

            {/* Daily Fasting Duration Bar Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('reports.fasting.dailyDuration', 'Daily Fasting Duration')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dailyData}>
                            <XAxis dataKey="date" />
                            <YAxis label={{ value: t('reports.fasting.hours', 'Hours'), angle: -90, position: 'insideLeft' }} />
                            <Tooltip />
                            <Bar dataKey="hours" fill="#8884d8" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Fasting Zones Distribution Pie Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('reports.fasting.zoneDistribution', 'Fasting Zones')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={zoneData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                {zoneData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Consistency Calendar (simple heatmap) */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('reports.fasting.consistency', 'Fasting Consistency')}</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* For brevity, render as a list of dates with count */}
                    <ul className="space-y-1">
                        {calendarData.map(d => (
                            <li key={d.date}>
                                {d.date}: {d.count} {t('reports.fasting.fast', 'fast')}{d.count > 1 ? 's' : ''}
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>

            {/* Fasting Trends Line Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('reports.fasting.trends', 'Fasting Trends')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis label={{ value: t('reports.fasting.avgHours', 'Avg Hours'), angle: -90, position: 'insideLeft' }} />
                            <Tooltip />
                            <Line type="monotone" dataKey="avg" stroke="#82ca9d" />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
};
