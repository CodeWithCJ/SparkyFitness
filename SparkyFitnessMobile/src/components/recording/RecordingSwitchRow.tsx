import React from 'react';
import { Text, View } from 'react-native';
import Switch from '../ui/Switch';

interface Props {
  title: string;
  /** One line under the title; left out on the compact mid-run rows. */
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}

/**
 * One recording switch (auto-pause, voice cues) on a card: on the Record
 * screen before Start, and while a phone or watch recording runs.
 */
const RecordingSwitchRow: React.FC<Props> = ({
  title,
  description,
  value,
  onValueChange,
  testID,
}) => (
  <View className="flex-row items-center justify-between bg-surface rounded-xl p-4 mt-4">
    <View className="flex-1 mr-3">
      <Text className="text-text-primary text-sm font-semibold">{title}</Text>
      {description ? (
        <Text className="text-text-secondary text-xs mt-0.5">
          {description}
        </Text>
      ) : null}
    </View>
    <Switch
      testID={testID}
      accessibilityLabel={title}
      value={value}
      onValueChange={onValueChange}
    />
  </View>
);

export default RecordingSwitchRow;
