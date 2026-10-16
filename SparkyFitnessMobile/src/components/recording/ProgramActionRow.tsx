import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from '../Icon';

interface Props {
  label: string;
  /** A short second line under the label. */
  hint?: string;
  onPress: () => void;
  /** Red text, for an action that throws progress away. */
  destructive?: boolean;
  /** Draw a chevron at the end, for a row that opens another screen. */
  chevron?: boolean;
  testID?: string;
}

/**
 * One tappable row in a list of actions. Rows are stacked inside a
 * `ProgramActionList`, which draws the dividers between them.
 */
const ProgramActionRow: React.FC<Props> = ({
  label,
  hint,
  onPress,
  destructive = false,
  chevron = true,
  testID,
}) => {
  const textMuted = useCSSVariable('--color-text-muted') as string;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      className="flex-row items-center py-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View className="flex-1 mr-3">
        <Text
          className={`text-base font-medium ${
            destructive ? 'text-icon-danger' : 'text-text-primary'
          }`}
        >
          {label}
        </Text>
        {hint ? (
          <Text className="text-text-muted text-xs mt-0.5">{hint}</Text>
        ) : null}
      </View>
      {chevron ? (
        <Icon name="chevron-forward" size={16} color={textMuted} />
      ) : null}
    </Pressable>
  );
};

/** Rows with a hairline between each one. */
export const ProgramActionList: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {rows.map((row, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View className="h-px bg-border-subtle" /> : null}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
};

export default ProgramActionRow;
