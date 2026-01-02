import React from 'react';
import { useTranslation } from 'react-i18next';

interface SpO2GaugeProps {
  value: number;        // 0-100
  size?: number;        // px, default 160
  strokeWidth?: number; // px, default 12
}

const getSpO2StatusInfo = (value: number): { status: string; color: string; description: string } => {
  if (value < 70) {
    return {
      status: 'Critical',
      color: '#ef4444',
      description: 'Dangerously low oxygen levels. Seek medical attention.'
    };
  } else if (value < 80) {
    return {
      status: 'Low',
      color: '#f97316',
      description: 'Below normal oxygen levels. Monitor closely.'
    };
  } else if (value < 90) {
    return {
      status: 'Moderate',
      color: '#eab308',
      description: 'Slightly below optimal levels.'
    };
  } else if (value < 95) {
    return {
      status: 'Normal',
      color: '#22c55e',
      description: 'Healthy oxygen saturation levels.'
    };
  } else {
    return {
      status: 'Excellent',
      color: '#22c55e',
      description: 'Optimal oxygen saturation.'
    };
  }
};

// Get color for a specific SpO2 value (for bar chart)
export const getSpO2Color = (value: number): string => {
  if (value < 70) return '#ef4444';
  if (value < 80) return '#f97316';
  if (value < 90) return '#eab308';
  return '#22c55e';
};

const SpO2Gauge: React.FC<SpO2GaugeProps> = ({
  value,
  size = 160,
  strokeWidth = 12
}) => {
  const { t } = useTranslation();
  const { status, color, description } = getSpO2StatusInfo(value);

  // SVG calculations
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Calculate the arc (270 degrees total, starting from bottom-left)
  const totalArc = 0.75; // 270 degrees = 75% of full circle
  const arcLength = circumference * totalArc;

  // SpO2 typically ranges from 60-100%, map to gauge
  const minValue = 60;
  const maxValue = 100;
  const normalizedValue = Math.max(0, Math.min(100, ((value - minValue) / (maxValue - minValue)) * 100));
  const filledLength = (normalizedValue / 100) * arcLength;

  // Rotation to start from bottom-left (135 degrees from top)
  const rotation = 135;

  // Create gradient segments for the background arc
  const segments = [
    { start: 0, end: 0.25, color: '#ef4444' },      // <70% - red
    { start: 0.25, end: 0.5, color: '#f97316' },    // 70-79% - orange
    { start: 0.5, end: 0.75, color: '#eab308' },    // 80-89% - yellow
    { start: 0.75, end: 1, color: '#22c55e' },      // 90-100% - green
  ];

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform"
      >
        {/* Background gradient arc segments */}
        {segments.map((segment, index) => {
          const segmentLength = (segment.end - segment.start) * arcLength;
          const segmentOffset = segment.start * arcLength;
          return (
            <circle
              key={index}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeOpacity={0.3}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              strokeDasharray={`${segmentLength} ${circumference}`}
              strokeDashoffset={-segmentOffset}
              transform={`rotate(${rotation} ${center} ${center})`}
            />
          );
        })}

        {/* Filled arc showing current value */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${circumference}`}
          transform={`rotate(${rotation} ${center} ${center})`}
          className="transition-all duration-700 ease-out"
        />

        {/* Center text - Value */}
        <text
          x={center}
          y={center - 5}
          textAnchor="middle"
          className="fill-foreground font-bold"
          style={{ fontSize: size * 0.22 }}
        >
          {value.toFixed(0)}%
        </text>

        {/* Center text - Label */}
        <text
          x={center}
          y={center + 18}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: size * 0.09 }}
        >
          SpO2
        </text>
      </svg>

      {/* Status text */}
      <div className="text-center mt-2">
        <p className="font-semibold text-lg" style={{ color }}>{t(`reports.spo2Status.${status.toLowerCase()}`, status)}</p>
        <p className="text-sm text-muted-foreground max-w-[200px]">{t(`reports.spo2Description.${status.toLowerCase()}`, description)}</p>
      </div>
    </div>
  );
};

export { getSpO2StatusInfo };
export default SpO2Gauge;
