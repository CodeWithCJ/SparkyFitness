import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import {
  weightFromKg,
  lengthFromCm,
  cmToFeetInches,
  kgToStonesLbs,
} from '../utils/unitConversions';
import type { CheckInMeasurement } from '../types/measurements';

interface MeasurementsSummaryProps {
  measurements: CheckInMeasurement | undefined;
  weightMode?: 'kg' | 'lbs' | 'st_lbs';
  bodyUnit?: 'cm' | 'inches';
  heightMode?: 'cm' | 'inches' | 'ft_in';
  onPress?: () => void;
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

const MeasurementsSummary: React.FC<MeasurementsSummaryProps> = ({
  measurements,
  weightMode = 'kg',
  bodyUnit = 'cm',
  heightMode = 'cm',
  onPress,
}) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  if (!measurements) return null;

  const rows: { label: string; value: string }[] = [];
  if (measurements.weight != null) {
    rows.push({ label: 'Weight', value: formatWeight(measurements.weight, weightMode) });
  }
  if (measurements.body_fat_percentage != null) {
    rows.push({ label: 'Body fat', value: `${formatNumber(measurements.body_fat_percentage)}%` });
  }
  if (measurements.height != null) {
    rows.push({ label: 'Height', value: formatHeight(measurements.height, heightMode) });
  }
  if (measurements.neck != null) {
    rows.push({ label: 'Neck', value: formatBodyLength(measurements.neck, bodyUnit) });
  }
  if (measurements.waist != null) {
    rows.push({ label: 'Waist', value: formatBodyLength(measurements.waist, bodyUnit) });
  }
  if (measurements.hips != null) {
    rows.push({ label: 'Hips', value: formatBodyLength(measurements.hips, bodyUnit) });
  }
  if (measurements.steps != null) {
    rows.push({ label: 'Steps', value: String(measurements.steps) });
  }

  if (rows.length === 0) return null;

  const header = (
    <View className="flex-row items-center gap-2 mb-2">
      <Icon name="measurements" size={18} color={accentPrimary} />
      <Text className="text-base font-bold text-text-secondary flex-1">Measurements</Text>
      {onPress && <Icon name="chevron-forward" size={14} color={accentPrimary} />}
    </View>
  );

  const body = rows.map((row, index) => (
    <View
      key={row.label}
      className={`flex-row items-center justify-between py-2 ${index > 0 ? 'border-t border-border-subtle' : ''}`}
    >
      <Text className="text-sm text-text-secondary">{row.label}</Text>
      <Text className="text-sm font-semibold text-text-primary">{row.value}</Text>
    </View>
  ));

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm overflow-hidden">
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Edit measurements"
        >
          {header}
        </Pressable>
      ) : (
        header
      )}
      {body}
    </View>
  );
};

export default MeasurementsSummary;
