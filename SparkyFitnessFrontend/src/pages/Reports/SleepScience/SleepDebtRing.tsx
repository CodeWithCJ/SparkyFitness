import type { SleepDebtData } from '@/api/SleepScience/sleepScience';
import type React from 'react';
import { useTranslation } from 'react-i18next';

interface SleepDebtRingProps {
  data: SleepDebtData;
  size?: number;
  strokeWidth?: number;
}

const DEBT_STATUS_MAP = {
  low: {
    color: '#22c55e',
    labelKey: 'sleepScience.debtLow',
    labelDefault: 'Low',
    descKey: 'sleepScience.debtLowDesc',
    descDefault: 'Your sleep debt is minimal. Great recovery!',
  },
  moderate: {
    color: '#f97316',
    labelKey: 'sleepScience.debtModerate',
    labelDefault: 'Moderate',
    descKey: 'sleepScience.debtModerateDesc',
    descDefault: 'Some accumulated debt. Try to catch up on sleep.',
  },
  high: {
    color: '#ef4444',
    labelKey: 'sleepScience.debtHigh',
    labelDefault: 'High',
    descKey: 'sleepScience.debtHighDesc',
    descDefault: 'Significant sleep debt. Prioritize rest.',
  },
  critical: {
    color: '#dc2626',
    labelKey: 'sleepScience.debtCritical',
    labelDefault: 'Critical',
    descKey: 'sleepScience.debtCriticalDesc',
    descDefault: 'Critical sleep debt. Immediate rest needed.',
  },
};

const SleepDebtRing: React.FC<SleepDebtRingProps> = ({
  data,
  size = 160,
  strokeWidth = 12,
}) => {
  const { t } = useTranslation();
  const status = DEBT_STATUS_MAP[data.debtCategory] || DEBT_STATUS_MAP.low;

  const label = t(status.labelKey, status.labelDefault);
  const description = t(status.descKey, status.descDefault);

  // SVG calculations (270° arc, matching BodyBatteryGauge pattern)
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const totalArc = 0.75; // 270°
  const arcLength = circumference * totalArc;

  // Debt fills inversely (0 debt = full, 8+ = empty)
  const maxDisplayDebt = 8;
  const debtRatio = Math.min(data.currentDebt / maxDisplayDebt, 1);
  const healthRatio = 1 - debtRatio;
  const filledLength = healthRatio * arcLength;

  const rotation = 135;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform"
      >
        {/* Background arc */}
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
          stroke={status.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${circumference}`}
          transform={`rotate(${rotation} ${center} ${center})`}
          className="transition-all duration-700 ease-out"
        />
        {/* Center text - Debt hours */}
        <text
          x={center}
          y={center - 8}
          textAnchor="middle"
          className="fill-foreground font-bold"
          style={{ fontSize: size * 0.22 }}
        >
          {data.currentDebt.toFixed(1)}h
        </text>
        {/* Subtitle */}
        <text
          x={center}
          y={center + 16}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: size * 0.08 }}
        >
          {t('sleepScience.sleepDebt', 'Sleep Debt')}
        </text>
      </svg>

      {/* Status */}
      <div className="text-center mt-2">
        <p className="font-semibold text-lg" style={{ color: status.color }}>
          {label}
        </p>
        <p className="text-sm text-muted-foreground max-w-[200px]">
          {description}
        </p>
        {data.paybackTime > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {t('sleepScience.paybackTime', '~{{nights}} nights to recover', {
              nights: data.paybackTime,
            })}
          </p>
        )}
      </div>
    </div>
  );
};

export default SleepDebtRing;
