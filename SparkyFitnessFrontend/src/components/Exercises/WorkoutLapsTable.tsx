import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExerciseEntryLaps } from '@workspace/shared';
import { Timer, Heart, Wind, Zap, Gauge } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';

const METERS_PER_MILE = 1609.34;

interface WorkoutLapsTableProps {
  laps?: ExerciseEntryLaps[];
  isLoading?: boolean;
}

const formatDuration = (seconds?: number | null): string => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Distances are stored in metres; both of these render in the user's preferred
// distance unit rather than assuming kilometres.
const formatLapDistance = (
  distanceMeters: number | null | undefined,
  distanceUnit: string
): string => {
  if (distanceMeters == null) return '-';
  return distanceUnit === 'miles'
    ? `${(distanceMeters / METERS_PER_MILE).toFixed(2)} mi`
    : `${(distanceMeters / 1000).toFixed(2)} km`;
};

const formatPace = (
  distanceMeters: number | null | undefined,
  durationSeconds: number | null | undefined,
  distanceUnit: string
): string => {
  if (!distanceMeters || !durationSeconds || distanceMeters === 0)
    return '--:--';
  const metersPerUnit = distanceUnit === 'miles' ? METERS_PER_MILE : 1000;
  const paceSecondsPerUnit = (durationSeconds / distanceMeters) * metersPerUnit;
  const mins = Math.floor(paceSecondsPerUnit / 60);
  const secs = Math.floor(paceSecondsPerUnit % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const WorkoutLapsTable: React.FC<WorkoutLapsTableProps> = ({
  laps,
  isLoading,
}) => {
  const { t } = useTranslation();
  const { distanceUnit } = usePreferences();
  if (isLoading) {
    return (
      <div className="w-full bg-slate-900/40 border border-slate-800 rounded-xl p-4 animate-pulse">
        <div className="h-6 bg-slate-800 rounded w-1/4 mb-4"></div>
        <div className="h-32 bg-slate-800/60 rounded"></div>
      </div>
    );
  }

  if (!laps || laps.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3">
        <Timer className="h-5 w-5 text-indigo-400" />
        <h3 className="text-base font-bold text-slate-100">
          {t('workoutLaps.title', 'Workout Split Intervals & Laps')}
        </h3>
        <span className="ml-auto text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-semibold">
          {t('workoutLaps.lapsCount', '{{count}} Laps', { count: laps.length })}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-medium">
              <th className="py-2.5 px-3">{t('workoutLaps.lap', 'Lap')}</th>
              <th className="py-2.5 px-3">
                {t('workoutLaps.distance', 'Distance')}
              </th>
              <th className="py-2.5 px-3">{t('workoutLaps.time', 'Time')}</th>
              <th className="py-2.5 px-3">
                {t('workoutLaps.pace', 'Pace (/{{unit}})', {
                  unit: distanceUnit === 'miles' ? 'mi' : 'km',
                })}
              </th>
              <th className="py-2.5 px-3 text-rose-400 font-semibold">
                <Heart className="inline h-3.5 w-3.5 mr-1" />
                {t('workoutLaps.avgMaxHr', 'Avg / Max HR')}
              </th>
              <th className="py-2.5 px-3 text-teal-400 font-semibold">
                <Wind className="inline h-3.5 w-3.5 mr-1" />
                {t('workoutLaps.resp', 'Resp (brpm)')}
              </th>
              <th className="py-2.5 px-3 text-cyan-400 font-semibold">
                <Gauge className="inline h-3.5 w-3.5 mr-1" />
                {t('workoutLaps.cadence', 'Cadence')}
              </th>
              <th className="py-2.5 px-3 text-amber-400 font-semibold">
                <Zap className="inline h-3.5 w-3.5 mr-1" />
                {t('workoutLaps.power', 'Power')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {laps.map((lap) => (
              <tr
                key={lap.id}
                className="hover:bg-slate-800/40 transition-colors font-mono"
              >
                <td className="py-2.5 px-3 font-bold text-slate-200">
                  #{lap.lap_index}
                </td>
                <td className="py-2.5 px-3 text-slate-300 font-medium font-sans">
                  {lap.distance_meters != null
                    ? formatLapDistance(lap.distance_meters, distanceUnit)
                    : '--'}
                </td>
                <td className="py-2.5 px-3 text-slate-300">
                  {formatDuration(lap.duration_seconds)}
                </td>
                <td className="py-2.5 px-3 text-indigo-300 font-semibold">
                  {formatPace(
                    lap.distance_meters,
                    lap.duration_seconds,
                    distanceUnit
                  )}
                </td>
                <td className="py-2.5 px-3 text-rose-300">
                  {lap.avg_heart_rate ? `${lap.avg_heart_rate} bpm` : '--'}
                  {lap.max_heart_rate ? ` (${lap.max_heart_rate})` : ''}
                </td>
                <td className="py-2.5 px-3 text-teal-300">
                  {lap.avg_respiration_brpm != null
                    ? `${lap.avg_respiration_brpm.toFixed(1)}`
                    : '--'}
                </td>
                <td className="py-2.5 px-3 text-cyan-300">
                  {lap.avg_cadence ? `${lap.avg_cadence} rpm` : '--'}
                </td>
                <td className="py-2.5 px-3 text-amber-300">
                  {lap.avg_power_watts
                    ? `${Math.round(lap.avg_power_watts)} W`
                    : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
