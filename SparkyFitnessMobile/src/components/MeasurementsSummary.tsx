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
import {
  formatMobileNumber,
  localizeServingUnit,
  mobileT,
} from '../localization';

interface MeasurementsSummaryProps {
  measurements: CheckInMeasurement | undefined;
  weightMode?: 'kg' | 'lbs' | 'st_lbs';
  bodyUnit?: 'cm' | 'inches';
  heightMode?: 'cm' | 'inches' | 'ft_in';
  onPress?: () => void;
}

const formatNumber = (value: number): string => formatMobileNumber(value);

const formatWeight = (kg: number, mode: 'kg' | 'lbs' | 'st_lbs'): string => {
  if (mode === 'st_lbs') {
    const { stones, lbs } = kgToStonesLbs(kg);
    return `${formatMobileNumber(stones)} ${mobileT('units.stone')} ${formatNumber(lbs)} ${mobileT('units.lb')}`;
  }
  return `${formatNumber(weightFromKg(kg, mode))} ${localizeServingUnit(mode)}`;
};

const formatHeight = (cm: number, mode: 'cm' | 'inches' | 'ft_in'): string => {
  if (mode === 'ft_in') {
    const { feet, inches } = cmToFeetInches(cm);
    return `${formatMobileNumber(feet)} ${mobileT('units.ft')} ${formatNumber(inches)} ${mobileT('units.in')}`;
  }
  const unit = mode === 'cm' ? 'cm' : 'in';
  return `${formatNumber(lengthFromCm(cm, mode))} ${localizeServingUnit(unit)}`;
};

const formatBodyLength = (cm: number, unit: 'cm' | 'inches'): string => {
  const suffix = unit === 'cm' ? 'cm' : 'in';
  return `${formatNumber(lengthFromCm(cm, unit))} ${localizeServingUnit(suffix)}`;
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
    rows.push({
      kind: 'weight',
      label: mobileT('measurement.weight'),
      value: formatWeight(measurements.weight, weightMode),
    });
  }
  if (measurements.body_fat_percentage != null) {
    rows.push({
      kind: 'body_fat_percentage',
      label: mobileT('measurement.bodyFat'),
      value: `${formatNumber(measurements.body_fat_percentage)}٪`,
    });
  }
  if (measurements.height != null) {
    rows.push({
      kind: 'height',
      label: mobileT('measurement.height'),
      value: formatHeight(measurements.height, heightMode),
    });
  }
  if (measurements.neck != null) {
    rows.push({
      kind: 'neck',
      label: mobileT('measurement.neck'),
      value: formatBodyLength(measurements.neck, bodyUnit),
    });
  }
  if (measurements.waist != null) {
    rows.push({
      kind: 'waist',
      label: mobileT('measurement.waist'),
      value: formatBodyLength(measurements.waist, bodyUnit),
    });
  }
  if (measurements.hips != null) {
    rows.push({
      kind: 'hips',
      label: mobileT('measurement.hips'),
      value: formatBodyLength(measurements.hips, bodyUnit),
    });
  }
  if (measurements.steps != null) {
    rows.push({
      kind: 'steps',
      label: mobileT('measurement.steps'),
      value: formatMobileNumber(measurements.steps, {
        maximumFractionDigits: 0,
      }),
    });
  }

  if (rows.length === 0) return null;

  const header = (
    <View className="flex-row items-center gap-2 mb-2 px-1">
      <Text className="text-base font-bold text-text-secondary flex-1">
        {mobileT('diary.measurements')}
      </Text>
      {onPress && <Icon name="add" size={14} color={accentPrimary} />}
    </View>
  );

  const tiles = rows.map((row) => {
    const IconComponent = MeasurementIcons[row.kind];
    return (
      <View key={row.kind} className="w-[48%] mb-2">
        <View className="bg-surface rounded-xl py-3 px-3 shadow-sm flex-row items-center">
          <IconComponent size={56} color={iconColor} accentColor={accentPrimary} />
          <View className="flex-1 items-center" style={{ marginStart: 8 }}>
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
          accessibilityLabel={mobileT('diary.editMeasurements')}
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
