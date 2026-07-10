import type React from 'react';
import { useEffect, useState, useMemo, useId } from 'react';
import { cn } from '@/lib/utils';
import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FastingTimerRingProps {
  startTime: Date;
  targetEndTime: Date;
  size?: number;
}

const milestoneHours = [0, 16, 24, 72];

const FastingTimerRing: React.FC<FastingTimerRingProps> = ({
  startTime,
  targetEndTime,
  size = 220,
}) => {
  const { t } = useTranslation();
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalDurationMs = Math.max(
    1,
    targetEndTime.getTime() - startTime.getTime()
  );
  const elapsedMs = Math.max(0, now.getTime() - startTime.getTime());
  const progress = Math.min(100, (elapsedMs / totalDurationMs) * 100);

  const formatTime = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const hoursFasted = elapsedMs / (1000 * 60 * 60);
  const getZone = (hours: number) => {
    if (hours < 4)
      return {
        key: 'starting',
        color: 'from-blue-400 to-blue-600',
        icon: null,
      };
    if (hours < 16)
      return {
        key: 'daily',
        color: 'from-yellow-400 to-orange-500',
        icon: null,
      };
    if (hours < 24)
      return {
        key: 'extended',
        color: 'from-red-400 to-red-600',
        icon: <Flame className="inline h-4 w-4" aria-hidden="true" />,
      };
    if (hours < 72)
      return {
        key: 'long',
        color: 'from-violet-400 to-violet-600',
        icon: <Flame className="inline h-4 w-4" aria-hidden="true" />,
      };
    return {
      key: 'veryLong',
      color: 'from-indigo-400 to-indigo-600',
      icon: <Flame className="inline h-4 w-4" aria-hidden="true" />,
    };
  };

  const zone = useMemo(() => getZone(hoursFasted), [hoursFasted]);
  const duration = formatTime(elapsedMs);
  const progressLabel =
    progress >= 100
      ? t('fasting.goalReached', 'Duration complete')
      : t('fasting.progressPercent', '{{progress}}%', {
          progress: Math.round(progress),
        });
  const zoneLabel = t(`fasting.zones.${zone.key}.name`, zone.key);

  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  const dash = (progress / 100) * circumference;

  // make gradient/filter ids unique so multiple instances don't clash
  const rand = useId();
  const gradId = `fastGradient-${rand}`;
  const shadowId = `ringShadow-${rand}`;

  // knob position
  const angle = (progress / 100) * 2 * Math.PI - Math.PI / 2; // start at top
  const knob = {
    x: size / 2 + radius * Math.cos(angle),
    y: size / 2 + radius * Math.sin(angle),
  };

  // angle helper for milestones (relative to 72h scale)
  const angleForHour = (hour: number) => (hour / 72) * 360 - 90;

  return (
    <div
      role="timer"
      aria-label={t(
        'fasting.timerLabel',
        'Elapsed fasting time: {{duration}}. {{progress}} complete.',
        { duration, progress: progressLabel }
      )}
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="50%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
          <filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="0"
              dy="6"
              stdDeviation="8"
              floodColor="#000"
              floodOpacity="0.12"
            />
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#EEF2F7"
          strokeWidth={14}
          fill="none"
        />

        {/* Gradient progress arc (use dash/space) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradId})`}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${Math.max(1, circumference - dash)}`}
          strokeDashoffset={0}
          fill="none"
          style={{ transition: 'stroke-dasharray 600ms linear, stroke 300ms' }}
          filter={`url(#${shadowId})`}
        />

        {/* Milestone ticks + labels */}
        {milestoneHours.map((h) => {
          const angleDeg = angleForHour(h);
          const rad = (angleDeg * Math.PI) / 180;
          const outer = {
            x: size / 2 + (radius + 10) * Math.cos(rad),
            y: size / 2 + (radius + 10) * Math.sin(rad),
          };
          const inner = {
            x: size / 2 + (radius - 6) * Math.cos(rad),
            y: size / 2 + (radius - 6) * Math.sin(rad),
          };
          return (
            <line
              key={h}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#E6E7E9"
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}

        {milestoneHours.map((h) => {
          const angleDeg = angleForHour(h);
          const rad = (angleDeg * Math.PI) / 180;
          const labelPos = {
            x: size / 2 + (radius + 26) * Math.cos(rad),
            y: size / 2 + (radius + 26) * Math.sin(rad),
          };
          return (
            <text
              key={`label-${h}`}
              x={labelPos.x}
              y={labelPos.y}
              fontSize={10}
              fill="#64748B"
              textAnchor="middle"
              alignmentBaseline="middle"
              style={{
                transformOrigin: `${labelPos.x}px ${labelPos.y}px`,
                transform: `rotate(${-angleDeg}deg)`,
              }}
            >
              {t('fasting.hourMarker', '{{hours}} hr', { hours: h })}
            </text>
          );
        })}

        {/* Knob marker at arc end + pulse */}
        <g
          style={{
            transition: 'transform 300ms linear',
            transform: `translate(${knob.x}px, ${knob.y}px)`,
          }}
        >
          <circle
            r={12}
            className="opacity-20 animate-pulse"
            cx={0}
            cy={0}
            fill="#60A5FA"
          />
          <circle
            r={6}
            cx={0}
            cy={0}
            fill="#fff"
            stroke={`url(#${gradId})`}
            strokeWidth={3}
          />
        </g>
      </svg>

      <div className="absolute z-10 flex flex-col items-center px-4 text-center">
        <div
          dir="ltr"
          className="font-mono text-2xl font-extrabold tracking-tight"
        >
          {duration}
        </div>
        <div
          className={cn(
            'mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white',
            `bg-gradient-to-r ${zone.color}`
          )}
        >
          {zone.icon}
          <span>{zoneLabel}</span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {progressLabel}
        </div>
      </div>
    </div>
  );
};

export default FastingTimerRing;
