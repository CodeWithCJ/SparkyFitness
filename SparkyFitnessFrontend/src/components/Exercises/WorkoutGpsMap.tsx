import React from 'react';
import { GpsTrackPoint } from '@workspace/shared';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, Mountain, Heart, Wind } from 'lucide-react';

import { Trans, useTranslation } from 'react-i18next';
interface WorkoutGpsMapProps {
  // The workout's trackpoint array (ExerciseEntryGpsPoints.points), not the
  // wrapping row -- callers pass `gpsData?.points`.
  gpsPoints?: GpsTrackPoint[];
  isLoading?: boolean;
}

// Custom Leaflet Markers
const startIcon = L.divIcon({
  className: 'custom-start-marker',
  html: `<div style="background-color: #10b981; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(16,185,129,0.8);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const endIcon = L.divIcon({
  className: 'custom-end-marker',
  html: `<div style="background-color: #ef4444; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(239,68,68,0.8);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export const WorkoutGpsMap: React.FC<WorkoutGpsMapProps> = ({
  gpsPoints,
  isLoading,
}) => {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <div className="w-full h-80 bg-slate-900/40 border border-slate-800 rounded-xl p-4 animate-pulse flex items-center justify-center">
        <span className="text-slate-400 text-sm">
          {t(
            'exercises.workoutGpsMap.loadingWorkoutGPSRoute',
            'Loading workout GPS route...'
          )}
        </span>
      </div>
    );
  }

  if (!gpsPoints || gpsPoints.length === 0) {
    return null;
  }

  const positions: [number, number][] = gpsPoints
    .filter((pt) => pt.lat != null && pt.lon != null && pt.lat !== 0)
    .map((pt) => [pt.lat, pt.lon]);

  if (positions.length === 0) {
    return null;
  }

  const startPos = positions[0];
  const endPos = positions[positions.length - 1];

  if (!startPos || !endPos) return null;

  // Calculate summary metrics from trackpoints
  const hrPoints = gpsPoints
    .filter((pt) => pt.hr != null)
    .map((pt) => pt.hr as number);
  const avgHr =
    hrPoints.length > 0
      ? Math.round(hrPoints.reduce((a, b) => a + b, 0) / hrPoints.length)
      : null;
  const maxHr = hrPoints.length > 0 ? Math.max(...hrPoints) : null;

  const respPoints = gpsPoints
    .filter((pt) => pt.resp != null)
    .map((pt) => pt.resp as number);
  const avgResp =
    respPoints.length > 0
      ? (respPoints.reduce((a, b) => a + b, 0) / respPoints.length).toFixed(1)
      : null;

  const altitudes = gpsPoints
    .filter((pt) => pt.alt != null)
    .map((pt) => pt.alt as number);
  const minAlt =
    altitudes.length > 0 ? Math.round(Math.min(...altitudes)) : null;
  const maxAlt =
    altitudes.length > 0 ? Math.round(Math.max(...altitudes)) : null;

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Navigation className="h-5 w-5 text-teal-400" />
          <h3 className="text-base font-bold text-slate-100">
            {t(
              'exercises.workoutGpsMap.workoutGPSRouteMap',
              'Workout GPS Route Map'
            )}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
          {!!avgHr && (
            <span className="text-rose-400">
              <Heart className="inline h-3.5 w-3.5 mr-1" />
              {t(
                'exercises.workoutGpsMap.avgBpm2',
                '{{avgHr}} avg bpm {{maxHr}}',
                {
                  avgHr,
                  maxHr: maxHr
                    ? t('exercises.workoutGpsMap.max', '({{maxHr}} max)', {
                        maxHr,
                      })
                    : '',
                }
              )}
            </span>
          )}
          {avgResp && (
            <span className="text-teal-400">
              <Wind className="inline h-3.5 w-3.5 mr-1" />
              {t('exercises.workoutGpsMap.brpm', '{{avgResp}} brpm', {
                avgResp,
              })}
            </span>
          )}
          {minAlt != null && maxAlt != null && (
            <span className="text-cyan-400">
              <Mountain className="inline h-3.5 w-3.5 mr-1" />
              {minAlt}m - {maxAlt}m
            </span>
          )}
        </div>
      </div>

      <div className="w-full h-80 rounded-lg overflow-hidden border border-slate-800 z-0">
        <MapContainer
          center={startPos}
          zoom={14}
          scrollWheelZoom={false}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline
            positions={positions}
            pathOptions={{ color: '#06b6d4', weight: 4, opacity: 0.9 }}
          />
          <Marker position={startPos} icon={startIcon}>
            <Popup>
              <div className="text-xs font-sans">
                <Trans
                  i18nKey="exercises.workoutGpsMap.startPointLatLon"
                  defaults={
                    '<strong>Start Point</strong><br/>Lat: {{startPos}}, Lon: {{startPos2}}'
                  }
                  values={{
                    startPos: startPos[0].toFixed(5),
                    startPos2: startPos[1].toFixed(5),
                  }}
                  components={{ strong: <strong />, br: <br /> }}
                />
              </div>
            </Popup>
          </Marker>
          <Marker position={endPos} icon={endIcon}>
            <Popup>
              <div className="text-xs font-sans">
                <Trans
                  i18nKey="exercises.workoutGpsMap.finishPointLatLon"
                  defaults={
                    '<strong>Finish Point</strong><br/>Lat: {{endPos}}, Lon: {{endPos2}}'
                  }
                  values={{
                    endPos: endPos[0].toFixed(5),
                    endPos2: endPos[1].toFixed(5),
                  }}
                  components={{ strong: <strong />, br: <br /> }}
                />
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
};
