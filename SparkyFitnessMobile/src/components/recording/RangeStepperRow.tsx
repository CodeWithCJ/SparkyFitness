import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Icon from '../Icon';

interface Props {
  label: string;
  /** The value as shown, e.g. "5:00/km" or "150 bpm". */
  valueText: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
  /** Test ids are `${testIDPrefix}-down`, `-value` and `-up`. */
  testIDPrefix: string;
}

/** One edge of a target range: a label, a value, and minus and plus buttons. */
const RangeStepperRow: React.FC<Props> = ({
  label,
  valueText,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
  testIDPrefix,
}) => (
  <View className="flex-row items-center justify-between mt-3">
    <Text className="text-text-secondary text-sm">{label}</Text>
    <View className="flex-row items-center">
      <TouchableOpacity
        testID={`${testIDPrefix}-down`}
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        className="w-9 h-9 items-center justify-center rounded-full bg-raised"
        onPress={onDecrease}
      >
        <Icon name="remove" size={18} />
      </TouchableOpacity>
      <Text
        testID={`${testIDPrefix}-value`}
        className="text-text-primary text-base font-semibold w-24 text-center"
      >
        {valueText}
      </Text>
      <TouchableOpacity
        testID={`${testIDPrefix}-up`}
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        className="w-9 h-9 items-center justify-center rounded-full bg-raised"
        onPress={onIncrease}
      >
        <Icon name="add" size={18} />
      </TouchableOpacity>
    </View>
  </View>
);

export default RangeStepperRow;
