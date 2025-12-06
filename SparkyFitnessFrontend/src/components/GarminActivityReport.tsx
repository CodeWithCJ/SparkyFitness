import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { usePreferences } from "@/contexts/PreferencesContext";

interface GarminActivityReportProps {
  exerciseEntryId: string;
}

interface GarminActivityData {
  activity: any;
  details: any;
  splits: any;
  hr_in_timezones: any;
}

const GarminActivityReport: React.FC<GarminActivityReportProps> = ({ exerciseEntryId }) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [garminData, setGarminData] = useState<GarminActivityData | null>(null);

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? t('common.kcalUnit', 'kcal') : t('common.kJUnit', 'kJ');
  };

  useEffect(() => {
    const fetchGarminData = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/exercises/garmin-activity-details/${exerciseEntryId}`);
        setGarminData(response.data);
      } catch (err) {
        setError(t('reports.activityReport.failedToFetchGarminActivityDetails', 'Failed to fetch Garmin activity details.'));
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (exerciseEntryId) {
      fetchGarminData();
    }
  }, [exerciseEntryId]);

  if (loading) {
    return <div>{t('reports.activityReport.loadingGarminActivityReport', 'Loading Garmin activity report...')}</div>;
  }

  if (error) {
    return <div className="text-red-500">{t('reports.activityReport.error', 'Error')}: {error}</div>;
  }

  if (!garminData) {
    return <div>{t('reports.activityReport.noGarminActivityDataAvailable', 'No Garmin activity data available.')}</div>;
  }

  // Data processing for charts
  const paceData = garminData.details?.activityDetailMetrics?.map((metric: any) => {
    const timestamp = metric.metrics[3]; // directTimestamp
    const speed = metric.metrics[2]; // directSpeed (mps)
    const paceMinutesPerKm = speed > 0 ? (1000 / (speed * 60)) : 0; // Convert m/s to min/km
    return {
      timestamp: new Date(timestamp).toLocaleTimeString(),
      speed: speed ? parseFloat(speed.toFixed(2)) : 0,
      pace: paceMinutesPerKm > 0 ? parseFloat(paceMinutesPerKm.toFixed(2)) : 0,
    };
  }).filter((data: any) => data.speed > 0); // Filter out zero speeds for meaningful pace

  const heartRateData = garminData.details?.activityDetailMetrics?.map((metric: any) => {
    const timestamp = metric.metrics[3]; // directTimestamp
    const heartRate = metric.metrics[0]; // directHeartRate
    return {
      timestamp: new Date(timestamp).toLocaleTimeString(),
      heartRate: heartRate,
    };
  }).filter((data: any) => data.heartRate > 0);

  const runCadenceData = garminData.details?.activityDetailMetrics?.map((metric: any) => {
    const timestamp = metric.metrics[3]; // directTimestamp
    const runCadence = metric.metrics[7]; // directRunCadence
    return {
      timestamp: new Date(timestamp).toLocaleTimeString(),
      runCadence: runCadence,
    };
  }).filter((data: any) => data.runCadence > 0);

  const hrInTimezonesData = garminData.hr_in_timezones?.map((zone: any) => ({
    name: t('reports.activityReport.zoneWithBpm', `Zone ${zone.zoneNumber} (${zone.zoneLowBoundary} bpm)`, { zoneNumber: zone.zoneNumber, zoneLowBoundary: zone.zoneLowBoundary }),
    'Time in Zone (s)': zone.secsInZone,
  }));

  return (
    <div className="garmin-activity-report p-4">
      <h2 className="text-2xl font-bold mb-4">{t('reports.activityReport.garminActivityReportTitle', 'Garmin Activity Report:')} {garminData.activity?.activityName}</h2>

      {/* Pace Chart */}
      {paceData && paceData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">{t('reports.activityReport.paceAndSpeedChartTitle', 'Pace (min/km) & Speed (m/s)')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={paceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
              <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="pace" stroke="#8884d8" name={t('reports.activityReport.paceMinPerKmLabel', 'Pace (min/km)')} />
              <Line yAxisId="right" type="monotone" dataKey="speed" stroke="#82ca9d" name={t('reports.activityReport.speedMPerSLabel', 'Speed (m/s)')} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Heart Rate Chart */}
      {heartRateData && heartRateData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">{t('reports.activityReport.heartRateBpmLabel', 'Heart Rate (bpm)')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={heartRateData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="heartRate" stroke="#ff7300" name={t('reports.activityReport.heartRateBpmLabel', 'Heart Rate (bpm)')} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Run Cadence Chart */}
      {runCadenceData && runCadenceData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">{t('reports.activityReport.runCadenceSpMLabel', 'Run Cadence (steps/min)')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={runCadenceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="runCadence" stroke="#387900" name={t('reports.activityReport.runCadenceSpMLabel', 'Run Cadence (steps/min)')} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Laps Table */}
      {garminData.splits?.lapDTOs && garminData.splits.lapDTOs.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">{t('reports.activityReport.lapsTableTitle', 'Laps')}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b">{t('reports.activityReport.lapTableLapHeader', 'Lap')}</th>
                  <th className="py-2 px-4 border-b">{t('reports.activityReport.lapTableDistanceKmHeader', 'Distance (km)')}</th>
                  <th className="py-2 px-4 border-b">{t('reports.activityReport.lapTableDurationMinHeader', 'Duration (min)')}</th>
                  <th className="py-2 px-4 border-b">{t('reports.activityReport.lapTableAvgPaceMinPerKmHeader', 'Avg Pace (min/km)')}</th>
                  <th className="py-2 px-4 border-b">{t('reports.activityReport.lapTableAvgHRBpmHeader', 'Avg HR (bpm)')}</th>
                  <th className="py-2 px-4 border-b">{t('reports.activityReport.lapTableMaxHRBpmHeader', 'Max HR (bpm)')}</th>
                  <th className="py-2 px-4 border-b">{t('reports.activityReport.lapTableCaloriesHeader', 'Calories')}</th>
                </tr>
              </thead>
              <tbody>
                {garminData.splits.lapDTOs.map((lap: any, index: number) => (
                  <tr key={index}>
                    <td className="py-2 px-4 border-b">{lap.lapIndex}</td>
                    <td className="py-2 px-4 border-b">{lap.distance ? (lap.distance / 1000).toFixed(2) : t('common.notApplicable', 'N/A')}</td>
                    <td className="py-2 px-4 border-b">{lap.duration ? (lap.duration / 60).toFixed(2) : t('common.notApplicable', 'N/A')}</td>
                    <td className="py-2 px-4 border-b">
                      {lap.averageSpeed > 0 ? (1000 / (lap.averageSpeed * 60)).toFixed(2) : t('common.notApplicable', 'N/A')}
                    </td>
                    <td className="py-2 px-4 border-b">{lap.averageHR || t('common.notApplicable', 'N/A')}</td>
                    <td className="py-2 px-4 border-b">{lap.maxHR || t('common.notApplicable', 'N/A')}</td>
                    <td className="py-2 px-4 border-b">{lap.calories ? `${Math.round(convertEnergy(lap.calories, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}` : t('common.notApplicable', 'N/A')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Time in Zones Chart */}
      {hrInTimezonesData && hrInTimezonesData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">{t('reports.activityReport.heartRateTimeInZonesTitle', 'Heart Rate Time in Zones')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hrInTimezonesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={t('reports.activityReport.timeInZoneSLabel', 'Time in Zone (s)')} fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default GarminActivityReport;