import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FaRoute,
  FaClock,
  FaMountain,
  FaFire,
  FaHeartbeat,
  FaRunning,
  FaTint,
  FaStopwatch,
  FaHourglassHalf,
  FaTachometerAlt,
  FaCloudSun,
  FaTshirt,
} from 'react-icons/fa';

interface ActivityStatsGridProps {
  distance: string | null;
  duration: string | null;
  pace: string | null;
  ascent: string | null;
  calories: string | null;
  heartRate: string | null;
  cadence: string | null;
  waterLoss: string | null;
  /** Garmin-parity fields — null hides the card, matching every stat above. */
  movingTime?: string | null;
  elapsedTime?: string | null;
  caloriesBreakdown?: string | null;
  avgMovingSpeed?: string | null;
  elevationRange?: string | null;
  weather?: string | null;
  gear?: string | null;
}

export const ActivityStatsGrid = ({
  distance,
  duration,
  pace,
  ascent,
  calories,
  heartRate,
  cadence,
  waterLoss,
  movingTime = null,
  elapsedTime = null,
  caloriesBreakdown = null,
  avgMovingSpeed = null,
  elevationRange = null,
  weather = null,
  gear = null,
}: ActivityStatsGridProps) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
      {distance !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.distance')}
            </CardTitle>
            <FaRoute className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{distance}</div>
          </CardContent>
        </Card>
      )}
      {duration !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.time')}
            </CardTitle>
            <FaClock className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{duration}</div>
          </CardContent>
        </Card>
      )}
      {pace !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.avgPace')}
            </CardTitle>
            <FaTachometerAlt className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pace}</div>
          </CardContent>
        </Card>
      )}
      {ascent !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.totalAscent')}
            </CardTitle>
            <FaMountain className="h-5 w-5 text-gray-700" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ascent}</div>
          </CardContent>
        </Card>
      )}
      {calories !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.calories')}
            </CardTitle>
            <FaFire className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{calories}</div>
          </CardContent>
        </Card>
      )}
      {heartRate !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.heartRate')}
            </CardTitle>
            <FaHeartbeat className="h-5 w-5 text-pink-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{heartRate}</div>
          </CardContent>
        </Card>
      )}
      {cadence !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.cadence')}
            </CardTitle>
            <FaRunning className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cadence}</div>
          </CardContent>
        </Card>
      )}
      {waterLoss !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.waterLoss', 'Water Loss')}
            </CardTitle>
            <FaTint className="h-5 w-5 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{waterLoss}</div>
          </CardContent>
        </Card>
      )}
      {movingTime !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.movingTime', 'Moving Time')}
            </CardTitle>
            <FaStopwatch className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{movingTime}</div>
          </CardContent>
        </Card>
      )}
      {elapsedTime !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.elapsedTime', 'Elapsed Time')}
            </CardTitle>
            <FaHourglassHalf className="h-5 w-5 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{elapsedTime}</div>
          </CardContent>
        </Card>
      )}
      {caloriesBreakdown !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t(
                'reports.activityReport.caloriesBreakdown',
                'Active / Resting'
              )}
            </CardTitle>
            <FaFire className="h-5 w-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{caloriesBreakdown}</div>
          </CardContent>
        </Card>
      )}
      {avgMovingSpeed !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.avgMovingSpeed', 'Avg Moving Speed')}
            </CardTitle>
            <FaTachometerAlt className="h-5 w-5 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgMovingSpeed}</div>
          </CardContent>
        </Card>
      )}
      {elevationRange !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.elevationRange', 'Min / Max Elev')}
            </CardTitle>
            <FaMountain className="h-5 w-5 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{elevationRange}</div>
          </CardContent>
        </Card>
      )}
      {weather !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.weather', 'Weather')}
            </CardTitle>
            <FaCloudSun className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weather}</div>
          </CardContent>
        </Card>
      )}
      {gear !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">
              {t('reports.activityReport.gear', 'Gear')}
            </CardTitle>
            <FaTshirt className="h-5 w-5 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gear}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
