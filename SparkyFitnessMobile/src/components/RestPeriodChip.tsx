import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

export const DEFAULT_REST_SEC = 90;

/** Format a rest duration as `m:ss` when ≥ 60s, otherwise `Ns`. */
export function formatRest(seconds: number | null | undefined): string {
  const value = seconds ?? DEFAULT_REST_SEC;
  if (value < 60) return `${value}s`;
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface RestPeriodChipProps {
  value: number | null | undefined;
  onPress?: () => void;
  readOnly?: boolean;
}

function RestPeriodChip({ value, onPress, readOnly = false }: RestPeriodChipProps) {
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];

  const content = (
    <>
      <Icon name="timer" size={14} color={textMuted} />
      <Text className="text-sm text-text-muted ml-1">Rest · {formatRest(value)}</Text>
    </>
  );

  if (readOnly) {
    return <View className="flex-row items-center">{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-raised rounded-full py-1 px-2.5"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {content}
    </Pressable>
  );
}

export default React.memo(RestPeriodChip);
