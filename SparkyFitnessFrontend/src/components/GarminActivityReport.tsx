import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [garminData, setGarminData] = useState<GarminActivityData | null>(null);

  useEffect(() => {
    const fetchGarminData = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/exercises/garmin-activity-details/${exerciseEntryId}`);
        setGarminData(response.data);
      } catch (err) {
        setError('Failed to fetch Garmin activity details.');
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
    return <div>Loading Garmin activity report...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!garminData) {
    return <div>No Garmin activity data available.</div>;
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
    name: `Zone ${zone.zoneNumber} (${zone.zoneLowBoundary} bpm)`,
    'Time in Zone (s)': zone.secsInZone,
  }));

  return (
    <div className="garmin-activity-report p-4">
      <h2 className="text-2xl font-bold mb-4">Garmin Activity Report: {garminData.activity?.activityName}</h2>

      {/* Pace Chart */}
      {paceData && paceData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">Pace (min/km) & Speed (m/s)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={paceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
              <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="pace" stroke="#8884d8" name="Pace (min/km)" />
              <Line yAxisId="right" type="monotone" dataKey="speed" stroke="#82ca9d" name="Speed (m/s)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Heart Rate Chart */}
      {heartRateData && heartRateData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">Heart Rate (bpm)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={heartRateData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="heartRate" stroke="#ff7300" name="Heart Rate (bpm)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Run Cadence Chart */}
      {runCadenceData && runCadenceData.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">Run Cadence (steps/min)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={runCadenceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="runCadence" stroke="#387900" name="Run Cadence (steps/min)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Laps Table */}
      {garminData.splits?.lapDTOs && garminData.splits.lapDTOs.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-2">Laps</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b">Lap</th>
                  <th className="py-2 px-4 border-b">Distance (km)</th>
                  <th className="py-2 px-4 border-b">Duration (min)</th>
                  <th className="py-2 px-4 border-b">Avg Pace (min/km)</th>
                  <th className="py-2 px-4 border-b">Avg HR (bpm)</th>
                  <th className="py-2 px-4 border-b">Max HR (bpm)</th>
                  <th className="py-2 px-4 border-b">Calories</th>
                </tr>
              </thead>
              <tbody>
                {garminData.splits.lapDTOs.map((lap: any, index: number) => (
                  <tr key={index}>
                    <td className="py-2 px-4 border-b">{lap.lapIndex}</td>
                    <td className="py-2 px-4 border-b">{lap.distance ? (lap.distance / 1000).toFixed(2) : 'N/A'}</td>
                    <td className="py-2 px-4 border-b">{lap.duration ? (lap.duration / 60).toFixed(2) : 'N/A'}</td>
                    <td className="py-2 px-4 border-b">
                      {lap.averageSpeed > 0 ? (1000 / (lap.averageSpeed * 60)).toFixed(2) : 'N/A'}
                    </td>
                    <td className="py-2 px-4 border-b">{lap.averageHR || 'N/A'}</td>
                    <td className="py-2 px-4 border-b">{lap.maxHR || 'N/A'}</td>
                    <td className="py-2 px-4 border-b">{lap.calories || 'N/A'}</td>
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
          <h3 className="text-xl font-semibold mb-2">Heart Rate Time in Zones</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hrInTimezonesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Time in Zone (s)" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default GarminActivityReport;