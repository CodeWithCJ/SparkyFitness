import React, { useState } from 'react';
import { usePreferences } from "@/contexts/PreferencesContext";
import { FaClock, FaRoute, FaWalking, FaFire, FaHeartbeat, FaRunning, FaCalendarAlt, FaRoad, FaHourglassHalf, FaFlag } from 'react-icons/fa';

interface LapTableProps {
  lapDTOs: any[];
  isMaximized?: boolean; // Added for ZoomableChart integration
  zoomLevel?: number; // Added for ZoomableChart integration
}

const ActivityReportLapTable: React.FC<LapTableProps> = ({ lapDTOs, isMaximized, zoomLevel = 1 }) => {
  const [sortColumn, setSortColumn] = useState<string>('lapIndex'); // Default sort column
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); // Default sort direction
  const { distanceUnit, convertDistance } = usePreferences();

  const formatTime = (seconds: number) => {
    if (seconds === 0) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(0).padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  };

  const formatPace = (speed: number) => {
    if (speed > 0) {
      let paceMinPerKm = (1000 / (speed * 60)); // min/km
      if (distanceUnit === 'miles') {
        paceMinPerKm = paceMinPerKm * 1.60934; // Convert min/km to min/mi
      }
      const minutes = Math.floor(paceMinPerKm);
      const seconds = ((paceMinPerKm - minutes) * 60).toFixed(0).padStart(2, '0');
      return `${minutes}:${seconds}`;
    }
    return 'N/A';
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (column: string) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? ' ⬆' : ' ⬇';
    }
    return '';
  };

  let currentCumulativeDistance = 0;
  let currentCumulativeDuration = 0;

  const processedLaps = lapDTOs.map((lap: any) => {
    const lapDistance = lap.distance ? convertDistance(lap.distance / 1000, 'km', distanceUnit) : 0;
    const lapDurationSeconds = lap.duration || 0;
    const lapDurationMinutes = lapDurationSeconds / 60;

    currentCumulativeDistance += lapDistance;
    currentCumulativeDuration += lapDurationMinutes;

    return {
      ...lap,
      lapDistance: lapDistance,
      lapDurationSeconds: lapDurationSeconds, // Add lapDurationSeconds for sorting
      lapDurationMinutes: lapDurationMinutes,
      cumulativeDistance: currentCumulativeDistance,
      cumulativeDuration: currentCumulativeDuration,
      movingDurationMinutes: lap.movingDuration ? (lap.movingDuration / 60) : 0,
      averageMovingSpeed: lap.averageMovingSpeed || 0,
    };
  });

  const sortedLaps = [...processedLaps].sort((a, b) => {
    let aValue = (a as any)[sortColumn];
    let bValue = (b as any)[sortColumn];

    // Special handling for pace columns which are formatted strings
    if (sortColumn === 'averageSpeed' || sortColumn === 'averageMovingSpeed') {
      // Convert pace strings "min:sec" to seconds for numerical comparison
      const parsePaceToSeconds = (paceStr: string) => {
        if (paceStr === 'N/A') return Infinity; // Treat N/A as largest for sorting
        const [minutes, seconds] = paceStr.split(':').map(Number);
        return minutes * 60 + seconds;
      };
      aValue = formatPace(a.averageSpeed); // Assuming formatPace is accessible here
      bValue = formatPace(b.averageSpeed); // Assuming formatPace is accessible here
      aValue = parsePaceToSeconds(aValue);
      bValue = parsePaceToSeconds(bValue);
    } else if (sortColumn === 'duration' || sortColumn === 'cumulativeDuration') {
      // For duration, use the raw seconds value for sorting
      aValue = a.lapDurationSeconds;
      bValue = b.lapDurationSeconds;
    } else if (sortColumn === 'lapDistance' || sortColumn === 'cumulativeDistance') {
      // For distance, use the raw numerical value
      aValue = a.lapDistance;
      bValue = b.lapDistance;
    } else if (sortColumn === 'movingDuration') {
      aValue = a.movingDurationMinutes;
      bValue = b.movingDurationMinutes;
    }


    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }
    const aStr = String(aValue);
    const bStr = String(bValue);
    return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });


  return (
    <div className="mb-8 font-inter">
      <h3 className="text-xl font-semibold mb-2">Laps</h3>
      <div className={`overflow-x-auto rounded-lg shadow-md ${isMaximized ? 'h-full' : ''}`} style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}>
        <table className="min-w-full bg-card text-card-foreground rounded-lg overflow-hidden" style={{ width: `${100 / zoomLevel}%` }}>
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('lapIndex')}>Lap<FaFlag className="block text-blue-500 mx-auto" />{getSortIndicator('lapIndex')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('duration')}>Time<FaClock className="block text-green-500 mx-auto" />{getSortIndicator('duration')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('cumulativeDuration')}>Cumulative Time<FaHourglassHalf className="block text-green-500 mx-auto" />{getSortIndicator('cumulativeDuration')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('lapDistance')}>Distance ({distanceUnit})<FaRoute className="block text-blue-500 mx-auto" />{getSortIndicator('lapDistance')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('cumulativeDistance')}>Cumulative Distance ({distanceUnit})<FaRoad className="block text-blue-500 mx-auto" />{getSortIndicator('cumulativeDistance')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('averageSpeed')}>Avg Pace ({distanceUnit === 'km' ? 'min/km' : 'min/mi'})<FaWalking className="block text-purple-500 mx-auto" />{getSortIndicator('averageSpeed')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('averageMovingSpeed')}>Avg Moving Pace ({distanceUnit === 'km' ? 'min/km' : 'min/mi'})<FaWalking className="block text-purple-500 mx-auto" />{getSortIndicator('averageMovingSpeed')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('averageHR')}>Avg HR (bpm)<FaHeartbeat className="block text-pink-500 mx-auto" />{getSortIndicator('averageHR')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('maxHR')}>Max HR (bpm)<FaHeartbeat className="block text-pink-500 mx-auto" />{getSortIndicator('maxHR')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('averageRunCadence')}>Avg Run Cadence (spm)<FaRunning className="block text-orange-500 mx-auto" />{getSortIndicator('averageRunCadence')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('maxRunCadence')}>Max Run Cadence (spm)<FaRunning className="block text-orange-500 mx-auto" />{getSortIndicator('maxRunCadence')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('movingDuration')}>Moving Time (min)<FaClock className="block text-green-500 mx-auto" />{getSortIndicator('movingDuration')}</th>
              <th className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer" onClick={() => handleSort('calories')}>Calories<FaFire className="block text-red-500 mx-auto" />{getSortIndicator('calories')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedLaps.map((lap: any, index: number) => (
              <tr key={index} className="hover:bg-muted">
                <td className="py-2 px-4 border-b border-border text-left">{lap.lapIndex}</td>
                <td className="py-2 px-4 border-b border-border text-right">{formatTime(lap.duration)}</td>
                <td className="py-2 px-4 border-b border-border text-right">{formatTime(lap.cumulativeDuration * 60)}</td>
                <td className="py-2 px-4 border-b border-border text-right">{lap.lapDistance.toFixed(2)}</td>
                <td className="py-2 px-4 border-b border-border text-right">{lap.cumulativeDistance.toFixed(2)}</td>
                <td className="py-2 px-4 border-b border-border text-right">{formatPace(lap.averageSpeed)}</td>
                <td className="py-2 px-4 border-b border-border text-right">{formatPace(lap.averageMovingSpeed)}</td>
                <td className="py-2 px-4 border-b border-border text-right">{lap.averageHR || 'N/A'}</td>
                <td className="py-2 px-4 border-b border-border text-right">{lap.maxHR || 'N/A'}</td>
                <td className="py-2 px-4 border-b border-border text-right">{lap.averageRunCadence || 'N/A'}</td>
                <td className="py-2 px-4 border-b border-border text-right">{lap.maxRunCadence || 'N/A'}</td>
                <td className="py-2 px-4 border-b border-border text-right">{lap.movingDurationMinutes > 0 ? lap.movingDurationMinutes.toFixed(2) : 'N/A'}</td>
                <td className="py-2 px-4 border-b border-border text-right">{lap.calories || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold">
              <td className="py-2 px-4 text-left">Totals</td>
              <td className="py-2 px-4 text-right">{formatTime(processedLaps.reduce((sum, lap) => sum + lap.lapDurationSeconds, 0))}</td>
              <td className="py-2 px-4 text-right">{processedLaps.length > 0 ? formatTime(processedLaps[processedLaps.length - 1].cumulativeDuration * 60) : 'N/A'}</td>
              <td className="py-2 px-4 text-right">{processedLaps.reduce((sum, lap) => sum + lap.lapDistance, 0).toFixed(2)}</td>
              <td className="py-2 px-4 text-right">{processedLaps.length > 0 ? processedLaps[processedLaps.length - 1].cumulativeDistance.toFixed(2) : 'N/A'}</td>
              <td className="py-2 px-4 text-right">{processedLaps.length > 0 ? formatPace(processedLaps.reduce((sum, lap) => sum + lap.averageSpeed, 0) / processedLaps.length) : 'N/A'}</td>
              <td className="py-2 px-4 text-right">{processedLaps.length > 0 ? formatPace(processedLaps.reduce((sum, lap) => sum + lap.averageMovingSpeed, 0) / processedLaps.length) : 'N/A'}</td>
              <td className="py-2 px-4 text-right">{processedLaps.length > 0 && processedLaps.some(lap => lap.averageHR) ? (processedLaps.reduce((sum, lap) => sum + (lap.averageHR || 0), 0) / processedLaps.filter(lap => lap.averageHR).length).toFixed(0) : 'N/A'}</td>
              <td className="py-2 px-4 text-right">{processedLaps.length > 0 && processedLaps.some(lap => lap.maxHR) ? Math.max(...processedLaps.map(lap => lap.maxHR || 0)) : 'N/A'}</td>
              <td className="py-2 px-4 text-right">{processedLaps.length > 0 && processedLaps.some(lap => lap.averageRunCadence) ? (processedLaps.reduce((sum, lap) => sum + (lap.averageRunCadence || 0), 0) / processedLaps.filter(lap => lap.averageRunCadence).length).toFixed(0) : 'N/A'}</td>
              <td className="py-2 px-4 text-right">{processedLaps.length > 0 && processedLaps.some(lap => lap.maxRunCadence) ? Math.max(...processedLaps.map(lap => lap.maxRunCadence || 0)) : 'N/A'}</td>
              <td className="py-2 px-4 text-right">{processedLaps.reduce((sum, lap) => sum + lap.movingDurationMinutes, 0).toFixed(2)}</td>
              <td className="py-2 px-4 text-right">{processedLaps.reduce((sum, lap) => sum + (lap.calories || 0), 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default ActivityReportLapTable;