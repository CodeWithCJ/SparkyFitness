import React from 'react';
import { useTranslation } from 'react-i18next';

// Body Battery max value (Garmin uses 0-100 scale)
const BODY_BATTERY_MAX = 100;

interface BodyBatteryGaugeProps {
  value: number;        // 0-100
  size?: number;        // px, default 160
  strokeWidth?: number; // px, default 12
}

interface BodyBatteryStatusInfo {
  statusKey: string;
  statusDefault: string;
  color: string;
  descriptionKey: string;
  descriptionDefault: string;
}

const getBodyBatteryStatusInfo = (value: number): BodyBatteryStatusInfo => {
  if (value <= 25) {
    return {
      statusKey: 'reports.bodyBatteryStatusLow',
      statusDefault: 'Low',
      color: '#ef4444',
      descriptionKey: 'reports.bodyBatteryDescLow',
      descriptionDefault: 'Your energy is depleted. Rest recommended.'
    };
  } else if (value <= 50) {
    return {
      statusKey: 'reports.bodyBatteryStatusModerate',
      statusDefault: 'Moderate',
      color: '#f97316',
      descriptionKey: 'reports.bodyBatteryDescModerate',
      descriptionDefault: 'Your energy is limited. Light activity ok.'
    };
  } else if (value <= 75) {
    return {
      statusKey: 'reports.bodyBatteryStatusGood',
      statusDefault: 'Good',
      color: '#3b82f6',
      descriptionKey: 'reports.bodyBatteryDescGood',
      descriptionDefault: 'Your Body Battery is at a good level for the day.'
    };
  } else {
    return {
      statusKey: 'reports.bodyBatteryStatusExcellent',
      statusDefault: 'Excellent',
      color: '#22c55e',
      descriptionKey: 'reports.bodyBatteryDescExcellent',
      descriptionDefault: "You're fully charged and ready for intense activity."
    };
  }
};

const BodyBatteryGauge: React.FC<BodyBatteryGaugeProps> = ({
  value,
  size = 160,
  strokeWidth = 12
}) => {
  const { t } = useTranslation();
  const { statusKey, statusDefault, color, descriptionKey, descriptionDefault } = getBodyBatteryStatusInfo(value);
  const status = t(statusKey, statusDefault);
  const description = t(descriptionKey, descriptionDefault);

  // SVG calculations
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Calculate the arc (270 degrees total, starting from bottom-left)
  const totalArc = 0.75; // 270 degrees = 75% of full circle
  const arcLength = circumference * totalArc;
  const filledLength = (value / 100) * arcLength;

  // Rotation to start from bottom-left (135 degrees from top)
  const rotation = 135;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform"
      >
        {/* Background arc (empty portion) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform={`rotate(${rotation} ${center} ${center})`}
        />

        {/* Filled arc */}
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
          y={center - 8}
          textAnchor="middle"
          className="fill-foreground font-bold"
          style={{ fontSize: size * 0.25 }}
        >
          {value}
        </text>

        {/* Center text - Max */}
        <text
          x={center}
          y={center + 16}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: size * 0.1 }}
        >
          {BODY_BATTERY_MAX}
        </text>
      </svg>

      {/* Status text */}
      <div className="text-center mt-2">
        <p className="font-semibold text-lg" style={{ color }}>{status}</p>
        <p className="text-sm text-muted-foreground max-w-[200px]">{description}</p>
      </div>
    </div>
  );
};

export { getBodyBatteryStatusInfo };
export default BodyBatteryGauge;
