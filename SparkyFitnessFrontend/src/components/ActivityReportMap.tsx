import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// Fix for default icon issues with Webpack
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface ActivityReportMapProps {
  polylineData?: { lat: number; lon: number; }[];
}

const ActivityReportMap: React.FC<ActivityReportMapProps> = ({ polylineData }) => {
  const { t } = useTranslation();
  if (!polylineData || polylineData.length === 0) {
    return <div>{t('reports.noMapDataAvailable', 'No map data available.')}</div>;
  }

  const positions: [number, number][] = polylineData.map(p => [p.lat, p.lon]);
  const startPoint = positions[0];
  const endPoint = positions[positions.length - 1];

  return (
    <div style={{ height: '400px', width: '100%' }}>
      <MapContainer center={startPoint} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={positions} color="blue" />
        {startPoint && (
          <Marker position={startPoint} icon={new L.DivIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color: green; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;'></div>",
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          })} />
        )}
        {endPoint && (
          <Marker position={endPoint} icon={new L.DivIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color: red; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;'></div>",
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          })} />
        )}
      </MapContainer>
    </div>
  );
};

export default ActivityReportMap;