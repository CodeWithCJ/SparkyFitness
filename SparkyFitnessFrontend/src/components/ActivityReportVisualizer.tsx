import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import ZoomableChart from "./ZoomableChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePreferences } from "@/contexts/PreferencesContext";
import { FaRoute, FaClock, FaWalking, FaMountain, FaFire, FaHeartbeat, FaRunning } from 'react-icons/fa';
import ActivityReportLapTable from './ActivityReportLapTable';
import { info, warn, error as logError } from "@/utils/logging";
import ActivityReportMap from './ActivityReportMap';
import WorkoutReportVisualizer from './WorkoutReportVisualizer';

interface ActivityReportVisualizerProps {
  exerciseEntryId: string;
  providerName: string; // e.g., 'garmin', 'withings'
}

type XAxisMode = 'timeOfDay' | 'activityDuration' | 'distance';

interface ActivityDetails {
  activityName: string;
  eventType?: string;
  course?: string;
  gear?: string;
  totalAscent?: number;
  calories?: number;
  distance?: number;
  duration?: number;
  averagePace?: number;
  averageHR?: number;
  averageRunCadence?: number;
}

interface ActivityMetrics {
  geoPolylineDTO?: {
    polyline: { lat: number; lon: number }[];
  };
  activityDetailMetrics: any[];
  metricDescriptors: any[];
}

interface ActivitySplits {
  lapDTOs: any[];
}

export interface WorkoutData {
  workoutName: string;
  description?: string;
  sportType?: { sportTypeKey: string };
  estimatedDurationInSecs?: number;
  workoutSegments?: {
    segmentOrder: number;
    workoutSteps: any[];
  }[];
  // Add other workout-specific fields as needed
}

interface ActivityData {
  activity: {
    activity: ActivityDetails;
    details: ActivityMetrics;
    splits: ActivitySplits;
    hr_in_timezones: any[];
  } | null;
  workout: WorkoutData | null;
}

const ActivityReportVisualizer: React.FC<ActivityReportVisualizerProps> = ({ exerciseEntryId, providerName }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityData, setActivityData] = useState<ActivityData | null>(null);
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>('timeOfDay'); // Default to time of day
  const { distanceUnit, convertDistance, loggingLevel, energyUnit, convertEnergy } = usePreferences();

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? t('common.kcalUnit', 'kcal') : t('common.kJUnit', 'kJ');
  };

  useEffect(() => {
    const fetchActivityData = async () => {
      try {
        setLoading(true);
        // Dynamically construct the API endpoint based on providerName
        let apiUrl = '';
        // Construct the API URL using the generic endpoint and providerName
        apiUrl = `/api/exercises/activity-details/${exerciseEntryId}/${providerName}`;

        const response = await axios.get(apiUrl);
        setActivityData(response.data);
        info(loggingLevel, "Fetched activity data:", JSON.stringify(response.data, null, 2));
      } catch (err) {
        setError(t('reports.activityReport.error', { error: `Failed to fetch ${providerName} activity details.` }));
        logError(loggingLevel, t('reports.activityReport.error', { error: `Failed to fetch ${providerName} activity details.` }), err);
      } finally {
        setLoading(false);
      }
    };

    if (exerciseEntryId && providerName) {
      fetchActivityData();
    }
  }, [exerciseEntryId, providerName]);

  if (loading) {
    return <div>{t('reports.activityReport.loadingActivityReport')}</div>;
  }

  if (error) {
    return <div className="text-red-500">{t('reports.activityReport.error', { error: error })}</div>;
  }

  if (!activityData) {
    return <div>{t('reports.activityReport.noActivityDataAvailable')}</div>;
  }

 // Data processing for charts (Garmin specific for now)
 // This section will need to be refactored to be more generic or use helper functions
 // based on the providerName if other providers have different data structures.

 const processChartData = (metrics: any[]) => {
   if (!metrics || metrics.length === 0) return [];
 
    const metricDescriptors = activityData?.activity?.details?.metricDescriptors;
    if (!metricDescriptors) {
      logError(loggingLevel, t('reports.activityReport.metricDescriptorsNotFound'));
      return [];
    }
 
    const timestampDescriptor = metricDescriptors.find((d: any) => d.key === 'directTimestamp');
    const distanceDescriptor = metricDescriptors.find((d: any) => d.key === 'sumDistance');
 
    // Add a defensive check to ensure metricDescriptors is not missing keys
    if (!timestampDescriptor || !distanceDescriptor) {
      logError(loggingLevel, t('reports.activityReport.metricDescriptorsMissingKeys'));
      return [];
    }
   const speedDescriptor = metricDescriptors.find((d: any) => d.key === 'directSpeed');
   const heartRateDescriptor = metricDescriptors.find((d: any) => d.key === 'directHeartRate');
   const runCadenceDescriptor = metricDescriptors.find((d: any) => d.key === 'directRunCadence');
   const elevationDescriptor = metricDescriptors.find((d: any) => d.key === 'directElevation');

   const metricKeyToDataIndexMap: { [key: string]: number } = {};
   let currentDataIndex = 0;

   // Build a map of metric key to its actual index in the 'metrics' array
   // by iterating through metricDescriptors and assigning sequential indices
   // to the metrics that are actually present in the 'metrics' array.
   // This assumes that the order of metrics in the 'metrics' array corresponds
   // to the order of the relevant descriptors in 'metricDescriptors'.
   metricDescriptors.forEach((descriptor: any) => {
     // Only map the keys we are interested in for the chart
     // This list should match the order of metrics in activityDetailMetrics[0].metrics
     if (descriptor.key === 'directHeartRate') {
       metricKeyToDataIndexMap['directHeartRate'] = currentDataIndex;
       currentDataIndex++;
     } else if (descriptor.key === 'sumElapsedDuration') {
       metricKeyToDataIndexMap['sumElapsedDuration'] = currentDataIndex;
       currentDataIndex++;
     } else if (descriptor.key === 'directAirTemperature') {
       metricKeyToDataIndexMap['directAirTemperature'] = currentDataIndex;
       currentDataIndex++;
     } else if (descriptor.key === 'directTimestamp') {
       metricKeyToDataIndexMap['directTimestamp'] = currentDataIndex;
       currentDataIndex++;
     } else if (descriptor.key === 'sumDistance') {
       metricKeyToDataIndexMap['sumDistance'] = currentDataIndex;
       currentDataIndex++;
     } else if (descriptor.key === 'directSpeed') {
       metricKeyToDataIndexMap['directSpeed'] = currentDataIndex;
       currentDataIndex++;
     } else if (descriptor.key === 'directRunCadence') {
       metricKeyToDataIndexMap['directRunCadence'] = currentDataIndex;
       currentDataIndex++;
     } else if (descriptor.key === 'directElevation') {
       metricKeyToDataIndexMap['directElevation'] = currentDataIndex;
       currentDataIndex++;
     }
   });

   const timestampIndex = metricKeyToDataIndexMap['directTimestamp'];
   const distanceIndex = metricKeyToDataIndexMap['sumDistance'];
   const speedIndex = metricKeyToDataIndexMap['directSpeed'];
   const heartRateIndex = metricKeyToDataIndexMap['directHeartRate'];
   const runCadenceIndex = metricKeyToDataIndexMap['directRunCadence'];
   const elevationIndex = metricKeyToDataIndexMap['directElevation'];

   // Add a defensive check for heartRateDescriptor
   if (!heartRateDescriptor) {
     warn(loggingLevel, t('reports.activityReport.heartRateDescriptorNotFound'));
   } else {
     info(loggingLevel, `Heart Rate Descriptor found at index: ${heartRateIndex}`);
   }
   // Removed redundant runCadenceIndex declaration

   if (timestampIndex === undefined || distanceIndex === undefined) {
     logError(loggingLevel, t('reports.activityReport.missingTimestampOrDistanceDescriptor'));
     return [];
   }

   let activityStartTime: number = 0;
   let initialDistance: number = 0;

   const REFERENCE_UNIX_EPOCH_START = 1000000000000; // Roughly 2001-09-09 01:46:40 UTC

   // Separate timestamps into potential relative and absolute groups
   const relativeTimestamps: number[] = [];
   const absoluteTimestamps: number[] = [];

   for (const metric of metrics) {
     const ts = parseFloat(metric.metrics[timestampIndex]);
     if (!isNaN(ts)) {
       if (ts < REFERENCE_UNIX_EPOCH_START) {
         relativeTimestamps.push(ts);
       } else {
         absoluteTimestamps.push(ts);
       }
     }
   }

   if (absoluteTimestamps.length > 0) {
     // If absolute timestamps exist, use the minimum absolute timestamp as the start
     activityStartTime = Math.min(...absoluteTimestamps);
   } else if (relativeTimestamps.length > 0) {
     // If only relative timestamps exist, use 0 as the start (relative to the first data point)
     activityStartTime = Math.min(...relativeTimestamps); // This will be the smallest relative offset
   } else {
     // No valid timestamps found
     logError(loggingLevel, t('reports.activityReport.noValidTimestampsFound'));
     return [];
   }

   // Find the initial distance corresponding to the determined activityStartTime
   const firstDataPoint = metrics.find(metric => parseFloat(metric.metrics[timestampIndex]) === activityStartTime);
   if (firstDataPoint) {
     const dist = parseFloat(firstDataPoint.metrics[distanceIndex]);
     initialDistance = !isNaN(dist) ? dist : 0;
   } else if (metrics.length > 0) {
     // Fallback for initialDistance if activityStartTime doesn't directly match a metric's timestamp
     // This can happen if activityStartTime is 0 (for relative timestamps) but the first metric's timestamp is not 0.
     const firstMetricDistance = parseFloat(metrics[0].metrics[distanceIndex]);
     initialDistance = !isNaN(firstMetricDistance) ? firstMetricDistance : 0;
   }

   const processedMetrics = metrics.map((metric: any) => {
     const currentTimestamp = parseFloat(metric.metrics[timestampIndex]);
     const currentDistance = parseFloat(metric.metrics[distanceIndex]);

     // Handle cases where a metric might not have all data points
     if (isNaN(currentTimestamp) || isNaN(currentDistance)) {
       return null; // Filtered out later
     }

     const speed = speedIndex !== undefined && metric.metrics[speedIndex] !== undefined ? metric.metrics[speedIndex] : 0;
     const heartRate = heartRateIndex !== undefined && metric.metrics[heartRateIndex] !== undefined ? metric.metrics[heartRateIndex] : null;
     const runCadence = runCadenceIndex !== undefined && metric.metrics[runCadenceIndex] !== undefined ? metric.metrics[runCadenceIndex] : 0;
     const elevation = elevationIndex !== undefined && metric.metrics[elevationIndex] !== undefined ? metric.metrics[elevationIndex] : null;
     
     if (heartRate !== null) {
       //info(loggingLevel, `Extracted Heart Rate: ${heartRate} at timestamp: ${currentTimestamp}`);
     }

     const paceMinutesPerKm = speed > 0 ? (1000 / (speed * 60)) : 0; // Convert m/s to min/km
     const activityDurationSeconds = (currentTimestamp - activityStartTime) / 1000; // Duration in seconds (assuming directTimestamp is in milliseconds)
     const relativeDistanceMeters = currentDistance - initialDistance; // Distance in meters

     return {
       timestamp: currentTimestamp, // Store raw numerical timestamp (in milliseconds)
       activityDuration: activityDurationSeconds / 60, // in minutes
       distance: relativeDistanceMeters, // in meters
       speed: speed ? parseFloat(speed.toFixed(2)) : 0,
       pace: paceMinutesPerKm > 0 ? parseFloat(paceMinutesPerKm.toFixed(2)) : 0,
       heartRate: heartRate,
       runCadence: runCadence,
       elevation: elevation,
     };
   }).filter(Boolean) as any[]; // Filter out null entries and assert type
   
   // Sort by timestamp to ensure chronological order
   processedMetrics.sort((a, b) => a.timestamp - b.timestamp);

   // Downsampling
   const sampledData: any[] = [];
   const maxPoints = 50; // Maximum number of points to display on the chart
   const samplingRate = Math.max(1, Math.floor(processedMetrics.length / maxPoints));

   for (let i = 0; i < processedMetrics.length; i++) {
     if (i % samplingRate === 0 || i === processedMetrics.length - 1) { // Always include the last point
       sampledData.push(processedMetrics[i]);
     }
   }

   return sampledData.map(dataPoint => ({
     ...dataPoint,
     distance: convertDistance(dataPoint.distance / 1000, 'km', distanceUnit), // Convert distance from meters to km, then to user's preferred unit
   }));
 };

 const allChartData = processChartData(activityData.activity?.details?.activityDetailMetrics);

 const paceData = allChartData.filter((data: any) => data.speed > 0); // Filter out zero speeds for meaningful pace
 const heartRateData = allChartData.filter((data: any) => data.heartRate !== null && data.heartRate > 0);
 const runCadenceData = allChartData.filter((data: any) => data.runCadence > 0);
 const elevationData = allChartData.filter((data: any) => data.elevation !== null);
 
 info(loggingLevel, "Pace Data Timestamps:", paceData.map((d: any) => d.timestamp));
 info(loggingLevel, "Heart Rate Data Timestamps:", heartRateData.map((d: any) => d.timestamp));
 info(loggingLevel, "Elevation Data Timestamps:", elevationData.map((d: any) => d.timestamp));
 info(loggingLevel, "Filtered Heart Rate Data:", heartRateData);
 

 const hrInTimezonesData = activityData.activity?.hr_in_timezones?.map((zone: any) => ({
   name: `Zone ${zone.zoneNumber} (${zone.zoneLowBoundary} bpm)`,
   'Time in Zone (s)': zone.secsInZone,
 }));

 // Extract summary data
 const totalActivityDurationSeconds = activityData.activity?.activity?.duration || 0;
 const totalActivityCalories = activityData.activity?.activity?.calories || 0;
 const totalActivityAscent = activityData.activity?.activity?.totalAscent || 0;
 const averageHR = activityData.activity?.activity?.averageHR || 0;
 const averageRunCadence = activityData.activity?.activity?.averageRunCadence || 0;

 let totalActivityDistanceForDisplay: number = 0;
 let averagePaceForDisplay: number = 0;

 // Determine total activity distance
 if (allChartData.length > 0) {
   // Prioritize the last point from chart data, which is already in the preferred unit
   totalActivityDistanceForDisplay = allChartData[allChartData.length - 1].distance;
 } else if (activityData.activity?.activity?.distance && activityData.activity.activity.distance > 0) {
   // Fallback to activityData.activity.distance if chart data is not available
   // activityData.activity.distance is in meters, convert to km then to preferred unit
   totalActivityDistanceForDisplay = convertDistance(activityData.activity.activity.distance / 1000, 'km', distanceUnit);
 }

 // Determine average pace
 if (activityData.activity?.activity?.averagePace && activityData.activity.activity.averagePace > 0) {
   // activityData.activity.averagePace is assumed to be in min/km from the backend.
   averagePaceForDisplay = activityData.activity.activity.averagePace;
   if (distanceUnit === 'miles') {
     averagePaceForDisplay = averagePaceForDisplay * 1.60934; // Convert min/km to min/mi
   }
 } else if (paceData.length > 0) {
   const totalPaceKm = paceData.reduce((sum: number, dataPoint: any) => sum + dataPoint.pace, 0); // pace is min/km
   if (paceData.length > 0) {
     let calculatedPace = totalPaceKm / paceData.length; // This is in min/km
     // If the preferred unit is miles, convert min/km to min/mi
     if (distanceUnit === 'miles') {
       calculatedPace = calculatedPace * 1.60934; // min/mi = min/km * km/mi
     }
     averagePaceForDisplay = calculatedPace;
   }
 }

 const totalActivityDurationFormatted = totalActivityDurationSeconds > 0 ? `${Math.floor(totalActivityDurationSeconds / 60)}:${(totalActivityDurationSeconds % 60).toFixed(0).padStart(2, '0')}` : 'N/A';
 const totalActivityDistanceFormatted = (totalActivityDistanceForDisplay > 0)
   ? `${totalActivityDistanceForDisplay.toFixed(2)} ${distanceUnit}`
   : 'N/A';
 const averagePaceFormatted = (averagePaceForDisplay > 0) ? `${averagePaceForDisplay.toFixed(2)} /${distanceUnit === 'km' ? 'km' : 'mi'}` : 'N/A';
 const totalActivityAscentFormatted = totalActivityAscent > 0 ? `${totalActivityAscent.toFixed(0)}` : '--';
 const totalActivityCaloriesFormatted = totalActivityCalories > 0 ? `${Math.round(convertEnergy(totalActivityCalories, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}` : 'N/A';
 const averageHRFormatted = averageHR > 0 ? `${averageHR.toFixed(0)} bpm` : 'N/A';
 const averageRunCadenceFormatted = averageRunCadence > 0 ? `${averageRunCadence.toFixed(0)} spm` : 'N/A';


 const getXAxisDataKey = () => {
   switch (xAxisMode) {
     case 'activityDuration':
       return 'activityDuration';
     case 'distance':
       return 'distance';
     case 'timeOfDay':
     default:
       return 'timestamp';
   }
 };

 const getXAxisLabel = () => {
   switch (xAxisMode) {
     case 'activityDuration':
       return t('reports.activityReport.activityDurationMin');
     case 'distance':
       return t('reports.activityReport.distance') + ` (${distanceUnit === 'km' ? 'km' : 'mi'})`;
     case 'timeOfDay':
     default:
       return t('reports.activityReport.timeOfDayLocal');
   }
 };


 return (
   <div className="activity-report-visualizer p-4">
     <div className="flex items-center mb-4">
       <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
         <span className="text-xl">{activityData.activity ? '🏃' : '🏋️'}</span>
       </div>
       <h2 className="text-2xl font-bold">{activityData.activity?.activity.activityName || activityData.workout?.workoutName}</h2>
       <span className="ml-2 text-gray-500 cursor-pointer">✏️</span>
     </div>

     {activityData.activity && (
       <>
         <div className="flex flex-wrap gap-4 mb-6 text-sm text-muted-foreground">
           {activityData.activity?.activity.eventType && (
             <span>{t('reports.activityReport.event')} {typeof activityData.activity.activity.eventType === 'object' ? (activityData.activity.activity.eventType as any).typeKey || t('common.notApplicable') : activityData.activity.activity.eventType}</span>
           )}
           {activityData.activity?.activity.course && (
             <span className="mr-4">{t('reports.activityReport.course')} {typeof activityData.activity.activity.course === 'object' ? (activityData.activity.activity.course as any).typeKey || t('common.notApplicable') : activityData.activity.activity.course}</span>
           )}
           {activityData.activity?.activity.gear && (
             <span className="mr-4">{t('reports.activityReport.gear')} {typeof activityData.activity.activity.gear === 'object' ? (activityData.activity.activity.gear as any).typeKey || t('common.notApplicable') : activityData.activity.activity.gear}</span>
           )}
         </div>

         {activityData.activity?.details?.geoPolylineDTO?.polyline && activityData.activity.details.geoPolylineDTO.polyline.length > 0 && (
           <div className="mb-8">
             <h3 className="text-xl font-semibold mb-2">{t('reports.activityReport.activityMap')}</h3>
             <ActivityReportMap polylineData={activityData.activity.details.geoPolylineDTO.polyline} />
           </div>
         )}

         <div className="mb-8">
           <h3 className="text-xl font-semibold mb-2">{t('reports.activityReport.stats')}</h3>
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                 <CardTitle className="text-sm font-medium">{t('reports.activityReport.distance')}</CardTitle>
                 <FaRoute className="h-5 w-5 text-blue-500" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{totalActivityDistanceFormatted}</div>
               </CardContent>
             </Card>
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                 <CardTitle className="text-sm font-medium">{t('reports.activityReport.time')}</CardTitle>
                 <FaClock className="h-5 w-5 text-green-500" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{totalActivityDurationFormatted}</div>
               </CardContent>
             </Card>
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                 <CardTitle className="text-sm font-medium">{t('reports.activityReport.avgPace')}</CardTitle>
                 <FaWalking className="h-5 w-5 text-purple-500" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{averagePaceFormatted}</div>
               </CardContent>
             </Card>
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                 <CardTitle className="text-sm font-medium">{t('reports.activityReport.totalAscent')}</CardTitle>
                 <FaMountain className="h-5 w-5 text-gray-700" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{totalActivityAscentFormatted}</div>
               </CardContent>
             </Card>
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                 <CardTitle className="text-sm font-medium">{t('reports.activityReport.calories')}</CardTitle>
                 <FaFire className="h-5 w-5 text-red-500" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{totalActivityCaloriesFormatted}</div>
               </CardContent>
             </Card>
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                 <CardTitle className="text-sm font-medium">{t('reports.activityReport.heartRate')}</CardTitle>
                 <FaHeartbeat className="h-5 w-5 text-pink-500" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{averageHRFormatted}</div>
               </CardContent>
             </Card>
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                 <CardTitle className="text-sm font-medium">{t('reports.activityReport.runningDynamics')}</CardTitle>
                 <FaRunning className="h-5 w-5 text-orange-500" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{averageRunCadenceFormatted}</div>
               </CardContent>
             </Card>
           </div>
         </div>

         <div className="mb-4">
           <span className="mr-2">{t('reports.activityReport.xAxis')}</span>
           <button
             className={`px-3 py-1 rounded-md text-sm ${xAxisMode === 'timeOfDay' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}`}
             onClick={() => setXAxisMode('timeOfDay')}
           >
             {t('reports.activityReport.timeOfDay')}
           </button>
           <button
             className={`ml-2 px-3 py-1 rounded-md text-sm ${xAxisMode === 'activityDuration' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}`}
             onClick={() => setXAxisMode('activityDuration')}
           >
             {t('reports.activityReport.duration')}
           </button>
           <button
             className={`ml-2 px-3 py-1 rounded-md text-sm ${xAxisMode === 'distance' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}`}
             onClick={() => setXAxisMode('distance')}
           >
             {t('reports.activityReport.distance')}
           </button>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {paceData && paceData.length > 0 && (
             <ZoomableChart title={t('reports.activityReport.paceAndSpeed')}>
               {(isMaximized, zoomLevel) => (
               <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
                 <CardHeader>
                   <CardTitle className="text-sm">{t('reports.activityReport.paceAndSpeed')}</CardTitle>
                 </CardHeader>
                 <CardContent className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}>
                     <ResponsiveContainer width={`${100 * zoomLevel}%`} height={isMaximized ? `${100 * zoomLevel}%` : 300 * zoomLevel}>
                       <LineChart data={paceData} syncId="activityReportSync">
                         <CartesianGrid strokeDasharray="3 3" />
                         <XAxis
                           dataKey={getXAxisDataKey()}
                           label={{ value: getXAxisLabel(), position: 'insideBottom', offset: -5 }}
                           tickFormatter={(value) => {
                             if (xAxisMode === 'activityDuration') return `${value.toFixed(0)} ${t('common.min')}`;
                             if (xAxisMode === 'distance') return `${value.toFixed(2)}`;
                             if (xAxisMode === 'timeOfDay') return new Date(value).toLocaleTimeString();
                             return value;
                           }}
                           interval="preserveStartEnd"
                         />
                         <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                         <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                         <Tooltip
                           contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                           labelFormatter={(value) => {
                             if (xAxisMode === 'timeOfDay') {
                               return new Date(value).toLocaleTimeString();
                             }
                             if (xAxisMode === 'activityDuration') {
                               return `${Number(value).toFixed(0)} ${t('common.min')}`;
                             }
                             if (xAxisMode === 'distance') {
                               return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                             }
                             return String(value);
                           }}
                         />
                         <Legend />
                         <Line yAxisId="left" type="monotone" dataKey="pace" stroke="#8884d8" name={t('reports.activityReport.paceMinPerKm')} dot={false} strokeWidth={2} />
                         <Line yAxisId="right" type="monotone" dataKey="speed" stroke="#82ca9d" name={t('reports.activityReport.speedMPerS')} dot={false} strokeWidth={2} />
                       </LineChart>
                     </ResponsiveContainer>
                 </CardContent>
               </Card>
               )}
             </ZoomableChart>
           )}

           {heartRateData && heartRateData.length > 0 && (
             <ZoomableChart title={t('reports.activityReport.heartRateBpm')}>
               {(isMaximized, zoomLevel) => (
               <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
                 <CardHeader>
                   <CardTitle className="text-sm">{t('reports.activityReport.heartRateBpm')}</CardTitle>
                 </CardHeader>
                 <CardContent className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}>
                     <ResponsiveContainer width={`${100 * zoomLevel}%`} height={isMaximized ? `${100 * zoomLevel}%` : 300 * zoomLevel}>
                       <LineChart data={heartRateData} syncId="activityReportSync">
                         <CartesianGrid strokeDasharray="3 3" />
                         <XAxis
                           dataKey={getXAxisDataKey()}
                           label={{ value: getXAxisLabel(), position: 'insideBottom', offset: -5 }}
                           tickFormatter={(value) => {
                             if (xAxisMode === 'activityDuration') return `${value.toFixed(0)} ${t('common.min')}`;
                             if (xAxisMode === 'distance') return `${value.toFixed(2)}`;
                             if (xAxisMode === 'timeOfDay') return new Date(value).toLocaleTimeString();
                             return value;
                           }}
                           interval="preserveStartEnd"
                         />
                         <YAxis />
                         <Tooltip
                           contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                           labelFormatter={(value) => {
                             if (xAxisMode === 'timeOfDay') {
                               return new Date(value).toLocaleTimeString();
                             }
                             if (xAxisMode === 'activityDuration') {
                               return `${Number(value).toFixed(0)} ${t('common.min')}`;
                             }
                             if (xAxisMode === 'distance') {
                               return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                             }
                             return String(value);
                           }}
                         />
                         <Legend />
                         <Line type="monotone" dataKey="heartRate" stroke="#ff7300" name={t('reports.activityReport.heartRateBpm')} dot={false} strokeWidth={2} />
                       </LineChart>
                     </ResponsiveContainer>
                 </CardContent>
               </Card>
               )}
             </ZoomableChart>
           )}

           {runCadenceData && runCadenceData.length > 0 && (
             <ZoomableChart title={t('reports.activityReport.runCadenceSpM')}>
               {(isMaximized, zoomLevel) => (
               <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
                 <CardHeader>
                   <CardTitle className="text-sm">{t('reports.activityReport.runCadenceSpM')}</CardTitle>
                 </CardHeader>
                 <CardContent className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}>
                     <ResponsiveContainer width={`${100 * zoomLevel}%`} height={isMaximized ? `${100 * zoomLevel}%` : 300 * zoomLevel}>
                       <LineChart data={runCadenceData} syncId="activityReportSync">
                         <CartesianGrid strokeDasharray="3 3" />
                         <XAxis
                           dataKey={getXAxisDataKey()}
                           label={{ value: getXAxisLabel(), position: 'insideBottom', offset: -5 }}
                           tickFormatter={(value) => {
                             if (xAxisMode === 'activityDuration') return `${value.toFixed(0)} ${t('common.min')}`;
                             if (xAxisMode === 'distance') return `${value.toFixed(2)}`;
                             if (xAxisMode === 'timeOfDay') return new Date(value).toLocaleTimeString();
                             return value;
                           }}
                           interval="preserveStartEnd"
                         />
                         <YAxis />
                         <Tooltip
                           contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                           labelFormatter={(value) => {
                             if (xAxisMode === 'timeOfDay') {
                               return new Date(value).toLocaleTimeString();
                             }
                             if (xAxisMode === 'activityDuration') {
                               return `${Number(value).toFixed(0)} ${t('common.min')}`;
                             }
                             if (xAxisMode === 'distance') {
                               return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                             }
                             return String(value);
                           }}
                         />
                         <Legend />
                         <Line type="monotone" dataKey="runCadence" stroke="#387900" name={t('reports.activityReport.runCadenceSpM')} dot={false} strokeWidth={2} />
                       </LineChart>
                     </ResponsiveContainer>
                 </CardContent>
               </Card>
               )}
             </ZoomableChart>
           )}

           {elevationData && elevationData.length > 0 && (
             <ZoomableChart title={t('reports.activityReport.elevationM')}>
               {(isMaximized, zoomLevel) => (
               <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
                 <CardHeader>
                   <CardTitle className="text-sm">{t('reports.activityReport.elevationM')}</CardTitle>
                 </CardHeader>
                 <CardContent className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}>
                     <ResponsiveContainer width={`${100 * zoomLevel}%`} height={isMaximized ? `${100 * zoomLevel}%` : 300 * zoomLevel}>
                       <LineChart data={elevationData} syncId="activityReportSync">
                         <CartesianGrid strokeDasharray="3 3" />
                         <XAxis
                           dataKey={getXAxisDataKey()}
                           label={{ value: getXAxisLabel(), position: 'insideBottom', offset: -5 }}
                           tickFormatter={(value) => {
                             if (xAxisMode === 'activityDuration') return `${value.toFixed(0)} ${t('common.min')}`;
                             if (xAxisMode === 'distance') return `${value.toFixed(2)}`;
                             if (xAxisMode === 'timeOfDay') return new Date(value).toLocaleTimeString();
                             return value;
                           }}
                           interval="preserveStartEnd"
                         />
                         <YAxis />
                         <Tooltip
                           contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                           labelFormatter={(value) => {
                             if (xAxisMode === 'timeOfDay') {
                               return new Date(value).toLocaleTimeString();
                             }
                             if (xAxisMode === 'activityDuration') {
                               return `${Number(value).toFixed(0)} ${t('common.min')}`;
                             }
                             if (xAxisMode === 'distance') {
                               return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                             }
                             return String(value);
                           }}
                           formatter={(value: number) => Number(value).toFixed(2)}
                         />
                         <Legend />
                         <Line type="monotone" dataKey="elevation" stroke="#007bff" name={t('reports.activityReport.elevationM')} dot={false} strokeWidth={2} />
                       </LineChart>
                     </ResponsiveContainer>
                 </CardContent>
               </Card>
               )}
             </ZoomableChart>
           )}

           {hrInTimezonesData && hrInTimezonesData.length > 0 && (
             <ZoomableChart title={t('reports.activityReport.heartRateTimeInZones')}>
               {(isMaximized, zoomLevel) => (
               <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
                 <CardHeader>
                   <CardTitle className="text-sm">{t('reports.activityReport.heartRateTimeInZones')}</CardTitle>
                 </CardHeader>
                 <CardContent className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}>
                     <ResponsiveContainer width={`${100 * zoomLevel}%`} height={isMaximized ? `${100 * zoomLevel}%` : 300 * zoomLevel}>
                       <BarChart data={hrInTimezonesData}>
                         <CartesianGrid strokeDasharray="3 3" />
                         <XAxis dataKey="name" />
                         <YAxis />
                         <Tooltip
                             contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                             formatter={(value: number) => `${value.toFixed(2)} ${t('reports.activityReport.timeInZoneS')}`}
                           />
                         <Legend />
                         <Bar dataKey={t('reports.activityReport.timeInZoneS')} fill="#8884d8" />
                       </BarChart>
                     </ResponsiveContainer>
                 </CardContent>
               </Card>
               )}
             </ZoomableChart>
           )}
         </div>

         {activityData.activity?.splits?.lapDTOs && activityData.activity.splits.lapDTOs.length > 0 && (
           <ZoomableChart title={t('reports.activityReport.lapsTable')}>
             {(isMaximized, zoomLevel) => (
               <ActivityReportLapTable lapDTOs={activityData.activity.splits.lapDTOs} isMaximized={isMaximized} zoomLevel={zoomLevel} />
             )}
           </ZoomableChart>
         )}
       </>
     )}
     {activityData.workout && <WorkoutReportVisualizer workoutData={activityData.workout} />}
   </div>
 );
};

export default ActivityReportVisualizer;