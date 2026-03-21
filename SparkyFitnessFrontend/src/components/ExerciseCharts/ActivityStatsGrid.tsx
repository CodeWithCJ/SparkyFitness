import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FaRoute,
  FaClock,
  FaWalking,
  FaMountain,
  FaFire,
  FaHeartbeat,
  FaRunning,
} from 'react-icons/fa';

interface ActivityStatsGridProps {
  distance: string | null;
  duration: string | null;
  pace: string | null;
  ascent: string | null;
  calories: string | null;
  heartRate: string | null;
  cadence: string | null;
}

export const ActivityStatsGrid = ({
  distance,
  duration,
  pace,
  ascent,
  calories,
  heartRate,
  cadence,
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
            <FaWalking className="h-5 w-5 text-purple-500" />
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
    </div>
  );
};
