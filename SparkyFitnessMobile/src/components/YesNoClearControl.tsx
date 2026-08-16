import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';

interface YesNoClearControlProps {
  /**
   * Tri-state value: '' (no entry), 'true', or 'false'. A missing entry is
   * deliberately NOT shown as "No" — all options render unselected.
   */
  value: string;
  onChange: (value: '' | 'true' | 'false') => void;
  labels: { yes: string; no: string; clear: string };
}

const YesNoClearControl: React.FC<YesNoClearControlProps> = ({
  value,
  onChange,
  labels,
}) => {
  const [accentPrimary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
  ]) as [string, string];

  const renderOption = (
    label: string,
    selected: boolean,
    onPress: () => void,
    disabled = false,
  ) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      className={`flex-1 rounded-lg border px-3 py-2 items-center ${disabled ? 'opacity-40' : ''}`}
      style={{
        borderColor: selected ? accentPrimary : borderSubtle,
        backgroundColor: selected ? accentPrimary : 'transparent',
      }}
    >
      <Text
        className={`text-sm ${selected ? 'text-white font-semibold' : 'text-text-secondary'}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View className="flex-row gap-2">
      {renderOption(labels.yes, value === 'true', () => onChange('true'))}
      {renderOption(labels.no, value === 'false', () => onChange('false'))}
      {renderOption(labels.clear, false, () => onChange(''), value === '')}
    </View>
  );
};

export default YesNoClearControl;
