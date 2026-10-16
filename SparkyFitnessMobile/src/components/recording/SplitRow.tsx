import React from 'react';
import { Text, View } from 'react-native';

/** One split or lap: label, pace, and a bar that is longer the faster it was. */
export const SplitRow: React.FC<{
  label: string;
  detail?: string;
  pace: string;
  fraction: number;
  fastest: boolean;
  fastestLabel: string;
}> = ({ label, detail, pace, fraction, fastest, fastestLabel }) => (
  <View className="py-1">
    <View className="flex-row justify-between">
      <Text className="text-text-secondary text-sm">
        {label}
        {detail ? ` · ${detail}` : ''}
      </Text>
      <Text className="text-text-primary text-sm font-semibold">
        {fastest ? `${fastestLabel} · ` : ''}
        {pace}
      </Text>
    </View>
    <View className="h-1.5 rounded-full bg-form-disabled mt-1">
      <View
        className={`h-1.5 rounded-full ${
          fastest ? 'bg-accent-primary' : 'bg-text-muted'
        }`}
        style={{ width: `${Math.round(fraction * 100)}%` }}
      />
    </View>
  </View>
);

/** A headline figure on a card. */
export const Stat: React.FC<{
  label: string;
  value: string;
  unit?: string;
}> = ({ label, value, unit }) => (
  <View className="flex-1 bg-surface rounded-xl p-3 mx-1 items-center">
    <Text className="text-text-muted text-xs mb-1">{label}</Text>
    <Text className="text-text-primary text-xl font-bold">{value}</Text>
    {unit ? <Text className="text-text-muted text-xs">{unit}</Text> : null}
  </View>
);
