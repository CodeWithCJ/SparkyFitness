import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';
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
import { formatLocalizedNumber } from '../localization';

interface MeasurementsSummaryProps {
  measurements: CheckInMeasurement | undefined;
  weightMode?: 'kg' | 'lbs' | 'st_lbs';
  bodyUnit?: 'cm' | 'inches';
  heightMode?: 'cm' | 'inches' | 'ft_in';
  onPress?: () => void;
  customMeasurements?: CustomMeasurementEntry[];
}

const formatNumber = (value: number): string =>
  formatLocalizedNumber(Math.round(value * 10) / 10, { maximumFractionDigits: 1 });

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

const MeasurementsSummary: React.FC<MeasurementsSummaryProps> = ({
  measurements,
  weightMode = 'kg',
  bodyUnit = 'cm',
  heightMode = 'cm',
  onPress,
  customMeasurements,
}) => {
  const { t } = useTranslation();
  const [accentPrimary, iconColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-decorative',
  ]) as [string, string];

  if (!measurements && (!customMeasurements || customMeasurements.length === 0)) return null;

  const rows: { kind: MeasurementKind | 'custom'; label: string; value: string }[] = [];
  if (measurements?.weight != null) {
    rows.push({ kind: 'weight', label: t('measurements.weight'), value: formatWeight(measurements.weight, weightMode) });
  }
  if (measurements?.body_fat_percentage != null) {
    rows.push({
      kind: 'body_fat_percentage',
      label: t('measurements.bodyFatShort'),
      value: `${formatNumber(measurements.body_fat_percentage)}%`,
    });
  }
  if (measurements?.height != null) {
    rows.push({ kind: 'height', label: t('measurements.height'), value: formatHeight(measurements.height, heightMode) });
  }
  if (measurements?.neck != null) {
    rows.push({ kind: 'neck', label: t('measurements.neck'), value: formatBodyLength(measurements.neck, bodyUnit) });
  }
  if (measurements?.waist != null) {
    rows.push({ kind: 'waist', label: t('measurements.waist'), value: formatBodyLength(measurements.waist, bodyUnit) });
  }
  if (measurements?.hips != null) {
    rows.push({ kind: 'hips', label: t('measurements.hips'), value: formatBodyLength(measurements.hips, bodyUnit) });
  }
  if (measurements?.steps != null) {
    rows.push({ kind: 'steps', label: t('measurements.steps'), value: formatLocalizedNumber(measurements.steps) });
  }

  if (customMeasurements) {
    for (const entry of customMeasurements) {
      const cat = entry.custom_categories;
      const label = cat?.display_name ?? cat?.name ?? t('measurements.fallbackLabel');
      const suffix = cat?.measurement_type ? ` ${cat.measurement_type}` : '';
      rows.push({ kind: 'custom', label, value: `${entry.value}${suffix}` });
    }
  }

  if (rows.length === 0) return null;

  const header = (
    <View className="flex-row items-center gap-2 mb-2 px-1">
      <Text className="text-base font-bold text-text-secondary flex-1">{t('measurements.title')}</Text>
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
           accessibilityLabel={t('measurements.edit')}
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
