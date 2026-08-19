import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { MeasurementIcons, type MeasurementKind } from './icons/measurements';
import {
  weightFromKg,
  lengthFromCm,
  cmToFeetInches,
  kgToStonesLbs,
} from '../utils/unitConversions';
import type { CheckInMeasurement } from '../types/measurements';
import type { CustomMeasurementEntry } from '../types/customMeasurements';
import { isManualSource } from '../utils/customMeasurementsForm';

interface MeasurementsSummaryProps {
  measurements: CheckInMeasurement | undefined;
  weightMode?: 'kg' | 'lbs' | 'st_lbs';
  bodyUnit?: 'cm' | 'inches';
  heightMode?: 'cm' | 'inches' | 'ft_in';
  onPress?: () => void;
  customMeasurements?: CustomMeasurementEntry[];
}

const formatNumber = (value: number): string => String(Math.round(value * 10) / 10);

const formatWeight = (kg: number, mode: 'kg' | 'lbs' | 'st_lbs'): string => {
  if (mode === 'st_lbs') {
    const { stones, lbs } = kgToStonesLbs(kg);
    return `${stones}st ${formatNumber(lbs)}lb`;
  }
  return `${formatNumber(weightFromKg(kg, mode))} ${mode}`;
};

const formatHeight = (cm: number, mode: 'cm' | 'inches' | 'ft_in'): string => {
  if (mode === 'ft_in') {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}'${formatNumber(inches)}"`;
  }
  const unit = mode === 'cm' ? 'cm' : 'in';
  return `${formatNumber(lengthFromCm(cm, mode))} ${unit}`;
};

const formatBodyLength = (cm: number, unit: 'cm' | 'inches'): string => {
  const suffix = unit === 'cm' ? 'cm' : 'in';
  return `${formatNumber(lengthFromCm(cm, unit))} ${suffix}`;
};

const formatCustomValue = (
  value: string,
  dataType: string | null | undefined,
): string => {
  if (dataType !== 'numeric') {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed === '') return value;

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? String(numericValue) : value;
};

const MeasurementsSummary: React.FC<MeasurementsSummaryProps> = ({
  measurements,
  weightMode = 'kg',
  bodyUnit = 'cm',
  heightMode = 'cm',
  onPress,
  customMeasurements,
}) => {
  const [accentPrimary, iconColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-decorative',
  ]) as [string, string];

  const { t } = useTranslation();

  if (!measurements && (!customMeasurements || customMeasurements.length === 0)) return null;

  const localizedMeasurement = (key: 'weight' | 'bodyFatPercentage' | 'height' | 'neck' | 'waist' | 'hips' | 'steps') => {
    switch (key) {
      case 'weight': return t('measurements.fields.weight', { defaultValue: 'Weight' });
      case 'bodyFatPercentage': return t('measurements.fields.bodyFatPercentage', { defaultValue: 'Body fat %' });
      case 'height': return t('measurements.fields.height', { defaultValue: 'Height' });
      case 'neck': return t('measurements.fields.neck', { defaultValue: 'Neck' });
      case 'waist': return t('measurements.fields.waist', { defaultValue: 'Waist' });
      case 'hips': return t('measurements.fields.hips', { defaultValue: 'Hips' });
      case 'steps': return t('measurements.fields.steps', { defaultValue: 'Steps' });
    }
  };
  const rows: { kind: MeasurementKind | 'custom'; label: string; value: string }[] = [];
  if (measurements?.weight != null) rows.push({ kind: 'weight', label: localizedMeasurement('weight'), value: formatWeight(measurements.weight, weightMode) });
  if (measurements?.body_fat_percentage != null) rows.push({ kind: 'body_fat_percentage', label: localizedMeasurement('bodyFatPercentage'), value: `${formatNumber(measurements.body_fat_percentage)}%` });
  if (measurements?.height != null) rows.push({ kind: 'height', label: localizedMeasurement('height'), value: formatHeight(measurements.height, heightMode) });
  if (measurements?.neck != null) rows.push({ kind: 'neck', label: localizedMeasurement('neck'), value: formatBodyLength(measurements.neck, bodyUnit) });
  if (measurements?.waist != null) rows.push({ kind: 'waist', label: localizedMeasurement('waist'), value: formatBodyLength(measurements.waist, bodyUnit) });
  if (measurements?.hips != null) rows.push({ kind: 'hips', label: localizedMeasurement('hips'), value: formatBodyLength(measurements.hips, bodyUnit) });
  if (measurements?.steps != null) rows.push({ kind: 'steps', label: localizedMeasurement('steps'), value: String(measurements.steps) });

  if (customMeasurements) {
    // Diary tiles only show MANUAL custom entries (strict source contract).
    // Health-synced entries (healthkit / Health Connect / garmin / oura /
    // fitbit / polar / withings / ...) are filtered before presentation so
    // they never render as editable summary tiles. Ordinary built-in
    // measurements are untouched.
    for (const entry of customMeasurements) {
      if (!isManualSource(entry.source)) continue;
      const cat = entry.custom_categories;
      const label = cat?.display_name ?? cat?.name ?? 'Measurement';
      const suffix = cat?.measurement_type ? ` ${cat.measurement_type}` : '';
      rows.push({
        kind: 'custom',
        label,
        value: `${formatCustomValue(entry.value, cat?.data_type)}${suffix}`,
      });
    }
  }

  if (rows.length === 0) return null;

  const header = (
    <View className="flex-row items-center gap-2 mb-2 px-1">
      <Text className="text-base font-bold text-text-secondary flex-1">{t('measurements.title', { defaultValue: 'Measurements' })}</Text>
      {onPress && <Icon name="add" size={14} color={accentPrimary} />}
    </View>
  );

  const tiles = rows.map((row, idx) => {
    const IconComponent = row.kind !== 'custom' ? MeasurementIcons[row.kind] : null;
    return (
      <View key={row.kind === 'custom' ? `custom-${idx}` : row.kind} className="w-[48%] mb-2">
        <View className="bg-surface rounded-xl py-3 px-3 shadow-sm flex-row items-center">
          {IconComponent ? (
            <IconComponent size={56} color={iconColor} accentColor={accentPrimary} />
          ) : (
            <Icon name="chart-bar" size={32} color={accentPrimary} />
          )}
          <View className="flex-1 ml-2 items-center">
            <Text className="text-lg font-bold text-text-primary" numberOfLines={1}>
              {row.value}
            </Text>
            <Text className="text-sm text-text-secondary" numberOfLines={1}>
              {row.label}
            </Text>
          </View>
        </View>
      </View>
    );
  });

  const content = (
    <>
      {header}
      <View className="flex-row flex-wrap justify-between">{tiles}</View>
    </>
  );

  return (
    <View className="mb-2">
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t('measurements.edit', { defaultValue: 'Edit measurements' })}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
    </View>
  );
};

export default MeasurementsSummary;
