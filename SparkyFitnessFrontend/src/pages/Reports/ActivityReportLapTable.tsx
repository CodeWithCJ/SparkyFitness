import type React from 'react';
import { useMemo, useState } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  FaClock,
  FaRoute,
  FaWalking,
  FaFire,
  FaHeartbeat,
  FaRunning,
  FaRoad,
  FaHourglassHalf,
  FaFlag,
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { LapDTO } from '@/types/exercises';

interface LapTableProps {
  lapDTOs: LapDTO[];
  isMaximized?: boolean;
  zoomLevel?: number;
}

interface ProcessedLap {
  lapIndex: number;
  lapDistance: number;
  lapDurationSeconds: number;
  cumulativeDistance: number;
  cumulativeDuration: number;
  averageSpeed: number;
  averageMovingSpeed: number;
  movingDurationSeconds: number;
  averageHR: number;
  maxHR: number;
  averageRunCadence: number;
  maxRunCadence: number;
  calories: number;
}

const ActivityReportLapTable: React.FC<LapTableProps> = ({
  lapDTOs,
  isMaximized,
  zoomLevel = 1,
}) => {
  const { t } = useTranslation();
  const [sortColumn, setSortColumn] = useState<string>('lapIndex');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { distanceUnit, convertDistance } = usePreferences();

  const formatTime = (seconds: number): string => {
    if (!seconds || seconds <= 0) return t('common.notApplicable', 'N/A');
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const formatPace = (speedMs: number): string => {
    if (!speedMs || speedMs <= 0) return t('common.notApplicable', 'N/A');
    let paceMinPerKm = 1000 / (speedMs * 60);
    if (distanceUnit === 'miles') paceMinPerKm *= 1.60934;
    const m = Math.floor(paceMinPerKm);
    const s = Math.round((paceMinPerKm - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (column: string) =>
    sortColumn === column ? (sortDirection === 'asc' ? ' ⬆' : ' ⬇') : '';

  const processedLaps = useMemo<ProcessedLap[]>(() => {
    return lapDTOs.reduce<ProcessedLap[]>((acc, lap, i) => {
      const prev = acc[acc.length - 1];
      // lap.distance is always in metres as stored by the Garmin server pipeline.
      const dist = lap.distance
        ? convertDistance(lap.distance / 1000, 'km', distanceUnit)
        : 0;
      const durSec = lap.duration ?? 0;
      acc.push({
        lapIndex: lap.lapIndex ?? i + 1,
        lapDistance: dist,
        lapDurationSeconds: durSec,
        cumulativeDistance: (prev?.cumulativeDistance ?? 0) + dist,
        cumulativeDuration: (prev?.cumulativeDuration ?? 0) + durSec,
        averageSpeed: lap.averageSpeed ?? 0,
        averageMovingSpeed: lap.averageMovingSpeed ?? 0,
        movingDurationSeconds: lap.movingDuration ?? 0,
        averageHR: lap.averageHR ?? 0,
        maxHR: lap.maxHR ?? 0,
        averageRunCadence: lap.averageRunCadence ?? 0,
        maxRunCadence: lap.maxRunCadence ?? 0,
        calories: lap.calories ?? 0,
      });
      return acc;
    }, []);
  }, [lapDTOs, distanceUnit, convertDistance]);

  // Column visibility — only show a column when at least one lap has real data
  const showDistanceCols = processedLaps.some((l) => l.lapDistance > 0);
  const showPaceCols = showDistanceCols;
  const showHRCols = processedLaps.some((l) => l.averageHR > 0);
  const showCadenceCols = processedLaps.some((l) => l.averageRunCadence > 0);
  const showMovingTime = processedLaps.some((l) => l.movingDurationSeconds > 0);
  const showCalories = processedLaps.some((l) => l.calories > 0);

  const sortedLaps = [...processedLaps].sort((a, b) => {
    let aVal = a[sortColumn as keyof ProcessedLap] as number;
    let bVal = b[sortColumn as keyof ProcessedLap] as number;
    if (typeof aVal !== 'number') aVal = 0;
    if (typeof bVal !== 'number') bVal = 0;
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  if (processedLaps.length === 0) {
    return null;
  }

  // Totals
  const totalDurSec = processedLaps.reduce(
    (s, l) => s + l.lapDurationSeconds,
    0
  );
  const totalDist = processedLaps.reduce((s, l) => s + l.lapDistance, 0);
  const totalMovingSec = processedLaps.reduce(
    (s, l) => s + l.movingDurationSeconds,
    0
  );
  const totalCalories = processedLaps.reduce((s, l) => s + l.calories, 0);
  const hrLaps = processedLaps.filter((l) => l.averageHR > 0);
  const avgHR =
    hrLaps.length > 0
      ? hrLaps.reduce((s, l) => s + l.averageHR, 0) / hrLaps.length
      : 0;
  const maxHRVal =
    processedLaps.length > 0
      ? Math.max(...processedLaps.map((l) => l.maxHR))
      : 0;
  const cadLaps = processedLaps.filter((l) => l.averageRunCadence > 0);
  const avgCadence =
    cadLaps.length > 0
      ? cadLaps.reduce((s, l) => s + l.averageRunCadence, 0) / cadLaps.length
      : 0;
  const maxCadVal =
    processedLaps.length > 0
      ? Math.max(...processedLaps.map((l) => l.maxRunCadence))
      : 0;
  const avgSpeed =
    processedLaps.length > 0
      ? processedLaps.reduce((s, l) => s + l.averageSpeed, 0) /
        processedLaps.length
      : 0;
  const avgMovingSpeed =
    processedLaps.length > 0
      ? processedLaps.reduce((s, l) => s + l.averageMovingSpeed, 0) /
        processedLaps.length
      : 0;

  const NA = t('common.notApplicable', 'N/A');

  return (
    <div className="mb-8 font-inter">
      <h3 className="text-xl font-semibold mb-2">
        {t('reports.activityReportLapTable.laps', 'Laps')}
      </h3>
      <div
        className={`overflow-x-auto rounded-lg shadow-md ${isMaximized ? 'h-full' : ''}`}
        style={{
          transform: `scale(${zoomLevel})`,
          transformOrigin: 'top left',
        }}
      >
        <table
          className="min-w-full bg-card text-card-foreground rounded-lg overflow-hidden"
          style={{ width: `${100 / zoomLevel}%` }}
        >
          <thead>
            <tr className="bg-muted border-b border-border">
              {/* Always visible columns */}
              <th
                className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                onClick={() => handleSort('lapIndex')}
              >
                {t('reports.activityReportLapTable.lap', 'Lap')}
                <FaFlag className="block text-blue-500 mx-auto" />
                {getSortIndicator('lapIndex')}
              </th>
              <th
                className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                onClick={() => handleSort('lapDurationSeconds')}
              >
                {t('reports.activityReportLapTable.time', 'Time')}
                <FaClock className="block text-green-500 mx-auto" />
                {getSortIndicator('lapDurationSeconds')}
              </th>
              <th
                className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                onClick={() => handleSort('cumulativeDuration')}
              >
                {t(
                  'reports.activityReportLapTable.cumulativeTime',
                  'Cumulative Time'
                )}
                <FaHourglassHalf className="block text-green-500 mx-auto" />
                {getSortIndicator('cumulativeDuration')}
              </th>

              {/* Distance-dependent columns */}
              {showDistanceCols && (
                <>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('lapDistance')}
                  >
                    {t('reports.activityReportLapTable.distance', 'Distance')} (
                    {distanceUnit})
                    <FaRoute className="block text-blue-500 mx-auto" />
                    {getSortIndicator('lapDistance')}
                  </th>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('cumulativeDistance')}
                  >
                    {t(
                      'reports.activityReportLapTable.cumulativeDistance',
                      'Cumulative Distance'
                    )}{' '}
                    ({distanceUnit})
                    <FaRoad className="block text-blue-500 mx-auto" />
                    {getSortIndicator('cumulativeDistance')}
                  </th>
                </>
              )}

              {/* Pace columns (only meaningful with distance) */}
              {showPaceCols && (
                <>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('averageSpeed')}
                  >
                    {t('reports.activityReportLapTable.avgPace', 'Avg Pace')} (
                    {distanceUnit === 'km'
                      ? t('reports.activityReportLapTable.minPerKm', 'min/km')
                      : t('reports.activityReportLapTable.minPerMi', 'min/mi')}
                    )
                    <FaWalking className="block text-purple-500 mx-auto" />
                    {getSortIndicator('averageSpeed')}
                  </th>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('averageMovingSpeed')}
                  >
                    {t(
                      'reports.activityReportLapTable.avgMovingPace',
                      'Avg Moving Pace'
                    )}{' '}
                    (
                    {distanceUnit === 'km'
                      ? t('reports.activityReportLapTable.minPerKm', 'min/km')
                      : t('reports.activityReportLapTable.minPerMi', 'min/mi')}
                    )
                    <FaWalking className="block text-purple-500 mx-auto" />
                    {getSortIndicator('averageMovingSpeed')}
                  </th>
                </>
              )}

              {/* HR columns */}
              {showHRCols && (
                <>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('averageHR')}
                  >
                    {t('reports.activityReportLapTable.avgHR', 'Avg HR')} (
                    {t('reports.activityReportLapTable.bpm', 'bpm')})
                    <FaHeartbeat className="block text-pink-500 mx-auto" />
                    {getSortIndicator('averageHR')}
                  </th>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('maxHR')}
                  >
                    {t('reports.activityReportLapTable.maxHR', 'Max HR')} (
                    {t('reports.activityReportLapTable.bpm', 'bpm')})
                    <FaHeartbeat className="block text-pink-500 mx-auto" />
                    {getSortIndicator('maxHR')}
                  </th>
                </>
              )}

              {/* Cadence columns */}
              {showCadenceCols && (
                <>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('averageRunCadence')}
                  >
                    {t(
                      'reports.activityReportLapTable.avgRunCadence',
                      'Avg Cadence'
                    )}{' '}
                    ({t('reports.activityReportLapTable.spm', 'spm')})
                    <FaRunning className="block text-orange-500 mx-auto" />
                    {getSortIndicator('averageRunCadence')}
                  </th>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('maxRunCadence')}
                  >
                    {t(
                      'reports.activityReportLapTable.maxRunCadence',
                      'Max Cadence'
                    )}{' '}
                    ({t('reports.activityReportLapTable.spm', 'spm')})
                    <FaRunning className="block text-orange-500 mx-auto" />
                    {getSortIndicator('maxRunCadence')}
                  </th>
                </>
              )}

              {/* Moving time column */}
              {showMovingTime && (
                <th
                  className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                  onClick={() => handleSort('movingDurationSeconds')}
                >
                  {t(
                    'reports.activityReportLapTable.movingTime',
                    'Moving Time'
                  )}
                  <FaClock className="block text-green-500 mx-auto" />
                  {getSortIndicator('movingDurationSeconds')}
                </th>
              )}

              {/* Calories column */}
              {showCalories && (
                <th
                  className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                  onClick={() => handleSort('calories')}
                >
                  {t('reports.activityReportLapTable.calories', 'Calories')}
                  <FaFire className="block text-red-500 mx-auto" />
                  {getSortIndicator('calories')}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedLaps.map((lap, index) => (
              <tr key={index} className="hover:bg-muted">
                <td className="py-2 px-4 border-b border-border text-left">
                  {lap.lapIndex}
                </td>
                <td className="py-2 px-4 border-b border-border text-center">
                  {formatTime(lap.lapDurationSeconds)}
                </td>
                <td className="py-2 px-4 border-b border-border text-center">
                  {formatTime(lap.cumulativeDuration)}
                </td>
                {showDistanceCols && (
                  <>
                    <td className="py-2 px-4 border-b border-border text-center">
                      {lap.lapDistance.toFixed(2)}
                    </td>
                    <td className="py-2 px-4 border-b border-border text-center">
                      {lap.cumulativeDistance.toFixed(2)}
                    </td>
                  </>
                )}
                {showPaceCols && (
                  <>
                    <td className="py-2 px-4 border-b border-border text-center">
                      {formatPace(lap.averageSpeed)}
                    </td>
                    <td className="py-2 px-4 border-b border-border text-center">
                      {formatPace(lap.averageMovingSpeed)}
                    </td>
                  </>
                )}
                {showHRCols && (
                  <>
                    <td className="py-2 px-4 border-b border-border text-center">
                      {lap.averageHR > 0 ? lap.averageHR : NA}
                    </td>
                    <td className="py-2 px-4 border-b border-border text-center">
                      {lap.maxHR > 0 ? lap.maxHR : NA}
                    </td>
                  </>
                )}
                {showCadenceCols && (
                  <>
                    <td className="py-2 px-4 border-b border-border text-center">
                      {lap.averageRunCadence > 0
                        ? Math.round(lap.averageRunCadence)
                        : NA}
                    </td>
                    <td className="py-2 px-4 border-b border-border text-center">
                      {lap.maxRunCadence > 0
                        ? Math.round(lap.maxRunCadence)
                        : NA}
                    </td>
                  </>
                )}
                {showMovingTime && (
                  <td className="py-2 px-4 border-b border-border text-center">
                    {formatTime(lap.movingDurationSeconds)}
                  </td>
                )}
                {showCalories && (
                  <td className="py-2 px-4 border-b border-border text-center">
                    {lap.calories > 0 ? lap.calories : NA}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold">
              <td className="py-2 px-4 text-left">
                {t('reports.activityReportLapTable.totals', 'Totals')}
              </td>
              <td className="py-2 px-4 text-center">
                {formatTime(totalDurSec)}
              </td>
              <td className="py-2 px-4 text-center">
                {formatTime(totalDurSec)}
              </td>
              {showDistanceCols && (
                <>
                  <td className="py-2 px-4 text-center">
                    {totalDist.toFixed(2)}
                  </td>
                  <td className="py-2 px-4 text-center">
                    {totalDist.toFixed(2)}
                  </td>
                </>
              )}
              {showPaceCols && (
                <>
                  <td className="py-2 px-4 text-center">
                    {formatPace(avgSpeed)}
                  </td>
                  <td className="py-2 px-4 text-center">
                    {formatPace(avgMovingSpeed)}
                  </td>
                </>
              )}
              {showHRCols && (
                <>
                  <td className="py-2 px-4 text-center">
                    {avgHR > 0 ? avgHR.toFixed(0) : NA}
                  </td>
                  <td className="py-2 px-4 text-center">
                    {maxHRVal > 0 ? maxHRVal : NA}
                  </td>
                </>
              )}
              {showCadenceCols && (
                <>
                  <td className="py-2 px-4 text-center">
                    {avgCadence > 0 ? avgCadence.toFixed(0) : NA}
                  </td>
                  <td className="py-2 px-4 text-center">
                    {maxCadVal > 0 ? Math.round(maxCadVal) : NA}
                  </td>
                </>
              )}
              {showMovingTime && (
                <td className="py-2 px-4 text-center">
                  {formatTime(totalMovingSec)}
                </td>
              )}
              {showCalories && (
                <td className="py-2 px-4 text-center">{totalCalories}</td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default ActivityReportLapTable;
