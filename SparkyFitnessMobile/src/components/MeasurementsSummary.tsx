import React from 'react';
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
  const [accentPrimary, iconColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-decorative',
  ]) as [string, string];

  if (!measurements) return null;

  const rows: { kind: MeasurementKind; label: string; value: string }[] = [];
  if (measurements.weight != null) {
    rows.push({ kind: 'weight', label: 'Weight', value: formatWeight(measurements.weight, weightMode) });
  }
  if (measurements.body_fat_percentage != null) {
    rows.push({
      kind: 'body_fat_percentage',
      label: 'Body fat',
      value: `${formatNumber(measurements.body_fat_percentage)}%`,
    });
  }
  if (measurements.height != null) {
    rows.push({ kind: 'height', label: 'Height', value: formatHeight(measurements.height, heightMode) });
  }
  if (measurements.neck != null) {
    rows.push({ kind: 'neck', label: 'Neck', value: formatBodyLength(measurements.neck, bodyUnit) });
  }
  if (measurements.waist != null) {
    rows.push({ kind: 'waist', label: 'Waist', value: formatBodyLength(measurements.waist, bodyUnit) });
  }
  if (measurements.hips != null) {
    rows.push({ kind: 'hips', label: 'Hips', value: formatBodyLength(measurements.hips, bodyUnit) });
  }
  if (measurements.steps != null) {
    rows.push({ kind: 'steps', label: 'Steps', value: String(measurements.steps) });
  }

  if (rows.length === 0) return null;

  const header = (
    <View className="flex-row items-center gap-2 mb-2 px-1">
      <Text className="text-base font-bold text-text-secondary flex-1">Measurements</Text>
      {onPress && <Icon name="add" size={14} color={accentPrimary} />}
    </View>
  );

  const tiles = rows.map((row) => {
    const IconComponent = MeasurementIcons[row.kind];
    const tile = (
      <View className="bg-surface rounded-xl py-3 px-3 shadow-sm flex-row items-center">
        <IconComponent size={56} color={iconColor} accentColor={accentPrimary} />
        <View className="flex-1 ml-2 items-center">
          <Text className="text-lg font-bold text-text-primary" numberOfLines={1}>
            {row.value}
          </Text>
          <Text className="text-sm text-text-secondary" numberOfLines={1}>
            {row.label}
          </Text>
        </View>
      </View>
    );

    return (
      <View key={row.kind} className="w-[48%] mb-2">
        {onPress ? (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${row.label.toLowerCase()}`}
          >
            {tile}
          </Pressable>
        ) : (
          tile
        )}
      </View>
    );
  });

  return (
    <View className="my-2">
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
      <View className="flex-row flex-wrap justify-between">{tiles}</View>
    </View>
  );
};

export default MeasurementsSummary;
