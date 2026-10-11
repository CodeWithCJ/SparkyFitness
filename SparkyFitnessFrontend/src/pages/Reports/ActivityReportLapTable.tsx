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
import { paceMinPerUnit } from '@/utils/activityReportUtil';

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
  /** min per display unit; 0 when the lap has no distance or no time */
  avgPace: number;
  /** min per display unit; 0 when the lap reported no moving time */
  avgMovingPace: number;
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

  const formatPace = (pace: number): string => {
    if (!pace || pace <= 0 || !Number.isFinite(pace))
      return t('common.notApplicable', 'N/A');
    let m = Math.floor(pace);
    let s = Math.round((pace - m) * 60);
    // 7.999 min would otherwise render "7:60"
    if (s === 60) {
      m += 1;
      s = 0;
    }
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
      // Handle distance whether passed in raw meters (>100) or kilometers
      const rawKm = lap.distance
        ? lap.distance > 100
          ? lap.distance / 1000
          : lap.distance
        : 0;
      const dist = convertDistance(rawKm, 'km', distanceUnit);
      const durSec = lap.duration ?? 0;
      acc.push({
        lapIndex: lap.lapIndex ?? i + 1,
        lapDistance: dist,
        lapDurationSeconds: durSec,
        cumulativeDistance: (prev?.cumulativeDistance ?? 0) + dist,
        cumulativeDuration: (prev?.cumulativeDuration ?? 0) + durSec,
        avgPace: paceMinPerUnit(dist, durSec),
        avgMovingPace: paceMinPerUnit(dist, lap.movingDuration ?? 0),
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
  // Moving pace needs both a moving time and a distance to divide it into.
  // Rows written before the moving-telemetry columns existed have neither, and
  // without this guard the column rendered a full stripe of N/A.
  const showMovingPace = processedLaps.some((l) => l.avgMovingPace > 0);
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
  // Total distance over total time, NOT the mean of the per-lap paces. Laps
  // differ in length, so averaging their paces weights a 0.01 km lap the same
  // as a 1.08 km one — which is how the totals row previously reported 27:06
  // for a workout whose real overall pace was 23:08.
  const totalAvgPace = paceMinPerUnit(totalDist, totalDurSec);
  // Moving pace is summed over ONLY the laps that reported a moving time, so
  // its distance and its time describe the same laps. Dividing the whole
  // workout's distance by a partial moving time reads far too fast — a lap
  // with distance but no moving telemetry contributed its kilometres without
  // its seconds, which halved the figure on a two-lap workout.
  const movingLaps = processedLaps.filter(
    (l) => l.movingDurationSeconds > 0 && l.lapDistance > 0
  );
  const totalAvgMovingPace = paceMinPerUnit(
    movingLaps.reduce((s, l) => s + l.lapDistance, 0),
    movingLaps.reduce((s, l) => s + l.movingDurationSeconds, 0)
  );

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
                <span>{getSortIndicator('lapIndex')}</span>
              </th>
              <th
                className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                onClick={() => handleSort('lapDurationSeconds')}
              >
                {t('reports.activityReportLapTable.time', 'Time')}
                <FaClock className="block text-green-500 mx-auto" />
                <span>{getSortIndicator('lapDurationSeconds')}</span>
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
                <span>{getSortIndicator('cumulativeDuration')}</span>
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
                    <span>{getSortIndicator('lapDistance')}</span>
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
                    <span>{getSortIndicator('cumulativeDistance')}</span>
                  </th>
                </>
              )}

              {/* Pace columns (only meaningful with distance) */}
              {showPaceCols && (
                <>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('avgPace')}
                  >
                    {t('reports.activityReportLapTable.avgPace', 'Avg Pace')} (
                    {distanceUnit === 'km'
                      ? t('reports.activityReportLapTable.minPerKm', 'min/km')
                      : t('reports.activityReportLapTable.minPerMi', 'min/mi')}
                    )
                    <FaWalking className="block text-purple-500 mx-auto" />
                    <span>{getSortIndicator('avgPace')}</span>
                  </th>
                  {showMovingPace && (
                    <th
                      className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                      onClick={() => handleSort('avgMovingPace')}
                    >
                      {t(
                        'reports.activityReportLapTable.avgMovingPace',
                        'Avg Moving Pace'
                      )}{' '}
                      (
                      {distanceUnit === 'km'
                        ? t('reports.activityReportLapTable.minPerKm', 'min/km')
                        : t(
                            'reports.activityReportLapTable.minPerMi',
                            'min/mi'
                          )}
                      )
                      <FaWalking className="block text-purple-500 mx-auto" />
                      <span>{getSortIndicator('avgMovingPace')}</span>
                    </th>
                  )}
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
                    <span>{getSortIndicator('averageHR')}</span>
                  </th>
                  <th
                    className="py-3 px-4 text-center text-sm font-bold text-muted-foreground cursor-pointer"
                    onClick={() => handleSort('maxHR')}
                  >
                    {t('reports.activityReportLapTable.maxHR', 'Max HR')} (
                    {t('reports.activityReportLapTable.bpm', 'bpm')})
                    <FaHeartbeat className="block text-pink-500 mx-auto" />
                    <span>{getSortIndicator('maxHR')}</span>
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
                    <span>{getSortIndicator('averageRunCadence')}</span>
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
                    <span>{getSortIndicator('maxRunCadence')}</span>
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
                  <span>{getSortIndicator('movingDurationSeconds')}</span>
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
                  <span>{getSortIndicator('calories')}</span>
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
                      {formatPace(lap.avgPace)}
                    </td>
                    {showMovingPace && (
                      <td className="py-2 px-4 border-b border-border text-center">
                        {formatPace(lap.avgMovingPace)}
                      </td>
                    )}
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
                    {formatPace(totalAvgPace)}
                  </td>
                  {showMovingPace && (
                    <td className="py-2 px-4 text-center">
                      {formatPace(totalAvgMovingPace)}
                    </td>
                  )}
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
