import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLatestGpsFix } from '../../services/gpsRecordingService';
import { gpsSignalLevel, type GpsSignalLevel } from '../../utils/gpsRecording';

const BAR_COLORS: Record<GpsSignalLevel, string> = {
  good: '#22C55E',
  fair: '#EAB308',
  weak: '#EF4444',
  none: '#9CA3AF',
};

const LIT_BARS: Record<GpsSignalLevel, number> = {
  none: 0,
  weak: 1,
  fair: 2,
  good: 3,
};

/**
 * Three bars and a word for how good the phone's GPS is right now, from the
 * newest fix's accuracy. Re-checked every few seconds so it greys out when
 * fixes stop arriving.
 */
const GpsSignalBadge: React.FC = () => {
  const { t } = useTranslation();
  const fix = useLatestGpsFix();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const level = gpsSignalLevel(fix, Math.max(now, fix?.t ?? 0));
  const label =
    level === 'good'
      ? t('recordActivity.gps.good', { defaultValue: 'GPS good' })
      : level === 'fair'
        ? t('recordActivity.gps.fair', { defaultValue: 'GPS fair' })
        : level === 'weak'
          ? t('recordActivity.gps.weak', { defaultValue: 'GPS weak' })
          : t('recordActivity.gps.none', { defaultValue: 'No GPS' });
  const color = BAR_COLORS[level];
  return (
    <View
      className="flex-row items-center"
      accessible
      accessibilityLabel={label}
      testID="gps-signal-badge"
    >
      <View className="flex-row items-end mr-1.5" style={{ height: 12 }}>
        {[1, 2, 3].map((bar) => (
          <View
            key={bar}
            style={{
              width: 3,
              height: 3 + bar * 3,
              marginRight: bar < 3 ? 2 : 0,
              borderRadius: 1,
              backgroundColor: bar <= LIT_BARS[level] ? color : '#D1D5DB55',
            }}
          />
        ))}
      </View>
      <Text className="text-text-muted text-xs">{label}</Text>
    </View>
  );
};

export default GpsSignalBadge;
